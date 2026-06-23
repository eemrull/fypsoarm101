/**
 * Rosbridge WebSocket client for ROS2 communication
 * Replaces the direct Web Serial approach
 */

import { ROSBRIDGE_URL } from "@/config/network";
import { decode } from "cbor-x";

type MessageCallback = (msg: Record<string, unknown>) => void;
export type RosbridgeConnectionState =
  | "connecting"
  | "connected"
  | "reconnecting"
  | "disconnected"
  | "error";
type ConnectionStateCallback = (
  state: RosbridgeConnectionState,
  detail?: string,
) => void;

export class RosbridgeClient {
  private ws: WebSocket | null = null;
  private url: string;
  private subscribers: Map<string, MessageCallback[]> = new Map();
  private publisherIds: Set<string> = new Set();
  private connectionStateCallbacks: Set<ConnectionStateCallback> = new Set();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private manuallyDisconnected = false;
  private lastServerMessageMs = 0;
  private heartbeatWarningActive = false;
  private _isConnected = false;
  private reconnectAttempt = 0;
  private readonly heartbeatIntervalMs = 2000;
  private readonly heartbeatStaleAfterMs = 4000;
  private readonly baseReconnectDelayMs = 500;
  private readonly maxReconnectDelayMs = 15_000;

  constructor(url: string = ROSBRIDGE_URL) {
    this.url = url;
  }

  get isConnected() {
    return this._isConnected;
  }

  onConnectionStateChange(callback: ConnectionStateCallback): () => void {
    this.connectionStateCallbacks.add(callback);
    return () => {
      this.connectionStateCallbacks.delete(callback);
    };
  }

  private emitConnectionState(
    state: RosbridgeConnectionState,
    detail?: string,
  ) {
    this.connectionStateCallbacks.forEach((callback) => {
      callback(state, detail);
    });
  }

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.emitConnectionState("connected");
        resolve();
        return;
      }

      this.manuallyDisconnected = false;
      this.emitConnectionState("connecting");

      try {
        this.ws = new WebSocket(this.url);
        this.ws.binaryType = "arraybuffer";
      } catch (err) {
        this.emitConnectionState("error", `Failed to create WebSocket: ${err}`);
        reject(new Error(`Failed to create WebSocket: ${err}`));
        return;
      }

      let settled = false;
      const settleResolve = () => {
        if (settled) return;
        settled = true;
        resolve();
      };
      const settleReject = (error: Error) => {
        if (settled) return;
        settled = true;
        reject(error);
      };

      const timeout = setTimeout(() => {
        this.emitConnectionState(
          "error",
          `Connection to ${this.url} timed out`,
        );
        settleReject(new Error(`Connection to ${this.url} timed out`));
        this.ws?.close();
      }, 5000);

      this.ws.onopen = () => {
        clearTimeout(timeout);
        this._isConnected = true;
        this.reconnectAttempt = 0;
        this.lastServerMessageMs = Date.now();
        this.heartbeatWarningActive = false;
        this.startHeartbeat();
        this.emitConnectionState("connected");
        console.log(`[Rosbridge] Connected to ${this.url}`);

        // Re-subscribe to any existing topics
        for (const topic of this.subscribers.keys()) {
          this.sendSubscribe(topic);
        }
        settleResolve();
      };

      this.ws.onmessage = (event) => {
        try {
          let data;
          if (event.data instanceof ArrayBuffer) {
            data = decode(new Uint8Array(event.data));
          } else if (event.data instanceof Blob) {
            console.warn(
              "[Rosbridge] Received Blob instead of ArrayBuffer, decoding asynchronously...",
            );
            const reader = new FileReader();
            reader.onload = () => {
              try {
                const asyncData = decode(
                  new Uint8Array(reader.result as ArrayBuffer),
                );
                this.handleIncomingData(asyncData);
              } catch (e) {
                console.error("[Rosbridge] Failed to parse CBOR blob", e);
              }
            };
            reader.readAsArrayBuffer(event.data);
            return;
          } else {
            data = JSON.parse(event.data);
          }

          this.handleIncomingData(data);
        } catch (err) {
          console.warn("[Rosbridge] Failed to parse message:", err);
        }
      };

      this.ws.onclose = () => {
        clearTimeout(timeout);
        this._isConnected = false;
        this.stopHeartbeat();
        this.publisherIds.clear();
        this.ws = null;
        console.log("[Rosbridge] Disconnected");

        if (!settled) {
          settleReject(new Error(`Connection to ${this.url} closed`));
        }

        if (this.manuallyDisconnected) {
          this.emitConnectionState("disconnected");
          return;
        }

        this.emitConnectionState("reconnecting");
        if (!this.reconnectTimer) {
          // Exponential backoff with ±20% jitter to prevent thundering herd
          const delay = Math.min(
            this.baseReconnectDelayMs * Math.pow(2, this.reconnectAttempt),
            this.maxReconnectDelayMs,
          );
          const jitteredDelay = Math.round(delay * (0.8 + Math.random() * 0.4));
          console.log(
            `[Rosbridge] Attempting to reconnect in ${jitteredDelay}ms (attempt ${this.reconnectAttempt + 1})...`,
          );
          this.reconnectTimer = setTimeout(() => {
            this.reconnectTimer = null;
            this.reconnectAttempt++;
            this.connect().catch(() => {});
          }, jitteredDelay);
        }
      };

      this.ws.onerror = (err) => {
        clearTimeout(timeout);
        console.warn("[Rosbridge] WebSocket error:", err);
        this.emitConnectionState("error", "WebSocket connection failed");
        settleReject(new Error("WebSocket connection failed"));
      };
    });
  }

  disconnect() {
    this.manuallyDisconnected = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.stopHeartbeat();
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this._isConnected = false;
    this.publisherIds.clear();
    this.emitConnectionState("disconnected");
  }

  private startHeartbeat() {
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      if (this.ws?.readyState !== WebSocket.OPEN) return;

      // Don't send ping — ROS2 rosbridge doesn't support it.
      // Staleness is still monitored passively via lastServerMessageMs.
      const staleMs = Date.now() - this.lastServerMessageMs;
      if (
        staleMs > this.heartbeatStaleAfterMs &&
        !this.heartbeatWarningActive
      ) {
        this.heartbeatWarningActive = true;
        console.warn(
          `[Rosbridge] No inbound traffic for ${Math.round(
            staleMs,
          )}ms (WebSocket still open).`,
        );
      }
    }, this.heartbeatIntervalMs);
  }

  private stopHeartbeat() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private handleIncomingData(data: Record<string, unknown>) {
    this.lastServerMessageMs = Date.now();
    this.heartbeatWarningActive = false;

    if (data.op === "pong") {
      return;
    }

    if (data.op === "ping") {
      this.send({ op: "pong" });
      return;
    }

    // Handle standard publish
    if (data.op === "publish" && typeof data.topic === "string") {
      const callbacks = this.subscribers.get(data.topic);
      if (callbacks) {
        callbacks.forEach((cb) => cb(data.msg as Record<string, unknown>));
      }
    }

    // Handle embedded CBOR op format that rosbridge sometimes sends
    if (data.op === "cbor" && data.msg) {
      try {
        const innerData = decode(
          data.msg instanceof Uint8Array
            ? data.msg
            : new Uint8Array(data.msg as ArrayBufferLike),
        );
        this.handleIncomingData(innerData as Record<string, unknown>);
      } catch (err) {
        console.warn("[Rosbridge] Failed to decode nested CBOR message:", err);
      }
    }
  }

  private send(msg: Record<string, unknown>) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  private sendSubscribe(topic: string, type?: string, throttleRateMs?: number) {
    const msg: Record<string, unknown> = {
      op: "subscribe",
      topic,
      compression: "none", // Request uncompressed JSON within the CBOR frame, or CBOR within CBOR.
    };
    if (type) msg.type = type;
    if (throttleRateMs != null && throttleRateMs > 0) {
      msg.throttle_rate = throttleRateMs;
    }
    this.send(msg);
  }

  subscribe(
    topic: string,
    callback: MessageCallback,
    type?: string,
    throttleRateMs?: number,
  ) {
    const existing = this.subscribers.get(topic);
    if (existing) {
      if (!existing.includes(callback)) {
        existing.push(callback);
      }
      return;
    }

    this.subscribers.set(topic, [callback]);
    if (this._isConnected) {
      this.sendSubscribe(topic, type, throttleRateMs);
    }
  }

  unsubscribe(topic: string) {
    this.subscribers.delete(topic);
    this.send({
      op: "unsubscribe",
      topic,
    });
  }

  unsubscribeCallback(topic: string, callback: MessageCallback) {
    const callbacks = this.subscribers.get(topic);
    if (!callbacks) return;

    const index = callbacks.indexOf(callback);
    if (index > -1) {
      callbacks.splice(index, 1);
      if (callbacks.length === 0) {
        this.unsubscribe(topic);
      }
    }
  }

  /**
   * Advertise a topic (required before publishing)
   */
  advertise(topic: string, type: string) {
    if (!this.publisherIds.has(topic)) {
      this.send({
        op: "advertise",
        topic,
        type,
      });
      this.publisherIds.add(topic);
    }
  }

  /**
   * Publish a message to a topic
   */
  publish(topic: string, msg: Record<string, unknown>) {
    this.send({
      op: "publish",
      topic,
      msg,
    });
  }

  /**
   * Publish joint commands as Float32MultiArray
   * Values are in radians.
   * Avoids re-advertising on every call for performance at 50Hz.
   */
  publishJointCommands(topic: string, values: number[]) {
    if (!this.publisherIds.has(topic)) {
      this.advertise(topic, "std_msgs/msg/Float32MultiArray");
    }
    this.publish(topic, {
      layout: { dim: [], data_offset: 0 },
      data: values,
    });
  }

  // ─── Latency Probe ───────────────────────────────────────────────────────────
  private latencyProbeTimer: ReturnType<typeof setInterval> | null = null;
  private latencyPendingPings: Map<string, number> = new Map();
  private latencyCallback: ((rttMs: number) => void) | null = null;
  private latencyProbeTopic = "/fyp2/latency_ping";
  private latencyProbeCallback: MessageCallback | null = null;

  /**
   * Start measuring WebSocket round-trip latency.
   * Publishes a timestamped string to a ROS topic and measures the echo RTT.
   * @param onSample - Called with each RTT measurement in milliseconds
   * @param intervalMs - Probe interval (default 500ms)
   */
  startLatencyProbe(onSample: (rttMs: number) => void, intervalMs = 500) {
    this.stopLatencyProbe();
    this.latencyCallback = onSample;

    // Subscribe to the echo topic
    this.latencyProbeCallback = (msg: Record<string, unknown>) => {
      const id = typeof msg.data === "string" ? msg.data : "";
      const sentAt = this.latencyPendingPings.get(id);
      if (sentAt !== undefined) {
        const rtt = performance.now() - sentAt;
        this.latencyPendingPings.delete(id);
        this.latencyCallback?.(rtt);
      }
    };
    this.subscribe(this.latencyProbeTopic, this.latencyProbeCallback, "std_msgs/msg/String");

    // Advertise and start probing
    this.advertise(this.latencyProbeTopic, "std_msgs/msg/String");
    this.latencyProbeTimer = setInterval(() => {
      if (!this._isConnected) return;
      const id = `ping_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      this.latencyPendingPings.set(id, performance.now());
      this.publish(this.latencyProbeTopic, { data: id });

      // Clean up old pings that never got a response (older than 10s)
      const now = performance.now();
      for (const [key, sentAt] of this.latencyPendingPings) {
        if (now - sentAt > 10_000) this.latencyPendingPings.delete(key);
      }
    }, intervalMs);
  }

  /**
   * Stop the latency probe.
   */
  stopLatencyProbe() {
    if (this.latencyProbeTimer) {
      clearInterval(this.latencyProbeTimer);
      this.latencyProbeTimer = null;
    }
    if (this.latencyProbeCallback) {
      this.unsubscribeCallback(this.latencyProbeTopic, this.latencyProbeCallback);
      this.latencyProbeCallback = null;
    }
    this.latencyPendingPings.clear();
    this.latencyCallback = null;
  }
}

// Singleton client
let _client: RosbridgeClient | null = null;

export function getRosbridgeClient(url?: string): RosbridgeClient {
  if (!_client) {
    _client = new RosbridgeClient(url);
  } else if (url && url !== (_client as unknown as { url: string }).url) {
    console.warn(
      `[Rosbridge] getRosbridgeClient called with URL "${url}" but singleton was created with different URL. Returning existing client.`,
    );
  }
  return _client;
}

export function resetRosbridgeClient() {
  if (_client) {
    _client.disconnect();
    _client = null;
  }
}
