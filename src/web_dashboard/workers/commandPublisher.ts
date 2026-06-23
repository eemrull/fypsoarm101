/**
 * Background command publisher worker.
 *
 * Keeps a dedicated rosbridge WebSocket and publishes joint commands at a
 * fixed rate even when the main UI thread is throttled.
 */

import { decode } from "cbor-x";

type WorkerInboundMessage =
  | {
      type: "start";
      url: string;
      publishRateHz?: number;
      commandTopic?: string;
      initialValues?: number[];
      publishEnabled?: boolean;
    }
  | { type: "stop" }
  | { type: "set-command"; values: number[] }
  | { type: "set-publish-enabled"; enabled: boolean }
  | { type: "set-topic-subscription"; topic: string; enabled: boolean };

type WorkerStatusMessage = {
  type: "status";
  state: "connecting" | "connected" | "reconnecting" | "disconnected" | "error";
  detail?: string;
};
type WorkerTopicMessage = {
  type: "topic-message";
  topic: string;
  msg: Record<string, unknown>;
};

const DEFAULT_PUBLISH_RATE_HZ = 50;
const DEFAULT_COMMAND_TOPIC = "/joint_commands";
const JOINT_COMMAND_TYPE = "std_msgs/msg/Float32MultiArray";

let ws: WebSocket | null = null;
let publishTimer: ReturnType<typeof setInterval> | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let shouldRun = false;
let publishRateHz = DEFAULT_PUBLISH_RATE_HZ;
let rosbridgeUrl = "";
let commandTopic = DEFAULT_COMMAND_TOPIC;
let latestCommandValues: number[] = [];
let publishEnabled = true;
let commandTopicAdvertised = false;
let reconnectAttempt = 0;
const subscribedTopics = new Set<string>();

const baseReconnectDelayMs = 500;
const maxReconnectDelayMs = 15_000;

function emitStatus(
  state: WorkerStatusMessage["state"],
  detail?: string,
): void {
  (self as DedicatedWorkerGlobalScope).postMessage({
    type: "status",
    state,
    detail,
  } as WorkerStatusMessage);
}

function normalizeCommandValues(values: number[]): number[] {
  const next =
    values.length > 0 ? Array.from({ length: values.length }, () => 0) : [0];

  for (let i = 0; i < next.length; i += 1) {
    const raw = values[i];
    next[i] = Number.isFinite(raw) ? raw : 0;
  }
  return next;
}

function send(msg: Record<string, unknown>): void {
  if (ws?.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg));
  }
}

function advertise(topic: string, type: string): void {
  send({ op: "advertise", topic, type });
}

function publish(topic: string, msg: Record<string, unknown>): void {
  send({ op: "publish", topic, msg });
}

function sendSubscribe(topic: string): void {
  send({
    op: "subscribe",
    topic,
    compression: "none",
  });
}

function sendUnsubscribe(topic: string): void {
  send({
    op: "unsubscribe",
    topic,
  });
}

function applyTopicSubscription(topic: string, enabled: boolean): void {
  if (!topic) return;
  if (enabled) {
    if (!subscribedTopics.has(topic)) {
      subscribedTopics.add(topic);
    }
    if (ws?.readyState === WebSocket.OPEN) {
      sendSubscribe(topic);
    }
    return;
  }

  const hadTopic = subscribedTopics.delete(topic);
  if (hadTopic && ws?.readyState === WebSocket.OPEN) {
    sendUnsubscribe(topic);
  }
}

function publishJointCommandFrame(): void {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  if (!publishEnabled) return;

  if (!commandTopicAdvertised) {
    advertise(commandTopic, JOINT_COMMAND_TYPE);
    commandTopicAdvertised = true;
  }

  publish(commandTopic, {
    layout: { dim: [], data_offset: 0 },
    data: latestCommandValues,
  });
}

function startPublishLoop(): void {
  if (publishTimer) {
    clearInterval(publishTimer);
    publishTimer = null;
  }

  const intervalMs = Math.max(5, Math.round(1000 / Math.max(1, publishRateHz)));
  publishTimer = setInterval(publishJointCommandFrame, intervalMs);
}

function stopPublishLoop(): void {
  if (publishTimer) {
    clearInterval(publishTimer);
    publishTimer = null;
  }
}

function clearReconnectTimer(): void {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
}

function closeSocket(): void {
  if (!ws) return;
  ws.onopen = null;
  ws.onclose = null;
  ws.onerror = null;
  ws.onmessage = null;
  ws.close();
  ws = null;
}

function scheduleReconnect(): void {
  if (!shouldRun || reconnectTimer || !rosbridgeUrl) return;

  const baseDelay = Math.min(
    baseReconnectDelayMs * Math.pow(2, reconnectAttempt),
    maxReconnectDelayMs,
  );
  const jitteredDelay = Math.round(baseDelay * (0.8 + Math.random() * 0.4));

  emitStatus(
    "reconnecting",
    `Reconnect attempt ${reconnectAttempt + 1} in ${jitteredDelay}ms`,
  );

  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    reconnectAttempt += 1;
    connectSocket();
  }, jitteredDelay);
}

function connectSocket(): void {
  if (!shouldRun || !rosbridgeUrl) return;

  closeSocket();
  stopPublishLoop();
  clearReconnectTimer();
  commandTopicAdvertised = false;

  emitStatus("connecting");

  try {
    ws = new WebSocket(rosbridgeUrl);
    ws.binaryType = "arraybuffer";
  } catch (error) {
    emitStatus(
      "error",
      `Failed to create WebSocket: ${(error as Error)?.message ?? String(error)}`,
    );
    scheduleReconnect();
    return;
  }

  ws.onopen = () => {
    reconnectAttempt = 0;
    emitStatus("connected");
    subscribedTopics.forEach((topic) => {
      sendSubscribe(topic);
    });
    startPublishLoop();
    publishJointCommandFrame();
  };

  const handleIncomingData = (parsed: Record<string, unknown>) => {
    if (parsed.op === "ping") {
      send({ op: "pong" });
      return;
    }
    if (
      parsed.op === "publish" &&
      typeof parsed.topic === "string" &&
      subscribedTopics.has(parsed.topic)
    ) {
      const payload =
        parsed.msg && typeof parsed.msg === "object"
          ? (parsed.msg as Record<string, unknown>)
          : {};
      (self as DedicatedWorkerGlobalScope).postMessage({
        type: "topic-message",
        topic: parsed.topic,
        msg: payload,
      } as WorkerTopicMessage);
      return;
    }
    if (parsed.op === "cbor" && parsed.msg) {
      try {
        const inner = decode(
          parsed.msg instanceof Uint8Array
            ? parsed.msg
            : new Uint8Array(parsed.msg as ArrayBufferLike),
        ) as Record<string, unknown>;
        handleIncomingData(inner);
      } catch {
        // Ignore malformed nested CBOR payloads.
      }
    }
  };

  ws.onmessage = (event: MessageEvent<unknown>) => {
    try {
      if (typeof event.data === "string") {
        handleIncomingData(JSON.parse(event.data) as Record<string, unknown>);
        return;
      }
      if (event.data instanceof ArrayBuffer) {
        handleIncomingData(decode(new Uint8Array(event.data)) as Record<string, unknown>);
        return;
      }
      if (event.data instanceof Blob) {
        event.data
          .arrayBuffer()
          .then((buffer) => {
            handleIncomingData(
              decode(new Uint8Array(buffer)) as Record<string, unknown>,
            );
          })
          .catch(() => {});
      }
    } catch {
      // Ignore malformed frames.
    }
  };

  ws.onerror = () => {
    emitStatus("error", "Command publisher WebSocket error");
  };

  ws.onclose = () => {
    ws = null;
    stopPublishLoop();
    commandTopicAdvertised = false;
    if (!shouldRun) {
      emitStatus("disconnected");
      return;
    }
    scheduleReconnect();
  };
}

function stopWorkerPublisher(): void {
  shouldRun = false;
  stopPublishLoop();
  clearReconnectTimer();
  closeSocket();
  commandTopicAdvertised = false;
  reconnectAttempt = 0;
  emitStatus("disconnected");
}

self.onmessage = (event: MessageEvent<WorkerInboundMessage>) => {
  const message = event.data;

  if (message.type === "start") {
    shouldRun = true;
    rosbridgeUrl = message.url;
    publishRateHz = message.publishRateHz ?? DEFAULT_PUBLISH_RATE_HZ;
    commandTopic = message.commandTopic ?? DEFAULT_COMMAND_TOPIC;
    publishEnabled = message.publishEnabled ?? true;
    if (Array.isArray(message.initialValues)) {
      latestCommandValues = normalizeCommandValues(message.initialValues);
    }
    connectSocket();
    return;
  }

  if (message.type === "set-command") {
    latestCommandValues = normalizeCommandValues(message.values);
    return;
  }

  if (message.type === "set-publish-enabled") {
    publishEnabled = message.enabled;
    if (publishEnabled) {
      publishJointCommandFrame();
    }
    return;
  }

  if (message.type === "set-topic-subscription") {
    applyTopicSubscription(message.topic, message.enabled);
    return;
  }

  if (message.type === "stop") {
    stopWorkerPublisher();
  }
};
