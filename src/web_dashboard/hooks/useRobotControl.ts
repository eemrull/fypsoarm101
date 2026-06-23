/**
 * Robot control hook using rosbridge WebSocket (replaces feetech.js Web Serial)
 *
 * This hook maintains a unified public robot control API
 * so all downstream components (KeyboardControl, ChatControl, RecordControl)
 * continue working unchanged.
 *
 * Communication: Browser â†’ rosbridge WebSocket â†’ ROS2 â†’ micro-ROS â†’ Teensy â†’ Servos
 */

import {
  useState,
  useCallback,
  useEffect,
  useRef,
  type MutableRefObject,
} from "react";
import {
  getRosbridgeClient,
  resetRosbridgeClient,
  type RosbridgeClient,
  type RosbridgeConnectionState,
} from "@/lib/rosbridge";
import { degreesToRadians } from "@/lib/utils";
import { RECORDING_INTERVAL } from "@/config/uiConfig";
import { ROSBRIDGE_URL } from "@/config/network";
import {
  useRobotProfileStore,
  type RobotProfileState,
} from "@/store/useRobotProfileStore";
import { useShallow } from "zustand/react/shallow";
import {
  useRobotStateStore,
  type RobotState,
  type RobotJointState,
} from "@/store/useRobotStateStore";
import { useMetricsStore, type CommandFeedbackSample } from "@/store/useMetricsStore";
import { buildKinematicJointOrder } from "@/lib/kinematics/runtimeConfig";
import {
  BRIDGE_HEALTH_TOPIC,
  CONFIG_STATUS_TOPIC,
  CORE_TELEMETRY_TOPICS,
  FEEDBACK_EPSILON_DEG,
  FEEDBACK_UI_RATE_HZ,
  FIRMWARE_CONFIG_TOPIC,
  getUtf8ByteLength,
  JOINT_COMMAND_TOPIC,
  JOINT_UPDATE_EPSILON,
  MAX_FIRMWARE_CONFIG_BYTES,
  MAX_RECORD_FRAMES,
  normalizeAndValidateActuatorMap,
  parseBridgeHealthMessage,
  PID_RESPONSE_TOPIC,
  PUBLISH_RATE_HZ,
  SERVO_FEEDBACK_TOPIC,
  type BridgeHealthStatus,
} from "./robotControlUtils";

type JointDetails = {
  name: string;
  servoId: number;
  jointType: "revolute" | "continuous";
  limit?: {
    lower?: number;
    upper?: number;
  };
};

export type JointState = RobotJointState;

export type UpdateJointDegrees = (
  servoId: number,
  value: number,
) => Promise<void>;
export type UpdateJointSpeed = (
  servoId: number,
  speed: number,
) => Promise<void>;
export type UpdateJointsDegrees = (
  updates: { servoId: number; value: number }[],
) => Promise<void>;
export type UpdateJointsSpeed = (
  updates: { servoId: number; speed: number }[],
) => Promise<void>;

export type MoveJointsSmoothly = (
  updates: { servoId: number; value: number }[],
  durationMs?: number,
  startFromFeedback?: boolean,
) => Promise<void>;

export type RecordData = number[][]; // Array of arrays representing servo positions/speeds

type ConfigStatusLevel = "idle" | "pending" | "ok" | "error";
type ConnectionState =
  | "idle"
  | "connecting"
  | "connected"
  | "disconnecting"
  | "error";
type PublisherWorkerStatus =
  | "connecting"
  | "connected"
  | "reconnecting"
  | "disconnected"
  | "error";
type PublisherWorkerMessage =
  | {
      type: "status";
      state: PublisherWorkerStatus;
      detail?: string;
    }
  | {
      type: "topic-message";
      topic: string;
      msg: Record<string, unknown>;
    };
type FirmwareConfigStatus = {
  level: ConfigStatusLevel;
  message: string;
};

type TopicCallback = (msg: Record<string, unknown>) => void;
export function useRobotControl(
  initialJointDetails: JointDetails[],
  urdfInitJointAngles?: { [key: string]: number },
) {
  const [isConnected, setIsConnected] = useState(false);
  const [connectionState, setConnectionState] =
    useState<ConnectionState>("idle");
  const [connectionMessage, setConnectionMessage] = useState("Disconnected");
  const [firmwareConfigStatus, setFirmwareConfigStatus] =
    useState<FirmwareConfigStatus>({
      level: "idle",
      message: "No configuration sent yet.",
    });
  const [bridgeHealth, setBridgeHealth] = useState<BridgeHealthStatus | null>(
    null,
  );
  const [profileValidationErrors, setProfileValidationErrors] = useState<
    string[]
  >([]);
  const [profileValidationWarnings, setProfileValidationWarnings] = useState<
    string[]
  >([]);
  const [jointDetails, setJointDetails] = useState(initialJointDetails);
  const profileActuators = useRobotProfileStore(
    useShallow((state: RobotProfileState) => state.actuators),
  );

  // Recording state
  const [isRecording, setIsRecording] = useState(false);
  const [recordData, setRecordData] = useState<RecordData>([]);
  const recordingIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Keyframe Studio State
  const [isKeyframePlaying, setIsKeyframePlaying] = useState(false);
  const keyframeAnimationIdRef = useRef(0);

  const activeRecordingDataRef = useRef<RecordData>([]);
  const connectionStateRef = useRef<ConnectionState>("idle");
  const isConnectedRef = useRef(false);
  const feedbackModeRef = useRef<"throttled" | "raw">("throttled");

  // Keep connection refs in sync with state for stale-closure-safe guards
  useEffect(() => {
    isConnectedRef.current = isConnected;
  }, [isConnected]);
  useEffect(() => {
    connectionStateRef.current = connectionState;
  }, [connectionState]);

  // Dedicated background publisher worker.
  // The worker owns its own WebSocket + timer so command I/O does not depend
  // on the main thread event loop when the tab is hidden.
  const commandPublisherWorkerRef = useRef<Worker | null>(null);
  const fallbackPublishTimerRef = useRef<ReturnType<typeof setInterval> | null>(
    null,
  );
  const firstFeedbackTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const configAckTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const feedbackCallbackRef = useRef<TopicCallback | null>(null);
  const configStatusCallbackRef = useRef<TopicCallback | null>(null);
  const bridgeHealthCallbackRef = useRef<TopicCallback | null>(null);
  const enablePublishingRef = useRef<() => void>(() => {});
  const handleServoFeedbackRef = useRef<TopicCallback>(() => {});
  const handleConfigStatusRef = useRef<TopicCallback>(() => {});
  const handleBridgeHealthRef = useRef<TopicCallback>(() => {});
  const handlePidResponseRef = useRef<TopicCallback>(() => {});
  const pidResponseBridgeCallbackRef = useRef<TopicCallback | null>(null);
  const pidResponseListenersRef = useRef<
    Set<(msg: Record<string, unknown>) => void>
  >(new Set());
  const bridgeConnectionUnsubscribeRef = useRef<(() => void) | null>(null);
  const configPayloadRef = useRef<string | null>(null);
  const configPayloadBytesRef = useRef<number>(0);
  const lastBridgeStateRef = useRef<RosbridgeConnectionState | null>(null);
  const lastFeedbackUiUpdateMsRef = useRef(0);
  const hasReceivedFirstFeedbackRef = useRef(false);

  // Animation cancellation token
  const animationIdRef = useRef<number>(0);

  // We DO NOT subscribe to the store state here! Subscribing here would cause
  // RobotLoader (the caller) to re-render 60 times a second.
  // We only grab the non-reactive setters and getters.
  const setJointStates = useRobotStateStore(
    (state: RobotState) => state.setJointStates,
  );
  const getJointStates = useRobotStateStore(
    (state: RobotState) => state.getJointStates,
  );
  const setFeedbackStates = useRobotStateStore(
    (state: RobotState) => state.setFeedbackStates,
  );

  const jointDetailsRef = useRef(jointDetails);
  jointDetailsRef.current = jointDetails;

  const getCommandJointOrder = useCallback(
    (details: JointDetails[] = jointDetailsRef.current) =>
      buildKinematicJointOrder(details.map((joint) => joint.name), details),
    [],
  );

  const buildInitialJointStates = useCallback(
    (): JointState[] =>
      jointDetails.map((j: JointDetails) => ({
        jointType: j.jointType,
        degrees:
          j.jointType === "revolute"
            ? (urdfInitJointAngles?.[j.name] ?? 0)
            : undefined,
        speed: j.jointType === "continuous" ? 0 : undefined,
        servoId: j.servoId,
        name: j.name,
        limit: j.limit,
      })),
    [jointDetails, urdfInitJointAngles],
  );

  const clearConfigAckTimeout = useCallback(() => {
    if (configAckTimeoutRef.current) {
      clearTimeout(configAckTimeoutRef.current);
      configAckTimeoutRef.current = null;
    }
  }, []);

  const clearFirstFeedbackTimeout = useCallback(() => {
    if (firstFeedbackTimeoutRef.current) {
      clearTimeout(firstFeedbackTimeoutRef.current);
      firstFeedbackTimeoutRef.current = null;
    }
  }, []);

  const clearBridgeConnectionListener = useCallback(() => {
    if (bridgeConnectionUnsubscribeRef.current) {
      bridgeConnectionUnsubscribeRef.current();
      bridgeConnectionUnsubscribeRef.current = null;
    }
  }, []);

  const publishFirmwareConfig = useCallback(
    (client: RosbridgeClient, reason: "initial" | "reconnect") => {
      const payload = configPayloadRef.current;
      if (!payload) return;

      const bytes = configPayloadBytesRef.current;
      setFirmwareConfigStatus({
        level: "pending",
        message:
          reason === "initial"
            ? "Configuration sent. Waiting for firmware acknowledgement..."
            : "ROSBridge reconnected. Re-sending configuration to firmware...",
      });

      // Always publish the config directly via the main-thread RosbridgeClient.
      // The background commandPublisher worker is dedicated to high-frequency
      // joint command streaming only — it does NOT handle config payloads.
      client.advertise(FIRMWARE_CONFIG_TOPIC, "std_msgs/msg/String");
      client.publish(FIRMWARE_CONFIG_TOPIC, { data: payload });

      clearConfigAckTimeout();
      configAckTimeoutRef.current = setTimeout(() => {
        setFirmwareConfigStatus({
          level: "error",
          message: "No firmware acknowledgement received within 4s.",
        });
      }, 4000);

      console.log(
        `[useRobotControl] ${reason === "initial" ? "Broadcasted" : "Re-broadcasted"} FYP2 Config to ${FIRMWARE_CONFIG_TOPIC} (${bytes} bytes)`,
      );
    },
    [clearConfigAckTimeout],
  );

  const attachBridgeConnectionListener = useCallback(
    (client: RosbridgeClient) => {
      clearBridgeConnectionListener();
      bridgeConnectionUnsubscribeRef.current = client.onConnectionStateChange(
        (state: RosbridgeConnectionState, detail?: string) => {
          const previousState = lastBridgeStateRef.current;
          lastBridgeStateRef.current = state;

          if (state === "connected") {
            setIsConnected(true);
            setConnectionState("connected");
            setConnectionMessage("Connected to ROSBridge.");
            if (previousState === "reconnecting") {
              setBridgeHealth(null);
              publishFirmwareConfig(client, "reconnect");
            }
            return;
          }

          if (state === "connecting") {
            if (connectionStateRef.current === "disconnecting") return;
            setConnectionState("connecting");
            setConnectionMessage("Connecting to ROSBridge...");
            return;
          }

          if (state === "reconnecting") {
            if (connectionStateRef.current === "disconnecting") return;
            setIsConnected(false);
            setConnectionState("connecting");
            setConnectionMessage(
              "ROSBridge disconnected. Attempting automatic reconnect...",
            );
            return;
          }

          if (state === "error") {
            if (connectionStateRef.current === "disconnecting") return;
            setIsConnected(false);
            setConnectionState("error");
            setConnectionMessage(detail || "ROSBridge connection error.");
            return;
          }

          // disconnected
          if (connectionStateRef.current === "disconnecting") return;
          setIsConnected(false);
          setConnectionState("idle");
          setConnectionMessage("Disconnected");
        },
      );
    },
    [clearBridgeConnectionListener, publishFirmwareConfig],
  );

  useEffect(() => {
    const validation = normalizeAndValidateActuatorMap(
      profileActuators as Record<string, Record<string, unknown>>,
      getCommandJointOrder(),
    );
    setProfileValidationErrors(validation.errors);
    setProfileValidationWarnings(validation.warnings);
  }, [getCommandJointOrder, profileActuators]);

  useEffect(() => {
    setJointStates((prev) => {
      if (prev && prev.length > 0) {
        const prevMap = new Map(prev.map((p) => [p.name, p]));
        return buildInitialJointStates().map((j) => {
          const p = prevMap.get(j.name);
          return {
            ...j,
            degrees: p?.degrees ?? j.degrees,
            speed: p?.speed ?? j.speed,
          };
        });
      }
      return buildInitialJointStates();
    });
    // We intentionally do not reset feedbackStates here to avoid clearing real physical data
  }, [buildInitialJointStates, setJointStates]);

  const buildCommandValues = useCallback((states: JointState[]) => {
    const orderedJointNames = getCommandJointOrder();
    const stateByJoint = new Map(
      states.map((state: JointState) => [state.name, state] as const),
    );

    return orderedJointNames.map((jointName) => {
      const state = stateByJoint.get(jointName);
      if (!state) return 0;
      if (state.jointType === "revolute" && typeof state.degrees === "number") {
        const actuator = useRobotProfileStore.getState().actuators[state.name];
        const sagOffset = actuator?.sagOffsetDeg ?? 0;
        const targetDeg = state.degrees - sagOffset;
        return degreesToRadians(targetDeg - 180.0);
      }
      if (state.jointType === "continuous" && typeof state.speed === "number") {
        return state.speed;
      }
      return 0;
    });
  }, [getCommandJointOrder]);

  // Fallback path for browsers without Worker support.
  const doPublishFallback = useCallback(() => {
    const client = getRosbridgeClient();
    if (!client.isConnected) return;

    const states = getJointStates();
    const values = buildCommandValues(states);

    client.publishJointCommands(JOINT_COMMAND_TOPIC, values);
  }, [buildCommandValues, getJointStates]);

  useEffect(() => {
    handleServoFeedbackRef.current = (msg: Record<string, unknown>) => {
      const data = msg.data;
      if (!Array.isArray(data)) return;
      const commandJointOrder = getCommandJointOrder();
      const orderIndex = new Map(
        commandJointOrder.map((jointName, index) => [jointName, index] as const),
      );

      const now = performance.now();
      const shouldThrottle = feedbackModeRef.current === "throttled";
      if (shouldThrottle && now - lastFeedbackUiUpdateMsRef.current < 1000 / FEEDBACK_UI_RATE_HZ) {
        return;
      }
      lastFeedbackUiUpdateMsRef.current = now;

      // One-time sync: snap joint command states to match physical arm on first feedback.
      if (!hasReceivedFirstFeedbackRef.current) {
        hasReceivedFirstFeedbackRef.current = true;
        clearFirstFeedbackTimeout();
        console.log(
          "[useRobotControl] First feedback received — syncing sliders to arm position",
        );
        setJointStates((prev: JointState[]) =>
          prev.map((state: JointState) => {
            if (state.jointType !== "revolute") return state;
            const idx = orderIndex.get(state.name) ?? -1;
            if (idx < 0 || idx >= data.length) return state;
            const actuator = useRobotProfileStore.getState().actuators[state.name];
            const sagOffset = actuator?.sagOffsetDeg ?? 0;
            const rawDeg = Number(data[idx]) * (180 / Math.PI) + 180.0;
            if (!Number.isFinite(rawDeg)) return state;
            return { ...state, degrees: rawDeg + sagOffset };
          }),
        );
        enablePublishingRef.current();
      }

      setFeedbackStates((prev: JointState[]) => {
        const seededFromJointStates = prev.length === 0;
        const base = seededFromJointStates
          ? getJointStates().map((state: JointState) => ({ ...state }))
          : prev;
        let changed = seededFromJointStates;
        const next = base.map((state: JointState) => {
          if (state.jointType !== "revolute") return state;
          const idx = orderIndex.get(state.name) ?? -1;
          if (idx < 0 || idx >= data.length) return state;
          const value = Number(data[idx]);
          if (!Number.isFinite(value)) return state;
          const actuator = useRobotProfileStore.getState().actuators[state.name];
          const sagOffset = actuator?.sagOffsetDeg ?? 0;
          const rawDeg = value * (180 / Math.PI) + 180.0;
          const deg = rawDeg + sagOffset;
          const prevDeg = typeof state.degrees === "number" ? state.degrees : null;
          if (prevDeg !== null && Math.abs(prevDeg - deg) < FEEDBACK_EPSILON_DEG) {
            return state;
          }
          changed = true;
          return { ...state, degrees: deg };
        });
        return changed ? next : prev;
      });
    };

    handleConfigStatusRef.current = (msg: Record<string, unknown>) => {
      const payload = typeof msg.data === "string" ? msg.data : "";
      if (!payload) return;
      clearConfigAckTimeout();

      if (payload.startsWith("error:")) {
        console.error(`[useRobotControl] Firmware config status: ${payload}`);
        setFirmwareConfigStatus({ level: "error", message: payload });
      } else {
        console.log(`[useRobotControl] Firmware config status: ${payload}`);
        setFirmwareConfigStatus({ level: "ok", message: payload });
      }
    };

    handleBridgeHealthRef.current = (msg: Record<string, unknown>) => {
      const payload = typeof msg.data === "string" ? msg.data : "";
      if (!payload) return;
      const parsed = parseBridgeHealthMessage(payload);
      if (parsed) {
        setBridgeHealth(parsed);
      }
    };
    handlePidResponseRef.current = (msg: Record<string, unknown>) => {
      pidResponseListenersRef.current.forEach((listener) => {
        listener(msg);
      });
    };
  }, [
    clearConfigAckTimeout,
    clearFirstFeedbackTimeout,
    getCommandJointOrder,
    getJointStates,
    setFeedbackStates,
    setJointStates,
  ]);

  const handleWorkerTopicMessage = useCallback(
    (topic: string, msg: Record<string, unknown>) => {
      if (topic === SERVO_FEEDBACK_TOPIC) {
        handleServoFeedbackRef.current(msg);
        return;
      }
      if (topic === CONFIG_STATUS_TOPIC) {
        handleConfigStatusRef.current(msg);
        return;
      }
      if (topic === BRIDGE_HEALTH_TOPIC) {
        handleBridgeHealthRef.current(msg);
        return;
      }
      if (topic === PID_RESPONSE_TOPIC) {
        handlePidResponseRef.current(msg);
      }
    },
    [],
  );

  const unsubscribeFallbackTopic = useCallback(
    (
      client: RosbridgeClient,
      topic: string,
      callbackRef: MutableRefObject<TopicCallback | null>,
    ) => {
      if (!callbackRef.current) return;
      client.unsubscribeCallback(topic, callbackRef.current);
      callbackRef.current = null;
    },
    [],
  );

  const ensureFallbackTopic = useCallback(
    (
      client: RosbridgeClient,
      topic: string,
      callbackRef: MutableRefObject<TopicCallback | null>,
      handlerRef: MutableRefObject<TopicCallback>,
    ) => {
      if (callbackRef.current) return;
      const callback: TopicCallback = (msg) => {
        handlerRef.current(msg);
      };
      callbackRef.current = callback;
      client.subscribe(topic, callback);
    },
    [],
  );

  const syncCoreTopicTransport = useCallback(
    (client?: RosbridgeClient) => {
      const worker = commandPublisherWorkerRef.current;
      if (worker) {
        CORE_TELEMETRY_TOPICS.forEach((topic) => {
          worker.postMessage({
            type: "set-topic-subscription",
            topic,
            enabled: true,
          });
        });
        if (client) {
          unsubscribeFallbackTopic(client, SERVO_FEEDBACK_TOPIC, feedbackCallbackRef);
          unsubscribeFallbackTopic(
            client,
            CONFIG_STATUS_TOPIC,
            configStatusCallbackRef,
          );
          unsubscribeFallbackTopic(
            client,
            BRIDGE_HEALTH_TOPIC,
            bridgeHealthCallbackRef,
          );
        }
        return;
      }

      if (!client || !client.isConnected) return;
      ensureFallbackTopic(
        client,
        SERVO_FEEDBACK_TOPIC,
        feedbackCallbackRef,
        handleServoFeedbackRef,
      );
      ensureFallbackTopic(
        client,
        CONFIG_STATUS_TOPIC,
        configStatusCallbackRef,
        handleConfigStatusRef,
      );
      ensureFallbackTopic(
        client,
        BRIDGE_HEALTH_TOPIC,
        bridgeHealthCallbackRef,
        handleBridgeHealthRef,
      );
    },
    [ensureFallbackTopic, unsubscribeFallbackTopic],
  );

  const syncPidResponseTransport = useCallback(
    (client?: RosbridgeClient) => {
      const hasListeners = pidResponseListenersRef.current.size > 0;
      const worker = commandPublisherWorkerRef.current;

      if (worker) {
        worker.postMessage({
          type: "set-topic-subscription",
          topic: PID_RESPONSE_TOPIC,
          enabled: hasListeners,
        });
        if (client) {
          unsubscribeFallbackTopic(
            client,
            PID_RESPONSE_TOPIC,
            pidResponseBridgeCallbackRef,
          );
        }
        return;
      }

      if (!client || !client.isConnected) return;
      if (hasListeners) {
        ensureFallbackTopic(
          client,
          PID_RESPONSE_TOPIC,
          pidResponseBridgeCallbackRef,
          handlePidResponseRef,
        );
      } else {
        unsubscribeFallbackTopic(
          client,
          PID_RESPONSE_TOPIC,
          pidResponseBridgeCallbackRef,
        );
      }
    },
    [ensureFallbackTopic, unsubscribeFallbackTopic],
  );

  const pushCurrentJointCommandsToWorker = useCallback(
    (states?: JointState[]) => {
      const worker = commandPublisherWorkerRef.current;
      if (!worker) return;

      const values = buildCommandValues(states ?? getJointStates());
      worker.postMessage({ type: "set-command", values });
    },
    [buildCommandValues, getJointStates],
  );

  // Keep the worker's command cache updated whenever jointStates changes.
  useEffect(() => {
    return useRobotStateStore.subscribe((state, prevState) => {
      if (state.jointStates === prevState.jointStates) return;
      pushCurrentJointCommandsToWorker(state.jointStates as JointState[]);
    });
  }, [pushCurrentJointCommandsToWorker]);

  const startPublishing = useCallback(
    (enableCommandPublish: boolean = true) => {
      const client = getRosbridgeClient();

      if (commandPublisherWorkerRef.current) {
        pushCurrentJointCommandsToWorker();
        commandPublisherWorkerRef.current.postMessage({
          type: "set-publish-enabled",
          enabled: enableCommandPublish,
        });
        if (client.isConnected) {
          syncCoreTopicTransport(client);
          syncPidResponseTransport(client);
        }
        return;
      }

      if (fallbackPublishTimerRef.current) {
        if (!enableCommandPublish) {
          clearInterval(fallbackPublishTimerRef.current);
          fallbackPublishTimerRef.current = null;
        }
        return;
      }

      try {
        const worker = new Worker(
          new URL("../workers/commandPublisher.ts", import.meta.url),
        );
        worker.onmessage = (event: MessageEvent<PublisherWorkerMessage>) => {
          const payload = event.data;
          if (!payload || typeof payload !== "object") return;

          if (payload.type === "topic-message") {
            handleWorkerTopicMessage(payload.topic, payload.msg);
            return;
          }

          if (payload.type !== "status") return;
          const workerState = payload.state;
          if (workerState === "error") {
            console.warn(
              `[useRobotControl] Command publisher worker error: ${
                typeof payload.detail === "string" ? payload.detail : "unknown"
              }`,
            );
          } else if (workerState === "reconnecting") {
            console.warn(
              `[useRobotControl] Command publisher reconnecting${
                typeof payload.detail === "string" ? ` (${payload.detail})` : ""
              }`,
            );
          } else if (workerState === "connected") {
            const activeClient = getRosbridgeClient();
            if (activeClient.isConnected) {
              syncCoreTopicTransport(activeClient);
              syncPidResponseTransport(activeClient);
            }
          }
        };

        const currentStates = getJointStates();
        worker.postMessage({
          type: "start",
          url: ROSBRIDGE_URL,
          publishRateHz: PUBLISH_RATE_HZ,
          commandTopic: JOINT_COMMAND_TOPIC,
          initialValues: buildCommandValues(currentStates),
          publishEnabled: enableCommandPublish,
        });

        commandPublisherWorkerRef.current = worker;
        if (client.isConnected) {
          syncCoreTopicTransport(client);
          syncPidResponseTransport(client);
        }
        console.log(
          `[useRobotControl] Background command publisher started at ${PUBLISH_RATE_HZ}Hz`,
        );
      } catch (err) {
        // Fallback to main-thread topics and publishing when workers are unavailable.
        console.warn(
          "[useRobotControl] Worker unavailable, falling back to main-thread transport",
          err,
        );
        if (client.isConnected) {
          syncCoreTopicTransport(client);
          syncPidResponseTransport(client);
        }
        if (enableCommandPublish) {
          doPublishFallback();
          fallbackPublishTimerRef.current = setInterval(
            doPublishFallback,
            1000 / PUBLISH_RATE_HZ,
          );
        }
      }
    },
    [
      buildCommandValues,
      doPublishFallback,
      getJointStates,
      handleWorkerTopicMessage,
      pushCurrentJointCommandsToWorker,
      syncCoreTopicTransport,
      syncPidResponseTransport,
    ],
  );

  useEffect(() => {
    enablePublishingRef.current = () => {
      startPublishing(true);
    };
  }, [startPublishing]);

  const stopPublishing = useCallback(() => {
    if (commandPublisherWorkerRef.current) {
      commandPublisherWorkerRef.current.postMessage({ type: "stop" });
      commandPublisherWorkerRef.current.terminate();
      commandPublisherWorkerRef.current = null;
    }
    if (fallbackPublishTimerRef.current) {
      clearInterval(fallbackPublishTimerRef.current);
      fallbackPublishTimerRef.current = null;
    }
  }, []);

  const subscribePidResponse = useCallback(
    (callback: (msg: Record<string, unknown>) => void) => {
      pidResponseListenersRef.current.add(callback);
      const client = getRosbridgeClient();
      if (client.isConnected) {
        syncPidResponseTransport(client);
      }
      return () => {
        pidResponseListenersRef.current.delete(callback);
        const activeClient = getRosbridgeClient();
        if (activeClient.isConnected) {
          syncPidResponseTransport(activeClient);
        }
      };
    },
    [syncPidResponseTransport],
  );

  // Connect via rosbridge
  const connectRobot = useCallback(async () => {
    if (isConnectedRef.current || connectionStateRef.current === "connected") {
      setConnectionMessage("Already connected to ROSBridge.");
      return;
    }

    if (
      connectionStateRef.current === "connecting" ||
      connectionStateRef.current === "disconnecting"
    ) {
      return;
    }

    const profileData = useRobotProfileStore.getState();
    const jointOrder = getCommandJointOrder();
    const validation = normalizeAndValidateActuatorMap(
      profileData.actuators as Record<string, Record<string, unknown>>,
      jointOrder,
    );
    setProfileValidationErrors(validation.errors);
    setProfileValidationWarnings(validation.warnings);

    if (jointOrder.length === 0) {
      setConnectionState("error");
      setConnectionMessage("No active modular joints were discovered.");
      setFirmwareConfigStatus({
        level: "error",
        message: "Load a URDF with at least one revolute joint before connecting.",
      });
      return;
    }

    if (validation.errors.length > 0) {
      setConnectionState("error");
      setConnectionMessage(
        "Profile validation failed. Resolve errors before connecting.",
      );
      setFirmwareConfigStatus({
        level: "error",
        message: validation.errors[0],
      });
      return;
    }

    const configPayload = JSON.stringify({
      actuators: validation.normalizedActuators,
      jointOrder,
      tcpOffset: profileData.activeTool.tcpOffset ?? null,
    });
    const configPayloadBytes = getUtf8ByteLength(configPayload);
    if (configPayloadBytes > MAX_FIRMWARE_CONFIG_BYTES) {
      setConnectionState("error");
      setConnectionMessage(
        "Firmware config payload is too large. Reduce actuator profile complexity before connecting.",
      );
      setFirmwareConfigStatus({
        level: "error",
        message: `Config payload ${configPayloadBytes} bytes exceeds firmware limit ${MAX_FIRMWARE_CONFIG_BYTES} bytes.`,
      });
      return;
    }
    configPayloadRef.current = configPayload;
    configPayloadBytesRef.current = configPayloadBytes;

    try {
      setConnectionState("connecting");
      setConnectionMessage("Connecting to ROSBridge...");
      const client = getRosbridgeClient(ROSBRIDGE_URL);
      attachBridgeConnectionListener(client);
      await client.connect();
      setIsConnected(true);
      setConnectionState("connected");
      setConnectionMessage("Connected to ROSBridge.");

      // Start transport immediately, but keep command publishing paused until
      // first feedback has synced sliders to the physical arm.
      hasReceivedFirstFeedbackRef.current = false;
      startPublishing(false);
      syncCoreTopicTransport(client);
      syncPidResponseTransport(client);

      publishFirmwareConfig(client, "initial");

      // Wait for first feedback to sync sliders, but fall back after 3s.
      clearFirstFeedbackTimeout();
      firstFeedbackTimeoutRef.current = setTimeout(() => {
        firstFeedbackTimeoutRef.current = null;
        if (connectionStateRef.current !== "connected") {
          return;
        }
        if (!hasReceivedFirstFeedbackRef.current) {
          console.warn(
            "[useRobotControl] No feedback after 3s — starting publishing with defaults",
          );
          hasReceivedFirstFeedbackRef.current = true;
          enablePublishingRef.current();
        }
      }, 3000);

      console.log("[useRobotControl] Connected to rosbridge");
    } catch (error) {
      setIsConnected(false);
      setConnectionState("error");
      setConnectionMessage(
        `Failed to connect to ROSBridge at ${ROSBRIDGE_URL}. Is rosbridge running?`,
      );
      setFirmwareConfigStatus({
        level: "error",
        message: "Connection failed before configuration could be sent.",
      });
      setBridgeHealth(null);
      clearFirstFeedbackTimeout();
      lastFeedbackUiUpdateMsRef.current = 0;
      clearBridgeConnectionListener();
      stopPublishing();
      resetRosbridgeClient();
      console.error("[useRobotControl] Connection failed:", error);
    }
  }, [
    attachBridgeConnectionListener,
    clearFirstFeedbackTimeout,
    clearBridgeConnectionListener,
    getCommandJointOrder,
    publishFirmwareConfig,
    startPublishing,
    stopPublishing,
    syncCoreTopicTransport,
    syncPidResponseTransport,
  ]);

  // Disconnect
  const disconnectRobot = useCallback(async () => {
    setConnectionState("disconnecting");
    setConnectionMessage("Disconnecting from ROSBridge...");

    if (recordingIntervalRef.current) {
      clearInterval(recordingIntervalRef.current);
      recordingIntervalRef.current = null;
      setRecordData([...activeRecordingDataRef.current]);
    }
    setIsRecording(false);

    const client = getRosbridgeClient();
    unsubscribeFallbackTopic(client, SERVO_FEEDBACK_TOPIC, feedbackCallbackRef);
    unsubscribeFallbackTopic(
      client,
      CONFIG_STATUS_TOPIC,
      configStatusCallbackRef,
    );
    unsubscribeFallbackTopic(
      client,
      BRIDGE_HEALTH_TOPIC,
      bridgeHealthCallbackRef,
    );
    unsubscribeFallbackTopic(
      client,
      PID_RESPONSE_TOPIC,
      pidResponseBridgeCallbackRef,
    );

    clearBridgeConnectionListener();
    clearConfigAckTimeout();
    clearFirstFeedbackTimeout();
    stopPublishing();
    resetRosbridgeClient();
    configPayloadRef.current = null;
    configPayloadBytesRef.current = 0;
    lastBridgeStateRef.current = "disconnected";
    lastFeedbackUiUpdateMsRef.current = 0;
    setIsConnected(false);
    setConnectionState("idle");
    setConnectionMessage("Disconnected");
    setFirmwareConfigStatus({
      level: "idle",
      message: "No configuration sent yet.",
    });
    setBridgeHealth(null);
    console.log("[useRobotControl] Disconnected from rosbridge");
  }, [
    clearBridgeConnectionListener,
    clearConfigAckTimeout,
    clearFirstFeedbackTimeout,
    stopPublishing,
    unsubscribeFallbackTopic,
  ]);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      clearConfigAckTimeout();
      clearFirstFeedbackTimeout();
      const client = getRosbridgeClient();
      unsubscribeFallbackTopic(client, SERVO_FEEDBACK_TOPIC, feedbackCallbackRef);
      unsubscribeFallbackTopic(
        client,
        CONFIG_STATUS_TOPIC,
        configStatusCallbackRef,
      );
      unsubscribeFallbackTopic(
        client,
        BRIDGE_HEALTH_TOPIC,
        bridgeHealthCallbackRef,
      );
      unsubscribeFallbackTopic(
        client,
        PID_RESPONSE_TOPIC,
        pidResponseBridgeCallbackRef,
      );
      clearBridgeConnectionListener();
      setBridgeHealth(null);
      configPayloadRef.current = null;
      configPayloadBytesRef.current = 0;
      lastBridgeStateRef.current = "disconnected";
      resetRosbridgeClient();
      stopPublishing();
      if (recordingIntervalRef.current) {
        clearInterval(recordingIntervalRef.current);
        recordingIntervalRef.current = null;
      }
    };
  }, [
    clearBridgeConnectionListener,
    clearConfigAckTimeout,
    clearFirstFeedbackTimeout,
    stopPublishing,
    unsubscribeFallbackTopic,
  ]);

  // Recording functions
  const startRecording = useCallback(() => {
    if (recordingIntervalRef.current) {
      clearInterval(recordingIntervalRef.current);
      recordingIntervalRef.current = null;
    }

    setIsRecording(true);
    setRecordData([]);
    activeRecordingDataRef.current = [];

    recordingIntervalRef.current = setInterval(() => {
      const currentFrame: number[] = [];
      // When connected, record actual arm position (feedbackStates) not commanded position
      const feedbackS = useRobotStateStore.getState().feedbackStates;
      const states: JointState[] =
        feedbackS.length > 0 ? feedbackS : getJointStates();
      const details: JointDetails[] = jointDetailsRef.current;

      details.forEach((joint: JointDetails, i: number) => {
        const state = states[i];
        if (state) {
          if (joint.jointType === "revolute") {
            currentFrame.push(
              typeof state.degrees === "number" ? state.degrees : 0,
            );
          } else if (joint.jointType === "continuous") {
            currentFrame.push(
              typeof state.speed === "number" ? state.speed : 0,
            );
          }
        } else {
          currentFrame.push(0);
        }
      });
      activeRecordingDataRef.current.push(currentFrame);
      if (activeRecordingDataRef.current.length > MAX_RECORD_FRAMES) {
        activeRecordingDataRef.current.splice(
          0,
          activeRecordingDataRef.current.length - MAX_RECORD_FRAMES,
        );
      }
    }, RECORDING_INTERVAL);
  }, [getJointStates]);

  const stopRecording = useCallback(() => {
    setIsRecording(false);
    if (recordingIntervalRef.current) {
      clearInterval(recordingIntervalRef.current);
      recordingIntervalRef.current = null;
    }
    // Commit the accumulated ref data to the React state so the UI can render it.
    setRecordData([...activeRecordingDataRef.current]);
  }, []);

  const clearRecordData = useCallback(() => {
    setRecordData([]);
    activeRecordingDataRef.current = [];
  }, []);

  // Update revolute joint degrees
  const updateJointDegrees = useCallback(
    async (servoId: number, value: number) => {
      setJointStates((prev: JointState[]) => {
        const jointIndex = prev.findIndex(
          (state: JointState) => state.servoId === servoId,
        );
        if (jointIndex === -1) {
          return prev;
        }
        const current = prev[jointIndex];
        if (
          current.jointType !== "revolute" ||
          (typeof current.degrees === "number" &&
            Math.abs(current.degrees - value) < JOINT_UPDATE_EPSILON)
        ) {
          return prev;
        }

        const newStates = [...prev];
        newStates[jointIndex] = { ...current, degrees: value };
        return newStates;
      });
    },
    [setJointStates],
  );

  // Update continuous joint speed
  const updateJointSpeed = useCallback(
    async (servoId: number, speed: number) => {
      setJointStates((prev: JointState[]) => {
        const jointIndex = prev.findIndex(
          (state: JointState) => state.servoId === servoId,
        );
        if (jointIndex === -1) {
          return prev;
        }
        const current = prev[jointIndex];
        if (current.jointType !== "continuous") {
          return prev;
        }
        if (
          typeof current.speed === "number" &&
          Math.abs(current.speed - speed) < JOINT_UPDATE_EPSILON
        ) {
          return prev;
        }

        const newStates = [...prev];
        newStates[jointIndex] = { ...current, speed };
        return newStates;
      });
    },
    [setJointStates],
  );

  // Update multiple joints' degrees simultaneously
  const updateJointsDegrees: UpdateJointsDegrees = useCallback(
    async (updates: { servoId: number; value: number }[]) => {
      if (!updates.length) return;
      setJointStates((prev: JointState[]) => {
        let changed = false;
        const newStates: JointState[] = [...prev];
        const indexByServoId = new Map<number, number>();
        prev.forEach((state: JointState, index: number) => {
          if (typeof state.servoId === "number") {
            indexByServoId.set(state.servoId, index);
          }
        });
        updates.forEach(
          ({ servoId, value }: { servoId: number; value: number }) => {
            const jointIndex = indexByServoId.get(servoId) ?? -1;
            if (
              jointIndex !== -1 &&
              prev[jointIndex].jointType === "revolute"
            ) {
              const current = prev[jointIndex];
              if (
                typeof current.degrees === "number" &&
                Math.abs(current.degrees - value) < JOINT_UPDATE_EPSILON
              ) {
                return;
              }
              changed = true;
              newStates[jointIndex] = {
                ...current,
                degrees: value,
              };
            }
          },
        );
        return changed ? newStates : prev;
      });
    },
    [setJointStates],
  );

  /**
   * Smoothly interpolate multiple joints to target degrees over a given duration.
   * NOTE: Uses requestAnimationFrame which throttles to ~1fps when the browser tab is
   * hidden. If the user switches tabs during a smooth move, the animation will pause
   * and resume when they return.
   */
  const moveJointsSmoothly = useCallback(
    async (
      updates: { servoId: number; value: number }[],
      durationMs: number = 800,
      startFromFeedback: boolean = false,
    ) => {
      // Capture the starting angles right now
      const currentStates: JointState[] = getJointStates();
      const feedbackStates = useRobotStateStore.getState().feedbackStates;
      const startTime = performance.now();

      // Create an array mapping servoId to its starting degree
      const movements = updates.map(
        (update: { servoId: number; value: number }) => {
          const joint = (startFromFeedback && feedbackStates.length > 0
            ? feedbackStates
            : currentStates
          ).find((s: JointState) => s.servoId === update.servoId);
          const startDeg =
            joint && typeof joint.degrees === "number" ? joint.degrees : 0;
          return {
            servoId: update.servoId,
            startDeg,
            deltaDeg: update.value - startDeg,
          };
        },
      );

      // Scale duration to prevent excessively fast movements
      const maxDelta = Math.max(...movements.map(m => Math.abs(m.deltaDeg)));
      const minDuration = maxDelta * 5; // 5ms per degree minimum
      if (durationMs < minDuration) durationMs = minDuration;

      // Abort any previous animation running on these joints
      animationIdRef.current += 1;
      const currentAnimationId = animationIdRef.current;

      return new Promise<void>((resolve) => {
        const animate = (currentTime: number) => {
          // Break immediately if a newer animation was started
          if (animationIdRef.current !== currentAnimationId) {
            resolve();
            return;
          }

          const elapsed = currentTime - startTime;
          let progress = durationMs <= 0 ? 1 : elapsed / durationMs;
          if (progress >= 1) progress = 1;

          // Smooth S-curve: gentle start and end, avoids velocity spikes
          const easeProgress = progress < 0.5
            ? 4 * progress * progress * progress
            : 1 - Math.pow(-2 * progress + 2, 3) / 2;

          setJointStates((prev: JointState[]) => {
            const newStates: JointState[] = [...prev];
            const batch: CommandFeedbackSample[] = [];
            const liveFb = useRobotStateStore.getState().feedbackStates;

            movements.forEach((movement) => {
              const jointIndex = newStates.findIndex(
                (state: JointState) => state.servoId === movement.servoId,
              );
              if (
                jointIndex !== -1 &&
                newStates[jointIndex].jointType === "revolute"
              ) {
                const commandedDeg = movement.startDeg + movement.deltaDeg * easeProgress;
                newStates[jointIndex] = {
                  ...newStates[jointIndex],
                  degrees: commandedDeg,
                };

                const fbState = liveFb.find((s: JointState) => s.servoId === movement.servoId);
                const feedbackDeg = fbState && typeof fbState.degrees === "number" ? fbState.degrees : commandedDeg;

                batch.push({
                   timestamp: Date.now(),
                   elapsedMs: elapsed,
                   jointName: newStates[jointIndex].name,
                   commandedDeg,
                   feedbackDeg,
                   errorDeg: commandedDeg - feedbackDeg,
                });
              }
            });

            if (batch.length > 0 && feedbackModeRef.current === "raw") {
               useMetricsStore.getState().addCommandFeedbackBatch(batch);
            }
            return newStates;
          });

          if (progress < 1) {
            setTimeout(() => animate(performance.now()), 16);
          } else {
            resolve();
          }
        };

        setTimeout(() => animate(performance.now()), 16);
      });
    },
    [getJointStates, setJointStates],
  );

  // Update multiple joints' speed simultaneously
  const updateJointsSpeed: UpdateJointsSpeed = useCallback(
    async (updates: { servoId: number; speed: number }[]) => {
      if (!updates.length) return;
      setJointStates((prev: JointState[]) => {
        let changed = false;
        const newStates: JointState[] = [...prev];
        const indexByServoId = new Map<number, number>();
        prev.forEach((state: JointState, index: number) => {
          if (typeof state.servoId === "number") {
            indexByServoId.set(state.servoId, index);
          }
        });
        updates.forEach(
          ({ servoId, speed }: { servoId: number; speed: number }) => {
            const jointIndex = indexByServoId.get(servoId) ?? -1;
            if (jointIndex !== -1) {
              const current = prev[jointIndex];
              if (current.jointType !== "continuous") {
                return;
              }
              if (
                typeof current.speed === "number" &&
                Math.abs(current.speed - speed) < JOINT_UPDATE_EPSILON
              ) {
                return;
              }
              changed = true;
              newStates[jointIndex] = { ...current, speed };
            }
          },
        );
        return changed ? newStates : prev;
      });
    },
    [setJointStates],
  );

  return {
    isConnected,
    connectionState,
    connectionMessage,
    firmwareConfigStatus,
    bridgeHealth,
    profileValidationErrors,
    profileValidationWarnings,
    connectRobot,
    disconnectRobot,
    subscribePidResponse,
    getJointStates,
    updateJointDegrees,
    updateJointsDegrees,
    moveJointsSmoothly,
    updateJointSpeed,
    updateJointsSpeed,
    setJointDetails,

    // Keyframe Animation Studio
    isKeyframePlaying,
    playKeyframes: useCallback(
      async (keyframes: { angles: number[]; durationMs: number }[], loop: boolean = false) => {
        setIsKeyframePlaying(true);
        keyframeAnimationIdRef.current += 1;
        const currentAnimId = keyframeAnimationIdRef.current;

        do {
          for (const kf of keyframes) {
            if (keyframeAnimationIdRef.current !== currentAnimId) break;

            // Map angles to servoIds
            const states = getJointStates();
            const revoluteJoints = states.filter(
              (j) => j.jointType === "revolute",
            );
            const updates = revoluteJoints
              .map((joint, idx) => ({
                servoId: joint.servoId as number,
                value: kf.angles[idx],
              }))
              .filter((u) => u.servoId !== undefined);

            await moveJointsSmoothly(updates, kf.durationMs);
          }
        } while (loop && keyframeAnimationIdRef.current === currentAnimId);

        if (keyframeAnimationIdRef.current === currentAnimId) {
          setIsKeyframePlaying(false);
        }
      },
      [getJointStates, moveJointsSmoothly],
    ),
    stopKeyframes: useCallback(() => {
      keyframeAnimationIdRef.current += 1;
      setIsKeyframePlaying(false);
      // NOTE: We don't increment animationIdRef here because we can't easily access it
      // without exposing it from useRobotControl or relying on the component.
      // Actually, since moveJointsSmoothly manages animation queueing, the next move
      // will cancel it automatically.
    }, []),

    // Recording functions
    isRecording,
    recordData,
    setRecordData,
    startRecording,
    stopRecording,
    clearRecordData,
    setFeedbackMode: (mode: "throttled" | "raw") => {
      feedbackModeRef.current = mode;
    },
  };
}
