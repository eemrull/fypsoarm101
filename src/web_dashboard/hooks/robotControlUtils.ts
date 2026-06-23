export const JOINT_COMMAND_TOPIC = "/joint_commands";
export const FIRMWARE_CONFIG_TOPIC = "/fyp2/hardware_config";
export const PID_RESPONSE_TOPIC = "/pid_response";
export const SERVO_FEEDBACK_TOPIC = "/servo_feedback";
export const CONFIG_STATUS_TOPIC = "/fyp2/config_status";
export const BRIDGE_HEALTH_TOPIC = "/bridge/health";
export const CORE_TELEMETRY_TOPICS = [
  SERVO_FEEDBACK_TOPIC,
  CONFIG_STATUS_TOPIC,
  BRIDGE_HEALTH_TOPIC,
] as const;

export const PUBLISH_RATE_HZ = 50;
export const FEEDBACK_UI_RATE_HZ = 60;
export const FEEDBACK_EPSILON_DEG = 0.02;
export const JOINT_UPDATE_EPSILON = 0.001;
export const MAX_RECORD_FRAMES = 10_000;
export const MAX_FIRMWARE_CONFIG_BYTES = 4095;

const FIRMWARE_SUPPORTED_TYPES = new Set([
  "sts3215",
  "nema17",
  "nema23",
  "nema34",
  "pwm",
]);

const LEGACY_JOINT_ALIASES: Record<string, string[]> = {
  rotation: ["shoulder_pan", "base_rotation", "base"],
  pitch: ["shoulder_lift", "shoulder_pitch"],
  elbow: ["elbow_flex"],
  wrist_pitch: ["wrist_flex"],
  wrist_roll: ["roll"],
  jaw: ["gripper"],
};

export type BridgeHealthStatus = {
  latencyMs: number;
  staleSec: number;
  fullJointState: boolean;
  zeroOnStale: boolean;
};

export type FirmwareActuatorPayload = {
  hardwareType: "sts3215" | "nema17" | "nema23" | "nema34" | "pwm";
  hardwareId: number;
  commandBiasDeg?: number;
  torqueLimit?: number;
  servoSpeed?: number;
  servoAcceleration?: number;
  pid?: { p: number; i: number; d: number };
  stepPin?: number;
  dirPin?: number;
  enablePin?: number;
  stepsPerRev?: number;
  microsteps?: number;
  gearRatio?: number;
  pwmPin?: number;
  pwmMin?: number;
  pwmMax?: number;
};

export type ValidationResult = {
  normalizedActuators: Record<string, FirmwareActuatorPayload>;
  errors: string[];
  warnings: string[];
};

function normalizeJointKey(value: string): string {
  return value.trim().toLowerCase().replace(/[\s-]+/g, "_");
}

function parseFiniteNumber(value: unknown): number | null {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function toInt(value: number): number {
  return value < 0 ? Math.ceil(value) : Math.floor(value);
}

function resolveJointName(
  candidate: unknown,
  jointOrder: string[],
): string | null {
  if (typeof candidate !== "string") return null;

  const trimmed = candidate.trim();
  if (!trimmed) return null;

  const exact = jointOrder.find((jointName) => jointName === trimmed);
  if (exact) {
    return exact;
  }

  const normalizedCandidate = normalizeJointKey(trimmed);
  const normalizedMatch = jointOrder.find(
    (jointName) => normalizeJointKey(jointName) === normalizedCandidate,
  );
  if (normalizedMatch) {
    return normalizedMatch;
  }

  for (const [canonical, aliases] of Object.entries(LEGACY_JOINT_ALIASES)) {
    if (normalizedCandidate !== canonical && !aliases.includes(normalizedCandidate)) {
      continue;
    }

    const resolved = jointOrder.find(
      (jointName) => normalizeJointKey(jointName) === canonical,
    );
    if (resolved) {
      return resolved;
    }
  }

  return null;
}

function inferDefaultCommandBiasDeg(jointName: string): number {
  const normalized = normalizeJointKey(jointName);
  if (
    normalized.includes("shoulder") ||
    normalized.includes("pitch") ||
    normalized.includes("elbow")
  ) {
    return 1;
  }

  return 0;
}

function buildDefaultActuatorPayload(
  jointName: string,
  jointIndex: number,
): FirmwareActuatorPayload {
  const payload: FirmwareActuatorPayload = {
    hardwareType: "sts3215",
    hardwareId: jointIndex + 1,
  };

  const commandBiasDeg = inferDefaultCommandBiasDeg(jointName);
  if (commandBiasDeg !== 0) {
    payload.commandBiasDeg = commandBiasDeg;
  }

  return payload;
}

export function parseBridgeHealthMessage(
  payload: string,
): BridgeHealthStatus | null {
  try {
    const parsed = JSON.parse(payload) as Record<string, unknown>;
    const latency = parseFiniteNumber(parsed.latency_ms);
    const stale = parseFiniteNumber(parsed.stale_sec);
    const fullJointState = parsed.full_joint_state;
    const zeroOnStale = parsed.zero_on_stale;

    if (
      latency === null ||
      stale === null ||
      typeof fullJointState !== "boolean" ||
      typeof zeroOnStale !== "boolean"
    ) {
      return null;
    }

    return {
      latencyMs: latency,
      staleSec: stale,
      fullJointState,
      zeroOnStale,
    };
  } catch {
    return null;
  }
}

export function getUtf8ByteLength(payload: string): number {
  return new TextEncoder().encode(payload).length;
}

export function normalizeAndValidateActuatorMap(
  actuators: Record<string, Record<string, unknown>>,
  jointOrder: string[],
): ValidationResult {
  const normalized: Record<string, FirmwareActuatorPayload> = {};
  const errors: string[] = [];
  const warnings: string[] = [];

  jointOrder.forEach((jointName, index) => {
    normalized[jointName] = buildDefaultActuatorPayload(jointName, index);
  });

  for (const [key, config] of Object.entries(actuators)) {
    const candidateName =
      typeof config?.jointName === "string" ? (config.jointName as string) : key;
    const resolvedJointName = resolveJointName(candidateName, jointOrder);
    if (!resolvedJointName) {
      warnings.push(
        `Ignoring actuator "${key}" because it does not match the active modular joint order.`,
      );
      continue;
    }

    const jointIndex = jointOrder.indexOf(resolvedJointName);
    const payload: FirmwareActuatorPayload = {
      ...normalized[resolvedJointName],
    };

    const type =
      typeof config.hardwareType === "string" ? config.hardwareType : "";
    if (!FIRMWARE_SUPPORTED_TYPES.has(type)) {
      errors.push(
        `${resolvedJointName}: unsupported hardwareType "${String(config.hardwareType)}".`,
      );
      continue;
    }

    const hardwareId = parseFiniteNumber(config.hardwareId);
    if (hardwareId === null) {
      errors.push(`${resolvedJointName}: hardwareId must be numeric.`);
      continue;
    }

    payload.hardwareType = type as FirmwareActuatorPayload["hardwareType"];
    payload.hardwareId = toInt(hardwareId);

    const commandBiasDeg = parseFiniteNumber(config.commandBiasDeg);
    if (commandBiasDeg !== null) {
      payload.commandBiasDeg = commandBiasDeg;
    } else if (payload.commandBiasDeg === undefined) {
      const inferredBias = inferDefaultCommandBiasDeg(resolvedJointName);
      if (inferredBias !== 0) {
        payload.commandBiasDeg = inferredBias;
      }
    }

    if (type === "sts3215") {
      const torqueLimit = parseFiniteNumber(config.torqueLimit);
      if (torqueLimit !== null) {
        payload.torqueLimit = toInt(Math.max(0, Math.min(1000, torqueLimit)));
      }
      const speedLimit = parseFiniteNumber(config.speedLimit);
      if (speedLimit !== null) {
        payload.servoSpeed = toInt(Math.max(0, Math.min(4000, speedLimit)));
      }
      const accelerationLimit = parseFiniteNumber(config.accelerationLimit);
      if (accelerationLimit !== null) {
        payload.servoAcceleration = toInt(Math.max(0, Math.min(254, accelerationLimit)));
      }
      if (config.pid && typeof config.pid === "object") {
        const pObj = config.pid as { p?: number; i?: number; d?: number };
        const p = parseFiniteNumber(pObj.p);
        const i = parseFiniteNumber(pObj.i);
        const d = parseFiniteNumber(pObj.d);
        if (p !== null && i !== null && d !== null) {
          payload.pid = { p: toInt(p), i: toInt(i), d: toInt(d) };
        }
      }
    } else if (type === "nema17" || type === "nema23" || type === "nema34") {
      const stepsPerRev = parseFiniteNumber(config.stepsPerRev);
      const microsteps = parseFiniteNumber(config.microsteps);
      const gearRatio = parseFiniteNumber(config.gearRatio);

      if (stepsPerRev === null || microsteps === null || gearRatio === null) {
        errors.push(
          `${resolvedJointName}: stepper requires numeric stepsPerRev, microsteps, and gearRatio.`,
        );
        continue;
      }

      if (stepsPerRev <= 0 || microsteps <= 0 || gearRatio <= 0) {
        errors.push(
          `${resolvedJointName}: stepsPerRev, microsteps, and gearRatio must be > 0.`,
        );
        continue;
      }

      payload.stepsPerRev = stepsPerRev;
      payload.microsteps = toInt(microsteps);
      payload.gearRatio = gearRatio;

      const stepPin = parseFiniteNumber(config.stepPin);
      const dirPin = parseFiniteNumber(config.dirPin);
      const hasStepPin = stepPin !== null;
      const hasDirPin = dirPin !== null;

      if (hasStepPin !== hasDirPin) {
        errors.push(
          `${resolvedJointName}: stepPin and dirPin must be provided together.`,
        );
        continue;
      }

      const canUseImplicitPins = jointIndex >= 0 && jointIndex <= 1;
      if (!hasStepPin && !canUseImplicitPins) {
        errors.push(
          `${resolvedJointName}: explicit stepPin and dirPin are required for this joint.`,
        );
        continue;
      }

      if (hasStepPin && hasDirPin) {
        payload.stepPin = toInt(stepPin);
        payload.dirPin = toInt(dirPin);
      }

      const enablePin = parseFiniteNumber(config.enablePin);
      if (enablePin !== null) {
        payload.enablePin = toInt(enablePin);
      }
    } else if (type === "pwm") {
      const pwmPin = parseFiniteNumber(config.pwmPin);
      const pwmMin = parseFiniteNumber(config.pwmMin);
      const pwmMax = parseFiniteNumber(config.pwmMax);

      if (pwmPin === null || pwmMin === null || pwmMax === null) {
        errors.push(
          `${resolvedJointName}: PWM requires numeric pwmPin, pwmMin, and pwmMax.`,
        );
        continue;
      }

      if (pwmMin >= pwmMax) {
        errors.push(`${resolvedJointName}: pwmMin must be less than pwmMax.`);
        continue;
      }

      payload.pwmPin = toInt(pwmPin);
      payload.pwmMin = toInt(pwmMin);
      payload.pwmMax = toInt(pwmMax);
    }

    normalized[resolvedJointName] = payload;
  }

  return { normalizedActuators: normalized, errors, warnings };
}
