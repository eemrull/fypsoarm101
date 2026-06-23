import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { IKNode } from "@/lib/kinematics/IKSolver";

/**
 * Increment this version whenever you change default offsets, limits, or 
 * structure in the code and want to force the browser to update.
 */
const SCHEMA_VERSION = 10;

export type ActuatorType =
  | "sts3215"
  | "nema17"
  | "nema23"
  | "nema34"
  | "bldc"
  | "pwm";

export type BoundingBox = {
  width: number;
  height: number;
  depth: number;
  offsetX: number;
  offsetY: number;
  offsetZ: number;
};

export type ToolConfig = {
  type: "gripper" | "drill" | "custom";
  hardwareType: ActuatorType;
  hardwareId: number | string;
  name: string;
  mountLink?: string; // The URDF link this tool is attached to
  tcpOffset?: [number, number, number];
  payloadMass?: number;
  meshUrl?: string;
  boundingBox?: BoundingBox;
  sagOffsetDeg?: number;
};

export type BaseActuatorConfig = {
  jointName: string;
  hardwareType: ActuatorType;
  hardwareId: number | string;
  limitMin?: number;
  limitMax?: number;
  invertDirection?: boolean;
  sagOffsetDeg?: number;
  digitalTwinOffsetDeg?: number;
};

export type Sts3215Config = BaseActuatorConfig & {
  hardwareType: "sts3215";
  torqueLimit?: number;
  speedLimit?: number;
  accelerationLimit?: number;
  pid?: { p: number; i: number; d: number };
};

export type StepperConfig = BaseActuatorConfig & {
  hardwareType: "nema17" | "nema23" | "nema34";
  microsteps: number;
  stepsPerRev: number;
  gearRatio: number;
  stepPin?: number;
  dirPin?: number;
  enablePin?: number;
  homingMethod?: "manual" | "endstop" | "stall";
};

export type PwmConfig = BaseActuatorConfig & {
  hardwareType: "pwm";
  pwmPin?: number;
  pwmMin?: number;
  pwmMax?: number;
};

export type ActuatorConfig =
  | Sts3215Config
  | StepperConfig
  | PwmConfig
  | BaseActuatorConfig;

export type FakeGraspSettings = {
  enabled: boolean;
  thresholdAngle: number;
  distanceThreshold: number;
  attachOffset: [number, number, number];
};

export type SceneSettings = {
  cameraPosition: [number, number, number];
  orbitTarget: [number, number, number];
  environment: "studio" | "warehouse" | "city" | "apartment" | "dawn" | "night";
  showGrid: boolean;
};

export interface RobotProfileState {
  profileName: string;
  baseUrdf: string;
  baseUrdfContent?: string;
  thumbnailUrl?: string;
  joints: string[];
  ikJointOrder: string[];
  ikNodes: IKNode[];
  jointLimits: Record<string, { lower?: number; upper?: number }>;
  links: string[];
  linkLengths: Record<string, number>;
  linkBoundingBoxes: Record<
    string,
    { size: [number, number, number]; offset: [number, number, number] }[]
  >;
  homeAngles: Record<string, number>;
  actuators: Record<string, ActuatorConfig>;
  activeTool: ToolConfig;
  sceneSettings: SceneSettings;
  fakeGraspSettings: FakeGraspSettings;
  schemaVersion: number;
  setProfileName: (name: string) => void;
  setBaseUrdf: (urdf: string) => void;
  setBaseUrdfContent: (content: string) => void;
  setThumbnailUrl: (url: string) => void;
  setKinematics: (
    joints: string[],
    links: string[],
    linkLengths: Record<string, number>,
    ikJointOrder?: string[],
    ikNodes?: IKNode[],
    jointLimits?: Record<string, { lower?: number; upper?: number }>,
  ) => void;
  addLinkBoundingBox: (linkName: string) => void;
  updateLinkBoundingBox: (
    linkName: string,
    index: number,
    size: [number, number, number],
    offset: [number, number, number],
  ) => void;
  removeLinkBoundingBox: (linkName: string, index: number) => void;
  setAllLinkBoundingBoxes: (
    boxes: Record<
      string,
      { size: [number, number, number]; offset: [number, number, number] }[]
    >,
  ) => void;
  setActuator: (jointName: string, config: ActuatorConfig) => void;
  setActiveTool: (tool: ToolConfig) => void;
  setSceneSettings: (settings: Partial<SceneSettings>) => void;
  resetProfile: () => void;
  importProfile: (jsonString: string) => boolean;
  exportProfile: () => string;
  setHomeAngle: (jointName: string, angle: number) => void;
  setFakeGraspSettings: (settings: Partial<FakeGraspSettings>) => void;
}

const defaultState: Omit<
  RobotProfileState,
  | "setProfileName"
  | "setBaseUrdf"
  | "setBaseUrdfContent"
  | "setThumbnailUrl"
  | "setKinematics"
  | "addLinkBoundingBox"
  | "updateLinkBoundingBox"
  | "removeLinkBoundingBox"
  | "setAllLinkBoundingBoxes"
  | "setActuator"
  | "setActiveTool"
  | "setSceneSettings"
  | "resetProfile"
  | "importProfile"
  | "exportProfile"
  | "setHomeAngle"
  | "setFakeGraspSettings"
> = {
  profileName: "SO-ARM101 (Default)",
  baseUrdf: "so-arm101",
  thumbnailUrl: undefined,
  joints: ["Rotation", "Pitch", "Elbow", "Wrist_Pitch", "Wrist_Roll", "Jaw"],
  ikJointOrder: [
    "Rotation",
    "Pitch",
    "Elbow",
    "Wrist_Pitch",
    "Wrist_Roll",
    "Jaw",
  ],
  ikNodes: [
    {
      trans: [-0.124202, -0.168068, 0.0948817],
      rot: [3.14159, 0, 0],
    },
    {
      trans: [-0.0303992, -0.0182778, -0.0542],
      rot: [-1.5708, 1.5692, 0],
    },
    {
      trans: [-0.11257, -0.028, 2.09886e-16],
      rot: [0, 0, 4.71239],
    },
    {
      trans: [-0.1349, 0.0052, 8.44651e-17],
      rot: [0, 0, 1.57079],
    },
    {
      trans: [2.77556e-16, -0.0611, 0.0181],
      rot: [1.5708, 3.1902695, 3.14159],
    },
    {
      trans: [0.0202, 0.0188, -0.0234],
      rot: [1.5708, 3.315, 0],
    },
  ],
  jointLimits: {
    Rotation: {
      lower: 1.22014,
      upper: 5.05986,
    },
    Pitch: {
      lower: 1.39467,
      upper: 4.88692,
    },
    Elbow: {
      lower: 1.39626,
      upper: 4.71239,
    },
    Wrist_Pitch: {
      lower: 1.48353,
      upper: 4.79965,
    },
    Wrist_Roll: {
      lower: 0.39774,
      upper: 5.9828,
    },
    Jaw: {
      lower: 2.879793,
      upper: 5.235987,
    },
  },
  links: [
    "world",
    "base",
    "baseframe",
    "shoulder",
    "upper_arm",
    "lower_arm",
    "wrist",
    "gripper",
    "gripperframe",
    "moving_jaw_so101_v1",
  ],
  linkLengths: {
    world_to_base: 0.2360786960801207,
    baseframe_frame: 0.23639649511549446,
    gripperframe_frame: 0.09844513298041017,
    Rotation: 0.22951149518682065,
    Pitch: 0.06477522160116474,
    Elbow: 0.11600002112068773,
    Wrist_Pitch: 0.13500018518505816,
    Wrist_Roll: 0.06372456355284044,
    Jaw: 0.03618065781602098,
  },
  linkBoundingBoxes: {},
  homeAngles: {
    Rotation: 180.0,
    Pitch: 180.0,
    Elbow: 180.0,
    Wrist_Pitch: 180.0,
    Wrist_Roll: 180.0,
    Jaw: 180.0,
  },
  actuators: {
    Rotation: {
      jointName: "Rotation",
      hardwareType: "sts3215",
      hardwareId: 1,
      sagOffsetDeg: 0,
    },
    Pitch: {
      jointName: "Pitch",
      hardwareType: "sts3215",
      hardwareId: 2,
      sagOffsetDeg: 0,
      pid: { p: 36, i: 1, d: 48 },
    },
    Elbow: {
      jointName: "Elbow",
      hardwareType: "sts3215",
      hardwareId: 3,
      sagOffsetDeg: 0,
      pid: { p: 36, i: 0, d: 48 },
    },
    Wrist_Pitch: {
      jointName: "Wrist_Pitch",
      hardwareType: "sts3215",
      hardwareId: 4,
      sagOffsetDeg: 0,
    },
    Wrist_Roll: {
      jointName: "Wrist_Roll",
      hardwareType: "sts3215",
      hardwareId: 5,
      sagOffsetDeg: 0,
    },
    Jaw: {
      jointName: "Jaw",
      hardwareType: "sts3215",
      hardwareId: 6,
      sagOffsetDeg: 0,
    },
  },
  activeTool: {
    type: "gripper",
    name: "Standard Gripper",
    hardwareType: "sts3215",
    hardwareId: 6,
    sagOffsetDeg: 0,
    tcpOffset: [0, 0, -0.087],
  },
  sceneSettings: {
    cameraPosition: [0.3, 0.4, 0.5],
    orbitTarget: [0, 0.15, 0],
    environment: "studio",
    showGrid: true,
  },
  fakeGraspSettings: {
    enabled: true,
    thresholdAngle: 200,
    distanceThreshold: 0.08,
    attachOffset: [0.015, 0, 0.19],
  },
  schemaVersion: SCHEMA_VERSION,
};

const VALID_ACTUATOR_TYPES = new Set<ActuatorType>([
  "sts3215",
  "nema17",
  "nema23",
  "nema34",
  "bldc",
  "pwm",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((entry): entry is string => typeof entry === "string")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

function parseFiniteNumber(value: unknown): number | null {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === "string") {
    const parsed = Number(value.trim());
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function toInt(value: number): number {
  return value < 0 ? Math.ceil(value) : Math.floor(value);
}

function sanitizeNumberRecord(value: unknown): Record<string, number> {
  if (!isRecord(value)) return {};
  const record: Record<string, number> = {};
  for (const [k, v] of Object.entries(value)) {
    const numeric = parseFiniteNumber(v);
    if (numeric !== null) {
      record[k] = numeric;
    }
  }
  return record;
}

function sanitizeIkNodes(value: unknown): IKNode[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((entry) => {
      if (!isRecord(entry)) return null;
      const trans = Array.isArray(entry.trans)
        ? entry.trans.map(parseFiniteNumber)
        : null;
      const rot = Array.isArray(entry.rot)
        ? entry.rot.map(parseFiniteNumber)
        : null;

      if (
        !trans ||
        !rot ||
        trans.length !== 3 ||
        rot.length !== 3 ||
        trans.some((item) => item === null) ||
        rot.some((item) => item === null)
      ) {
        return null;
      }

      return {
        trans: trans as [number, number, number],
        rot: rot as [number, number, number],
      };
    })
    .filter((entry): entry is IKNode => Boolean(entry));
}

function sanitizeJointLimits(
  value: unknown,
): Record<string, { lower?: number; upper?: number }> {
  if (!isRecord(value)) return {};

  const sanitized: Record<string, { lower?: number; upper?: number }> = {};
  for (const [jointName, limitValue] of Object.entries(value)) {
    if (!isRecord(limitValue)) continue;
    const lower = parseFiniteNumber(limitValue.lower);
    const upper = parseFiniteNumber(limitValue.upper);
    if (lower === null && upper === null) continue;
    sanitized[jointName] = {
      lower: lower ?? undefined,
      upper: upper ?? undefined,
    };
  }
  return sanitized;
}

function sanitizeLinkBoundingBoxes(
  value: unknown,
): Record<
  string,
  { size: [number, number, number]; offset: [number, number, number] }[]
> {
  if (!isRecord(value)) return {};

  const sanitized: Record<
    string,
    { size: [number, number, number]; offset: [number, number, number] }[]
  > = {};
  for (const [linkName, rawBoxes] of Object.entries(value)) {
    if (!Array.isArray(rawBoxes)) continue;
    const boxes = rawBoxes
      .map((box) => {
        if (!isRecord(box)) return null;
        const rawSize = box.size;
        const rawOffset = box.offset;
        if (!Array.isArray(rawSize) || !Array.isArray(rawOffset)) return null;
        if (rawSize.length !== 3 || rawOffset.length !== 3) return null;
        const size = rawSize.map(parseFiniteNumber);
        const offset = rawOffset.map(parseFiniteNumber);
        if (size.some((v) => v === null) || offset.some((v) => v === null))
          return null;
        if ((size as number[]).some((v) => v <= 0)) return null;
        return {
          size: size as [number, number, number],
          offset: offset as [number, number, number],
        };
      })
      .filter(
        (
          entry,
        ): entry is {
          size: [number, number, number];
          offset: [number, number, number];
        } => Boolean(entry),
      );
    if (boxes.length > 0) {
      sanitized[linkName] = boxes;
    }
  }

  return sanitized;
}

function sanitizeSceneSettings(value: unknown): SceneSettings {
  if (!isRecord(value)) return defaultState.sceneSettings;

  const environment =
    value.environment === "studio" ||
    value.environment === "warehouse" ||
    value.environment === "city" ||
    value.environment === "apartment" ||
    value.environment === "dawn" ||
    value.environment === "night"
      ? value.environment
      : defaultState.sceneSettings.environment;
  const cameraPosition =
    Array.isArray(value.cameraPosition) &&
    value.cameraPosition.length === 3 &&
    value.cameraPosition.every((entry) => typeof entry === "number")
      ? (value.cameraPosition as [number, number, number])
      : defaultState.sceneSettings.cameraPosition;
  const orbitTarget =
    Array.isArray(value.orbitTarget) &&
    value.orbitTarget.length === 3 &&
    value.orbitTarget.every((entry) => typeof entry === "number")
      ? (value.orbitTarget as [number, number, number])
      : defaultState.sceneSettings.orbitTarget;
  const showGrid =
    typeof value.showGrid === "boolean"
      ? value.showGrid
      : defaultState.sceneSettings.showGrid;

  return {
    ...defaultState.sceneSettings,
    ...value,
    environment,
    cameraPosition,
    orbitTarget,
    showGrid,
  };
}

function sanitizeActuators(value: unknown): Record<string, ActuatorConfig> {
  if (!isRecord(value)) return {};

  const sanitized: Record<string, ActuatorConfig> = {};
  for (const [rawKey, rawConfig] of Object.entries(value)) {
    if (!isRecord(rawConfig)) continue;

    const key = rawKey.trim();
    const jointNameCandidate =
      typeof rawConfig.jointName === "string" ? rawConfig.jointName : key;
    const jointName = jointNameCandidate.trim();
    if (!jointName) continue;

    const hardwareTypeCandidate = rawConfig.hardwareType;
    const hardwareType: ActuatorType =
      typeof hardwareTypeCandidate === "string" &&
      VALID_ACTUATOR_TYPES.has(hardwareTypeCandidate as ActuatorType)
        ? (hardwareTypeCandidate as ActuatorType)
        : "sts3215";

    const rawHardwareId = parseFiniteNumber(rawConfig.hardwareId);
    const hardwareId = rawHardwareId === null ? 0 : toInt(rawHardwareId);
    const limitMin = parseFiniteNumber(rawConfig.limitMin);
    const limitMax = parseFiniteNumber(rawConfig.limitMax);
    const sagOffsetDeg = parseFiniteNumber(rawConfig.sagOffsetDeg);
    const invertDirection =
      typeof rawConfig.invertDirection === "boolean"
        ? rawConfig.invertDirection
        : undefined;

    const baseConfig: BaseActuatorConfig = {
      jointName,
      hardwareType,
      hardwareId,
      limitMin: limitMin === null ? undefined : limitMin,
      limitMax: limitMax === null ? undefined : limitMax,
      invertDirection,
      sagOffsetDeg: sagOffsetDeg === null ? undefined : sagOffsetDeg,
    };

    if (hardwareType === "sts3215") {
      const torqueLimit = parseFiniteNumber(rawConfig.torqueLimit);
      const speedLimit = parseFiniteNumber(rawConfig.speedLimit);
      
      let pid;
      if (isRecord(rawConfig.pid)) {
        pid = {
          p: parseFiniteNumber(rawConfig.pid.p) ?? 32,
          i: parseFiniteNumber(rawConfig.pid.i) ?? 0,
          d: parseFiniteNumber(rawConfig.pid.d) ?? 32,
        };
      }

      sanitized[jointName] = {
        ...baseConfig,
        hardwareType,
        torqueLimit: torqueLimit === null ? undefined : toInt(torqueLimit),
        speedLimit: speedLimit === null ? undefined : toInt(speedLimit),
        ...(pid ? { pid } : {}),
      };
      continue;
    }

    if (
      hardwareType === "nema17" ||
      hardwareType === "nema23" ||
      hardwareType === "nema34"
    ) {
      const microsteps = parseFiniteNumber(rawConfig.microsteps);
      const stepsPerRev = parseFiniteNumber(rawConfig.stepsPerRev);
      const gearRatio = parseFiniteNumber(rawConfig.gearRatio);
      const stepPin = parseFiniteNumber(rawConfig.stepPin);
      const dirPin = parseFiniteNumber(rawConfig.dirPin);
      const enablePin = parseFiniteNumber(rawConfig.enablePin);
      const homingMethod =
        rawConfig.homingMethod === "manual" ||
        rawConfig.homingMethod === "endstop" ||
        rawConfig.homingMethod === "stall"
          ? rawConfig.homingMethod
          : undefined;

      sanitized[jointName] = {
        ...baseConfig,
        hardwareType,
        microsteps: microsteps === null ? 16 : toInt(microsteps),
        stepsPerRev: stepsPerRev === null ? 200 : stepsPerRev,
        gearRatio: gearRatio === null ? 1 : gearRatio,
        stepPin: stepPin === null ? undefined : toInt(stepPin),
        dirPin: dirPin === null ? undefined : toInt(dirPin),
        enablePin: enablePin === null ? undefined : toInt(enablePin),
        homingMethod,
      };
      continue;
    }

    if (hardwareType === "pwm") {
      const pwmPin = parseFiniteNumber(rawConfig.pwmPin);
      const pwmMin = parseFiniteNumber(rawConfig.pwmMin);
      const pwmMax = parseFiniteNumber(rawConfig.pwmMax);
      sanitized[jointName] = {
        ...baseConfig,
        hardwareType,
        pwmPin: pwmPin === null ? undefined : toInt(pwmPin),
        pwmMin: pwmMin === null ? undefined : toInt(pwmMin),
        pwmMax: pwmMax === null ? undefined : toInt(pwmMax),
      };
      continue;
    }

    sanitized[jointName] = baseConfig;
  }

  return sanitized;
}

function sanitizeActiveTool(value: unknown): ToolConfig {
  if (!isRecord(value)) return defaultState.activeTool;

  const type =
    value.type === "gripper" ||
    value.type === "drill" ||
    value.type === "custom"
      ? value.type
      : defaultState.activeTool.type;
  const name =
    typeof value.name === "string" && value.name.trim().length > 0
      ? value.name
      : defaultState.activeTool.name;
  const hardwareType =
    typeof value.hardwareType === "string" &&
    VALID_ACTUATOR_TYPES.has(value.hardwareType as ActuatorType)
      ? (value.hardwareType as ActuatorType)
      : defaultState.activeTool.hardwareType;
  const hardwareId =
    typeof value.hardwareId === "number" || typeof value.hardwareId === "string"
      ? value.hardwareId
      : defaultState.activeTool.hardwareId;
  const tcpOffset =
    Array.isArray(value.tcpOffset) &&
    value.tcpOffset.length === 3 &&
    value.tcpOffset.every((entry) => typeof entry === "number")
      ? (value.tcpOffset as [number, number, number])
      : defaultState.activeTool.tcpOffset;

  const sagOffsetDeg = parseFiniteNumber(value.sagOffsetDeg);

  return {
    ...(defaultState.activeTool as ToolConfig),
    ...(value as Partial<ToolConfig>),
    type,
    name,
    hardwareType,
    hardwareId,
    tcpOffset,
    sagOffsetDeg:
      sagOffsetDeg !== null
        ? sagOffsetDeg
        : defaultState.activeTool.sagOffsetDeg,
  };
}

export const useRobotProfileStore = create<RobotProfileState>()(
  persist(
    (set, get) => ({
      ...defaultState,
      setProfileName: (name) => set({ profileName: name }),
      setBaseUrdf: (urdf) => set({ baseUrdf: urdf }),
      setBaseUrdfContent: (content) => set({ baseUrdfContent: content }),
      setThumbnailUrl: (url) => set({ thumbnailUrl: url }),
      setKinematics: (
        joints,
        links,
        linkLengths,
        ikJointOrder = [],
        ikNodes = [],
        jointLimits = {},
      ) =>
        set((state) => {
          const normalizedJoints = joints
            .map((joint) => joint.trim())
            .filter((joint) => joint.length > 0);
          if (normalizedJoints.length === 0) {
            return {
              joints: [],
              ikJointOrder: [],
              ikNodes: [],
              jointLimits: {},
              links,
              linkLengths,
            };
          }

          const jointSet = new Set(normalizedJoints);
          const filteredActuators = Object.fromEntries(
            Object.entries(state.actuators).filter(([jointName, config]) => {
              return (
                jointSet.has(jointName) ||
                (typeof config.jointName === "string" &&
                  jointSet.has(config.jointName))
              );
            }),
          );

          return {
            joints: normalizedJoints,
            ikJointOrder: ikJointOrder
              .map((joint) => joint.trim())
              .filter((joint) => joint.length > 0),
            ikNodes,
            jointLimits,
            links,
            linkLengths,
            actuators: filteredActuators,
          };
        }),
      addLinkBoundingBox: (linkName) =>
        set((state) => {
          const boxes = state.linkBoundingBoxes[linkName] ?? [];
          return {
            linkBoundingBoxes: {
              ...state.linkBoundingBoxes,
              [linkName]: [
                ...boxes,
                { size: [0.05, 0.05, 0.05], offset: [0, 0, 0] },
              ],
            },
          };
        }),
      updateLinkBoundingBox: (linkName, index, size, offset) =>
        set((state) => {
          const boxes = state.linkBoundingBoxes[linkName] ?? [];
          const newBoxes = [...boxes];
          newBoxes[index] = { size, offset };
          return {
            linkBoundingBoxes: {
              ...state.linkBoundingBoxes,
              [linkName]: newBoxes,
            },
          };
        }),
      removeLinkBoundingBox: (linkName, index) =>
        set((state) => {
          const boxes = state.linkBoundingBoxes[linkName] ?? [];
          const newBoxes = [...boxes];
          newBoxes.splice(index, 1);
          return {
            linkBoundingBoxes: {
              ...state.linkBoundingBoxes,
              [linkName]: newBoxes,
            },
          };
        }),
      setAllLinkBoundingBoxes: (boxes) => set({ linkBoundingBoxes: boxes }),
      setActuator: (jointName, config) =>
        set((state) => {
          const key = jointName.trim();
          const normalizedJointName = (config.jointName?.trim() || key).trim();
          if (!normalizedJointName) return state;

          const normalizedConfig: ActuatorConfig = {
            ...config,
            jointName: normalizedJointName,
          };

          return {
            actuators: {
              ...state.actuators,
              [normalizedJointName]: normalizedConfig,
            },
          };
        }),
      setActiveTool: (tool) =>
        set({ activeTool: sanitizeActiveTool(tool as unknown) }),
      setSceneSettings: (settings) =>
        set((state) => ({
          sceneSettings: { ...state.sceneSettings, ...settings },
        })),
      resetProfile: () => set(defaultState),
      setHomeAngle: (jointName: string, angle: number) =>
        set((state) => ({
          homeAngles: {
            ...state.homeAngles,
            [jointName]: angle,
          },
        })),
      setFakeGraspSettings: (settings) =>
        set((state) => ({
          fakeGraspSettings: { ...state.fakeGraspSettings, ...settings },
        })),
      importProfile: (jsonString: string) => {
        try {
          const parsed = JSON.parse(jsonString);
          if (!isRecord(parsed)) return false;

          const joints = toStringArray(parsed.joints);
          const actuators = sanitizeActuators(parsed.actuators);
          const jointSet = new Set(joints);
          const filteredActuators =
            joints.length === 0
              ? actuators
              : Object.fromEntries(
                  Object.entries(actuators).filter(([jointName]) =>
                    jointSet.has(jointName),
                  ),
                );

          set({
            profileName:
              typeof parsed.profileName === "string" &&
              parsed.profileName.trim().length > 0
                ? parsed.profileName
                : "System Imported Profile",
            baseUrdf:
              typeof parsed.baseUrdf === "string" &&
              parsed.baseUrdf.trim().length > 0
                ? parsed.baseUrdf
                : "so-arm101",
            baseUrdfContent:
              typeof parsed.baseUrdfContent === "string"
                ? parsed.baseUrdfContent
                : undefined,
            thumbnailUrl:
              typeof parsed.thumbnailUrl === "string"
                ? parsed.thumbnailUrl
                : undefined,
            joints,
            ikJointOrder: toStringArray(parsed.ikJointOrder),
            ikNodes: sanitizeIkNodes(parsed.ikNodes),
            jointLimits: sanitizeJointLimits(parsed.jointLimits),
            links: toStringArray(parsed.links),
            linkLengths: sanitizeNumberRecord(parsed.linkLengths),
            linkBoundingBoxes: sanitizeLinkBoundingBoxes(
              parsed.linkBoundingBoxes,
            ),
            actuators: filteredActuators,
            activeTool: sanitizeActiveTool(parsed.activeTool),
            homeAngles: {
              ...defaultState.homeAngles,
              ...sanitizeNumberRecord(parsed.homeAngles),
            },
            sceneSettings: sanitizeSceneSettings(parsed.sceneSettings),
          });

          return true;
        } catch (e) {
          console.error("Failed to parse profile JSON", e);
          return false;
        }
      },
      exportProfile: () => {
        const state = get();
        // Export only the pure state, not the methods
        const payload = {
          profileName: state.profileName,
          baseUrdf: state.baseUrdf,
          baseUrdfContent: state.baseUrdfContent,
          thumbnailUrl: state.thumbnailUrl,
          joints: state.joints,
          ikJointOrder: state.ikJointOrder,
          ikNodes: state.ikNodes,
          jointLimits: state.jointLimits,
          links: state.links,
          linkLengths: state.linkLengths,
          linkBoundingBoxes: state.linkBoundingBoxes,
          actuators: sanitizeActuators(state.actuators),
          activeTool: state.activeTool as Record<string, unknown>,
          homeAngles: state.homeAngles as Record<string, unknown>,
          sceneSettings: state.sceneSettings,
        };
        return JSON.stringify(payload, null, 2);
      },
    }),
    {
      name: "fyp2-robot-profile",
      storage: createJSONStorage(() => localStorage),
      version: SCHEMA_VERSION,
      migrate: (persistedState: unknown, version: number) => {
        if (version !== SCHEMA_VERSION) {
          console.warn(
            `[Store] Schema version mismatch (code: ${SCHEMA_VERSION}, storage: ${version}). Resetting to defaults.`,
          );
          return defaultState;
        }
        return persistedState as RobotProfileState;
      },
      merge: (persistedState: unknown, currentState: RobotProfileState) => {
        if (!isRecord(persistedState)) {
          return currentState;
        }

        // If the version is still different after migration (or if migration didn't run),
        // force a full reset to the new hardcoded defaults.
        const state = persistedState as Record<string, unknown>;
        if (state.schemaVersion !== SCHEMA_VERSION) {
          return currentState;
        }

        const profileName =
          typeof state.profileName === "string" &&
          state.profileName.trim().length > 0
            ? state.profileName
            : currentState.profileName;
        const baseUrdf =
          typeof state.baseUrdf === "string" &&
          state.baseUrdf.trim().length > 0
            ? state.baseUrdf
            : currentState.baseUrdf;

        return {
          ...currentState,
          profileName,
          baseUrdf,
          baseUrdfContent:
            typeof state.baseUrdfContent === "string"
              ? state.baseUrdfContent
              : currentState.baseUrdfContent,
          thumbnailUrl:
            typeof state.thumbnailUrl === "string"
              ? state.thumbnailUrl
              : currentState.thumbnailUrl,
          joints: toStringArray(state.joints),
          ikJointOrder: toStringArray(state.ikJointOrder),
          ikNodes: sanitizeIkNodes(state.ikNodes),
          jointLimits: sanitizeJointLimits(state.jointLimits),
          links: toStringArray(state.links),
          linkLengths: sanitizeNumberRecord(state.linkLengths),
          linkBoundingBoxes: sanitizeLinkBoundingBoxes(
            state.linkBoundingBoxes,
          ),
          actuators: sanitizeActuators(state.actuators),
          activeTool: sanitizeActiveTool(state.activeTool),
          homeAngles: {
            ...currentState.homeAngles,
            ...sanitizeNumberRecord(state.homeAngles),
          },
          sceneSettings: sanitizeSceneSettings(state.sceneSettings),
          fakeGraspSettings: (state.fakeGraspSettings as FakeGraspSettings) || currentState.fakeGraspSettings,
        };
      },
    },
  ),
);
