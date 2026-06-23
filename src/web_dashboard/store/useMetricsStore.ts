"use client";

import { create } from "zustand";
import { IKSolverMetrics } from "@/lib/kinematics/IKSolver";
import { useRobotProfileStore, Sts3215Config } from "./useRobotProfileStore";

// ─── Types ──────────────────────────────────────────────────────────────────────

export type TrajectoryEntry = {
  timestamp: number; // Date.now()
  jointIndex: number;
  jointName: string;
  targetDeg: number;
  actualDeg: number; // from feedback; equals target if no hardware connected
};

export type CommandFeedbackSample = {
  timestamp: number;
  elapsedMs: number;
  jointName: string;
  commandedDeg: number;
  feedbackDeg: number;
  errorDeg: number;
};

export type IKComparisonEntry = {
  timestamp: number;
  targetXYZ: [number, number, number];
  jacobianMetrics: IKSolverMetrics;
  ccdMetrics: IKSolverMetrics;
};

export type LatencySample = {
  timestamp: number; // Date.now()
  latencyMs: number; // round-trip or bridge-reported latency
};

export type RepeatabilityTrial = {
  trialIndex: number;
  timestamp: number;
  commandedDeg: number[]; // what we sent
  actualDeg: number[];    // what the servos reported
  jointNames: string[];
};

export type OvershootSample = {
  timestamp: number;       // Date.now()
  elapsedMs: number;       // ms since command was sent
  jointIndex: number;
  jointName: string;
  targetDeg: number;
  actualDeg: number;
};

export type PickPlaceIteration = {
  iteration: number;
  timestamp: number;
  phase: "pick" | "carry" | "place" | "return" | "complete" | "approach";
  dataSource: "simulation" | "hardware_feedback";
  boxPosition: [number, number, number]; // scene-space XYZ of the box
  gripperPosition: [number, number, number]; // scene-space XYZ of gripperframe
  boxGripped: boolean;      // true if box is near the gripper (within threshold)
  boxDropped: boolean;      // true if box fell below the ground plane threshold
  distanceToGripper: number; // Euclidean distance box↔gripper (meters, scene-scale)
  boxDeviation: number;     // Euclidean distance from box's initial start position
  waypointIndex: number;    // which waypoint in the sequence was active
  waypointLabel: string;    // label of the active waypoint
  elapsedMs: number;        // ms since the test started
  notes: string;            // failure reason or "ok"
};

// ─── Store ──────────────────────────────────────────────────────────────────────

export interface MetricsState {
  trajectoryLog: TrajectoryEntry[];
  commandFeedbackLog: CommandFeedbackSample[];
  ikComparisonLog: IKComparisonEntry[];
  latestSolveMetrics: IKSolverMetrics | null;
  latencyLog: LatencySample[];
  repeatabilityLog: RepeatabilityTrial[];
  overshootLog: OvershootSample[];
  pickPlaceLog: PickPlaceIteration[];

  // Actions
  addTrajectoryEntry: (entry: TrajectoryEntry) => void;
  addTrajectoryBatch: (entries: TrajectoryEntry[]) => void;
  addCommandFeedbackBatch: (entries: CommandFeedbackSample[]) => void;
  addIKComparison: (entry: IKComparisonEntry) => void;
  setLatestSolveMetrics: (metrics: IKSolverMetrics) => void;
  addLatencySample: (latencyMs: number) => void;
  addRepeatabilityTrial: (trial: RepeatabilityTrial) => void;
  addOvershootSample: (sample: OvershootSample) => void;
  addPickPlaceIteration: (entry: PickPlaceIteration) => void;
  clearTrajectoryLog: () => void;
  clearCommandFeedbackLog: () => void;
  clearIKComparisonLog: () => void;
  clearLatencyLog: () => void;
  clearRepeatabilityLog: () => void;
  clearOvershootLog: () => void;
  clearPickPlaceLog: () => void;
  clearAll: () => void;
}

// Cap log sizes to prevent unbounded memory growth
const MAX_TRAJECTORY_ENTRIES = 2000;
const MAX_COMPARISON_ENTRIES = 100;
const MAX_LATENCY_SAMPLES = 5000;

let mutableTrajectoryBuffer: TrajectoryEntry[] = [];
let bufferFlushTimeout: NodeJS.Timeout | null = null;

function clearBufferedTrajectoryFlushTimeout() {
  if (bufferFlushTimeout) {
    clearTimeout(bufferFlushTimeout);
    bufferFlushTimeout = null;
  }
}

function resetBufferedTrajectoryState() {
  mutableTrajectoryBuffer = [];
  clearBufferedTrajectoryFlushTimeout();
}

export const useMetricsStore = create<MetricsState>()((set) => ({
  trajectoryLog: [],
  commandFeedbackLog: [],
  ikComparisonLog: [],
  latestSolveMetrics: null,
  latencyLog: [],
  repeatabilityLog: [],
  overshootLog: [],
  pickPlaceLog: [],

  addTrajectoryEntry: (entry) => {
    mutableTrajectoryBuffer.push(entry);
    if (mutableTrajectoryBuffer.length > MAX_TRAJECTORY_ENTRIES) {
      mutableTrajectoryBuffer.shift();
    }

    if (!bufferFlushTimeout) {
      bufferFlushTimeout = setTimeout(() => {
        set({ trajectoryLog: [...mutableTrajectoryBuffer] });
        bufferFlushTimeout = null;
      }, 100);
    }
  },

  addTrajectoryBatch: (entries) => {
    mutableTrajectoryBuffer.push(...entries);
    if (mutableTrajectoryBuffer.length > MAX_TRAJECTORY_ENTRIES) {
      mutableTrajectoryBuffer = mutableTrajectoryBuffer.slice(
        -MAX_TRAJECTORY_ENTRIES,
      );
    }
    clearBufferedTrajectoryFlushTimeout();
    set({ trajectoryLog: [...mutableTrajectoryBuffer] });
  },

  addCommandFeedbackBatch: (entries) =>
    set((state) => ({
      commandFeedbackLog: [...state.commandFeedbackLog.slice(-4999), ...entries],
    })),

  addIKComparison: (entry) =>
    set((state) => ({
      ikComparisonLog: [
        ...state.ikComparisonLog.slice(-(MAX_COMPARISON_ENTRIES - 1)),
        entry,
      ],
    })),

  setLatestSolveMetrics: (metrics) => set({ latestSolveMetrics: metrics }),

  addLatencySample: (latencyMs) =>
    set((state) => ({
      latencyLog: [
        ...state.latencyLog.slice(-(MAX_LATENCY_SAMPLES - 1)),
        { timestamp: Date.now(), latencyMs },
      ],
    })),

  clearTrajectoryLog: () => {
    resetBufferedTrajectoryState();
    set({ trajectoryLog: [] });
  },
  clearCommandFeedbackLog: () => set({ commandFeedbackLog: [] }),
  addRepeatabilityTrial: (trial) =>
    set((state) => ({
      repeatabilityLog: [...state.repeatabilityLog, trial],
    })),

  addOvershootSample: (sample) =>
    set((state) => ({
      overshootLog: [...state.overshootLog.slice(-4999), sample],
    })),

  addPickPlaceIteration: (entry) =>
    set((state) => ({
      pickPlaceLog: [...state.pickPlaceLog.slice(-9999), entry],
    })),

  clearIKComparisonLog: () => set({ ikComparisonLog: [] }),
  clearLatencyLog: () => set({ latencyLog: [] }),
  clearRepeatabilityLog: () => set({ repeatabilityLog: [] }),
  clearOvershootLog: () => set({ overshootLog: [] }),
  clearPickPlaceLog: () => set({ pickPlaceLog: [] }),
  clearAll: () => {
    resetBufferedTrajectoryState();
    set({
      trajectoryLog: [],
      commandFeedbackLog: [],
      ikComparisonLog: [],
      latestSolveMetrics: null,
      latencyLog: [],
      repeatabilityLog: [],
      overshootLog: [],
      pickPlaceLog: [],
    });
  },
}));

// ─── CSV Export Utilities ───────────────────────────────────────────────────────

function getTestMetadataHeader(): string {
  const state = useRobotProfileStore.getState();
  const date = new Date().toISOString();
  
  const pids = Object.values(state.actuators)
    .filter(a => a.hardwareType === "sts3215")
    .map(a => {
      const pid = (a as Sts3215Config).pid;
      if (pid) return `${a.jointName}(${pid.p}/${pid.i}/${pid.d})`;
      return `${a.jointName}(default)`;
    })
    .join(", ");

  return `# FYP Test Export\n# Profile: ${state.profileName}\n# Timestamp: ${date}\n# PID: ${pids}\n# Dashboard Version: 1.0.0\n`;
}

function isoTimestamp(): string {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

export function exportTrajectoryCSV(log: TrajectoryEntry[]): void {
  const header =
    "timestamp,jointIndex,jointName,targetDeg,actualDeg,errorDeg\n";
  const rows = log
    .map(
      (e) =>
        `${e.timestamp},${e.jointIndex},${e.jointName},${e.targetDeg.toFixed(2)},${e.actualDeg.toFixed(2)},${(e.targetDeg - e.actualDeg).toFixed(2)}`,
    )
    .join("\n");
  downloadCSV(getTestMetadataHeader() + header + rows, `trajectory_error_log_${isoTimestamp()}.csv`);
}

export function exportCommandFeedbackCSV(log: CommandFeedbackSample[]): void {
  const header = "timestamp,elapsedMs,jointName,commandedDeg,feedbackDeg,errorDeg\n";
  const rows = log
    .map(
      (e) =>
        `${e.timestamp},${e.elapsedMs.toFixed(1)},${e.jointName},${e.commandedDeg.toFixed(2)},${e.feedbackDeg.toFixed(2)},${e.errorDeg.toFixed(2)}`,
    )
    .join("\n");
  downloadCSV(getTestMetadataHeader() + header + rows, `command_feedback_log_${isoTimestamp()}.csv`);
}

export function exportComparisonCSV(log: IKComparisonEntry[]): void {
  const header =
    "timestamp,targetX,targetY,targetZ,jac_iters,jac_timeMs,jac_errorM,jac_converged,ccd_iters,ccd_timeMs,ccd_errorM,ccd_converged\n";
  const rows = log
    .map(
      (e) =>
        `${e.timestamp},${e.targetXYZ[0].toFixed(4)},${e.targetXYZ[1].toFixed(4)},${e.targetXYZ[2].toFixed(4)},` +
        `${e.jacobianMetrics.iterationsUsed},${e.jacobianMetrics.computationTimeMs.toFixed(3)},${e.jacobianMetrics.finalErrorM.toFixed(6)},${e.jacobianMetrics.converged},` +
        `${e.ccdMetrics.iterationsUsed},${e.ccdMetrics.computationTimeMs.toFixed(3)},${e.ccdMetrics.finalErrorM.toFixed(6)},${e.ccdMetrics.converged}`,
    )
    .join("\n");
  downloadCSV(getTestMetadataHeader() + header + rows, `ik_comparison_log_${isoTimestamp()}.csv`);
}

function downloadCSV(content: string, filename: string): void {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export function exportLatencyCSV(log: LatencySample[]): void {
  const header = "timestamp,latencyMs\n";
  const rows = log
    .map((e) => `${e.timestamp},${e.latencyMs.toFixed(3)}`)
    .join("\n");
  downloadCSV(getTestMetadataHeader() + header + rows, `latency_histogram_log_${isoTimestamp()}.csv`);
}

export function exportRepeatabilityCSV(log: RepeatabilityTrial[]): void {
  if (log.length === 0) return;
  const jointNames = log[0].jointNames;
  const cmdHeaders = jointNames.map((n) => `cmd_${n}`).join(",");
  const actHeaders = jointNames.map((n) => `act_${n}`).join(",");
  const errHeaders = jointNames.map((n) => `err_${n}`).join(",");
  const header = `trial,timestamp,${cmdHeaders},${actHeaders},${errHeaders}\n`;
  const rows = log
    .map((t) => {
      const cmds = t.commandedDeg.map((d) => d.toFixed(2)).join(",");
      const acts = t.actualDeg.map((d) => d.toFixed(2)).join(",");
      const errs = t.commandedDeg
        .map((c, i) => Math.abs(c - t.actualDeg[i]).toFixed(2))
        .join(",");
      return `${t.trialIndex},${t.timestamp},${cmds},${acts},${errs}`;
    })
    .join("\n");
  downloadCSV(getTestMetadataHeader() + header + rows, `repeatability_log_${isoTimestamp()}.csv`);
}

export function exportOvershootCSV(log: OvershootSample[]): void {
  const header = "timestamp,elapsedMs,jointIndex,jointName,targetDeg,actualDeg,errorDeg\n";
  const rows = log
    .map(
      (e) =>
        `${e.timestamp},${e.elapsedMs.toFixed(1)},${e.jointIndex},${e.jointName},${e.targetDeg.toFixed(2)},${e.actualDeg.toFixed(2)},${(e.targetDeg - e.actualDeg).toFixed(2)}`,
    )
    .join("\n");
  downloadCSV(getTestMetadataHeader() + header + rows, `overshoot_log_${isoTimestamp()}.csv`);
}

export function exportPickPlaceCSV(log: PickPlaceIteration[]): void {
  const header =
    "iteration,timestamp,elapsedMs,phase,waypointIndex,waypointLabel,dataSource," +
    "boxX,boxY,boxZ,gripperX,gripperY,gripperZ," +
    "distanceToGripper,boxDeviation,boxGripped,boxDropped,notes\n";
  const rows = log
    .map(
      (e) =>
        `${e.iteration},${e.timestamp},${e.elapsedMs.toFixed(1)},${e.phase},${e.waypointIndex},"${e.waypointLabel}",${e.dataSource},` +
        `${e.boxPosition[0].toFixed(5)},${e.boxPosition[1].toFixed(5)},${e.boxPosition[2].toFixed(5)},` +
        `${e.gripperPosition[0].toFixed(5)},${e.gripperPosition[1].toFixed(5)},${e.gripperPosition[2].toFixed(5)},` +
        `${e.distanceToGripper.toFixed(5)},${e.boxDeviation.toFixed(5)},${e.boxGripped},${e.boxDropped},"${e.notes}"`,
    )
    .join("\n");
  downloadCSV(getTestMetadataHeader() + header + rows, `pick_place_endurance_log_${isoTimestamp()}.csv`);
}
