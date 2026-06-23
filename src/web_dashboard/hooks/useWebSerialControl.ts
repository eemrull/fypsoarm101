import { useState, useCallback, useRef, useEffect } from "react";
import { ScsServoSDK } from "feetech.js";
import {
  useRobotStateStore,
  type RobotJointState,
} from "@/store/useRobotStateStore";
import { useRobotProfileStore } from "@/store/useRobotProfileStore";
import { JointDetails } from "@/components/playground/RobotScene";

const scsServoSDK = new ScsServoSDK();

export function useWebSerialControl(
  initialJointDetails: JointDetails[],
  urdfInitJointAngles?: Record<string, number>,
) {
  const [isConnected, setIsConnected] = useState(false);
  const [connectionMessage, setConnectionMessage] = useState(
    "Web Serial disconnected",
  );

  const [isRecording, setIsRecording] = useState(false);
  const [recordData, setRecordData] = useState<number[][]>([]);

  // Internal joint details state — mirrors what useRobotControl does.
  const [jointDetails, setJointDetails] = useState(initialJointDetails);

  const syncLoopRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const targetPositionsRef = useRef<Map<number, number>>(new Map());

  // ── Zustand store writers (non-reactive) ───────────────────────────
  const setJointStates = useRobotStateStore((s) => s.setJointStates);
  const setFeedbackStates = useRobotStateStore((s) => s.setFeedbackStates);

  // ── Populate joint states in store whenever jointDetails change ────
  // This is what makes the sliders appear in the UI.
  useEffect(() => {
    if (jointDetails.length === 0) return;

    const initial: RobotJointState[] = jointDetails.map((j) => ({
      name: j.name,
      servoId: j.servoId,
      jointType: j.jointType,
      limit: j.limit,
      degrees:
        j.jointType === "revolute"
          ? (urdfInitJointAngles?.[j.name] ?? 0)
          : undefined,
      speed: j.jointType === "continuous" ? 0 : undefined,
    }));

    setJointStates(initial);
    setFeedbackStates([]);
  }, [jointDetails, urdfInitJointAngles, setJointStates, setFeedbackStates]);

  // Helper to map degrees to servo value (0-4095)
  // 180 degrees = center (2048). 0 degrees = 0. 360 degrees = 4095.
  const degToPos = (deg: number) => {
    return Math.max(0, Math.min(4095, Math.round((deg / 360) * 4096)));
  };

  const posToDeg = (pos: number) => {
    return (pos / 4096) * 360;
  };

  const connectRobot = useCallback(async () => {
    setConnectionMessage("Requesting Web Serial port...");
    try {
      await scsServoSDK.connect({ baudRate: 1000000, protocolEnd: 0 });
      setIsConnected(true);
      setConnectionMessage("Connected via Web Serial (Direct USB)");

      // Read initial positions to sync UI
      const profileData = useRobotProfileStore.getState();
      const actuators = profileData.actuators as Record<string, { hardwareType?: string; hardwareId?: number }>;
      
      for (const [jointName, config] of Object.entries(actuators)) {
        if (config.hardwareType === "sts3215" && config.hardwareId) {
          try {
            const pos = await scsServoSDK.readPosition(config.hardwareId);
            const deg = posToDeg(pos);
            useRobotStateStore.getState().setJointStates((prev) => 
              prev.map(j => j.name === jointName ? { ...j, degrees: deg } : j)
            );
            targetPositionsRef.current.set(config.hardwareId, pos);
          } catch {
            console.warn(`Could not read pos for servo ${config.hardwareId}`);
          }
        }
      }

      // Start the sync loop via setInterval so it runs even if tab is backgrounded
      if (syncLoopRef.current) clearInterval(syncLoopRef.current);
      syncLoopRef.current = setInterval(async () => {
        if (targetPositionsRef.current.size > 0) {
          try {
            await scsServoSDK.syncWritePositions(targetPositionsRef.current);
          } catch {
            // ignore timeout errors
          }
        }
      }, 16);

    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      setConnectionMessage(`Failed to connect: ${errorMsg}`);
    }
  }, []);

  const disconnectRobot = useCallback(async () => {
    if (syncLoopRef.current) {
      clearInterval(syncLoopRef.current);
      syncLoopRef.current = null;
    }
    try {
      await scsServoSDK.disconnect();
    } catch {}
    setIsConnected(false);
    setConnectionMessage("Disconnected from Web Serial");
  }, []);

  const updateJointsDegrees = useCallback(
    async (updates: { servoId: number; value: number }[]) => {
      updates.forEach((update) => {
        const jd = jointDetails.find((j) => j.servoId === update.servoId);
        if (jd) {
          useRobotStateStore.getState().setJointStates((prev) => 
            prev.map(j => j.name === jd.name ? { ...j, degrees: update.value } : j)
          );
        }
        targetPositionsRef.current.set(update.servoId, degToPos(update.value));
      });
    },
    [jointDetails],
  );

  const updateJointDegrees = useCallback(
    async (servoId: number, value: number) => {
      await updateJointsDegrees([{ servoId, value }]);
    },
    [updateJointsDegrees],
  );

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const updateJointsSpeed = useCallback(async (updates: { servoId: number; speed: number }[]) => {}, []);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const updateJointSpeed = useCallback(async (servoId: number, speed: number) => {}, []);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const subscribePidResponse = useCallback((callback: (msg: Record<string, unknown>) => void) => {
    return () => {};
  }, []);
  const getJointStates = useCallback(() => {
    return useRobotStateStore.getState().getJointStates();
  }, []);

  // ── Animation refs ─────────────────────────────────────────────────
  const animationIdRef = useRef(0);
  const keyframeAnimationIdRef = useRef(0);
  const [isKeyframePlaying, setIsKeyframePlaying] = useState(false);

  /**
   * Smoothly interpolate joints to target degrees over durationMs.
   * Also pushes intermediate positions to the USB sync loop so the
   * physical servos follow the animation.
   */
  const moveJointsSmoothly = useCallback(
    async (
      updates: { servoId: number; value: number }[],
      durationMs: number = 800,
    ) => {
      const startStates = getJointStates();
      const startTime = performance.now();

      const movements = updates.map((update) => {
        const joint = startStates.find((s) => s.servoId === update.servoId);
        const startDeg =
          joint && typeof joint.degrees === "number" ? joint.degrees : 0;
        return {
          servoId: update.servoId,
          startDeg,
          deltaDeg: update.value - startDeg,
        };
      });

      // Scale duration to prevent excessively fast movements
      const maxDelta = Math.max(...movements.map(m => Math.abs(m.deltaDeg)));
      const minDuration = maxDelta * 5; // 5ms per degree minimum
      if (durationMs < minDuration) durationMs = minDuration;

      // Abort any previous animation on these joints
      animationIdRef.current += 1;
      const currentAnimationId = animationIdRef.current;

      return new Promise<void>((resolve) => {
        const animate = (currentTime: number) => {
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

          useRobotStateStore.getState().setJointStates((prev) => {
            const newStates = [...prev];
            movements.forEach((movement) => {
              const idx = newStates.findIndex(
                (s) => s.servoId === movement.servoId,
              );
              if (idx !== -1 && newStates[idx].jointType === "revolute") {
                const interpolated =
                  movement.startDeg + movement.deltaDeg * easeProgress;
                newStates[idx] = { ...newStates[idx], degrees: interpolated };
                // Also push to the USB sync loop so the real servos move
                targetPositionsRef.current.set(
                  movement.servoId,
                  degToPos(interpolated),
                );
              }
            });
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
    [getJointStates],
  );

  // ── Keyframe playback (with loop support for event demos) ──────────
  const playKeyframes = useCallback(
    async (
      keyframes: { angles: number[]; durationMs: number }[],
      loop: boolean = false,
    ) => {
      setIsKeyframePlaying(true);
      keyframeAnimationIdRef.current += 1;
      const currentAnimId = keyframeAnimationIdRef.current;

      do {
        for (const kf of keyframes) {
          if (keyframeAnimationIdRef.current !== currentAnimId) break;

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
  );

  const stopKeyframes = useCallback(() => {
    keyframeAnimationIdRef.current += 1;
    setIsKeyframePlaying(false);
  }, []);

  return {
    isConnected,
    connectionMessage,
    firmwareConfigStatus: { level: "ok" as const, message: "Direct USB — no ROS needed" },
    bridgeHealth: undefined,
    profileValidationErrors: [],
    profileValidationWarnings: [],
    connectRobot,
    disconnectRobot,
    subscribePidResponse,
    getJointStates,
    updateJointSpeed,
    setJointDetails,
    updateJointDegrees,
    updateJointsDegrees,
    updateJointsSpeed,
    moveJointsSmoothly,
    isRecording,
    recordData,
    startRecording: () => setIsRecording(true),
    stopRecording: () => setIsRecording(false),
    clearRecordData: () => setRecordData([]),
    setRecordData,
    isKeyframePlaying,
    playKeyframes,
    stopKeyframes,
  };
}

