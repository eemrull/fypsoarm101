import { create } from "zustand";

function isSameVec3(
  current: [number, number, number] | null,
  next: [number, number, number] | null,
): boolean {
  if (current === next) return true;
  if (!current || !next) return false;
  return (
    current[0] === next[0] && current[1] === next[1] && current[2] === next[2]
  );
}

function isSameNumberArray(
  current: number[] | null,
  next: number[] | null,
): boolean {
  if (current === next) return true;
  if (!current || !next) return false;
  if (current.length !== next.length) return false;
  for (let i = 0; i < current.length; i += 1) {
    if (current[i] !== next[i]) return false;
  }
  return true;
}

export type RobotJointState = {
  name: string;
  servoId?: number;
  jointType: "revolute" | "continuous";
  limit?: { lower?: number; upper?: number };
  degrees?: number | "N/A" | "error";
  speed?: number | "N/A" | "error";
};

export interface Keyframe {
  angles: number[];
  durationMs: number;
  label?: string;
}

export interface RobotState {
  endEffectorPosition: [number, number, number] | null;
  setEndEffectorPosition: (pos: [number, number, number] | null) => void;
  ikTargetPose: [number, number, number] | null;
  setIkTargetPose: (pos: [number, number, number] | null) => void;
  jointStates: RobotJointState[];
  setJointStates: (
    updater:
      | RobotJointState[]
      | ((prev: RobotJointState[]) => RobotJointState[]),
  ) => void;
  getJointStates: () => RobotJointState[];
  feedbackStates: RobotJointState[];
  setFeedbackStates: (
    updater:
      | RobotJointState[]
      | ((prev: RobotJointState[]) => RobotJointState[]),
  ) => void;
  previewAngles: number[] | null;
  setPreviewAngles: (angles: number[] | null) => void;
  ghostEndEffectorPosition: [number, number, number] | null;
  setGhostEndEffectorPosition: (pos: [number, number, number] | null) => void;
  keyframes: Keyframe[];
  setKeyframes: (keyframes: Keyframe[]) => void;
  addKeyframe: (keyframe: Keyframe) => void;
  removeKeyframe: (index: number) => void;
  clearKeyframes: () => void;
}

export const useRobotStateStore = create<RobotState>()((set, get) => ({
  endEffectorPosition: null,
  setEndEffectorPosition: (pos) =>
    set((state) =>
      isSameVec3(state.endEffectorPosition, pos)
        ? state
        : { endEffectorPosition: pos },
    ),

  ikTargetPose: null,
  setIkTargetPose: (pos) =>
    set((state) =>
      isSameVec3(state.ikTargetPose, pos) ? state : { ikTargetPose: pos },
    ),

  jointStates: [],
  setJointStates: (updater) =>
    set((state) => {
      const next =
        typeof updater === "function" ? updater(state.jointStates) : updater;
      return next === state.jointStates ? state : { jointStates: next };
    }),
  getJointStates: () => get().jointStates,

  feedbackStates: [],
  setFeedbackStates: (updater) =>
    set((state) => {
      const next =
        typeof updater === "function"
          ? updater(state.feedbackStates)
          : updater;
      return next === state.feedbackStates ? state : { feedbackStates: next };
    }),

  previewAngles: null,
  setPreviewAngles: (angles) =>
    set((state) =>
      isSameNumberArray(state.previewAngles, angles)
        ? state
        : { previewAngles: angles },
    ),

  ghostEndEffectorPosition: null,
  setGhostEndEffectorPosition: (pos) =>
    set((state) =>
      isSameVec3(state.ghostEndEffectorPosition, pos)
        ? state
        : { ghostEndEffectorPosition: pos },
    ),

  keyframes: [],
  setKeyframes: (keyframes) =>
    set((state) => (state.keyframes === keyframes ? state : { keyframes })),
  addKeyframe: (keyframe) =>
    set((state) => ({ keyframes: [...state.keyframes, keyframe] })),
  removeKeyframe: (index) =>
    set((state) => ({
      keyframes: state.keyframes.filter((_, i) => i !== index),
    })),
  clearKeyframes: () => set({ keyframes: [] }),
}));
