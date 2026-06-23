/**
 * Centralized physical robot constants for SO-ARM101.
 *
 * This is the SINGLE SOURCE OF TRUTH for all dimensions, scale factors,
 * and coordinate conversions used across the dashboard.
 * Link lengths sourced from URDF/CAD (see also: generate_workspace.py).
 */

// ─── Physical Dimensions (meters) ───────────────────────────────────────────────

/** Individual link lengths from URDF (meters) */
export const ARM_LINK_LENGTHS = {
  shoulderToPitch: 0.0645,
  pitchToElbow: 0.1162,
  elbowToWrist: 0.135,
  wristToGripper: 0.0637,
  gripperToTip: 0.1,
} as const;

/**
 * Maximum effective reach from shoulder pitch pivot (meters).
 * Calculated via analytical math script (max_reach.ts):
 * The true maximum Euclidean distance from Pitch to Tooltip is exactly ~0.4357m
 */
export const MAX_REACH_M = 0.4357;

// ─── 3D Scene Rendering ─────────────────────────────────────────────────────────

/**
 * Scale factor applied to the URDF model in the Three.js scene.
 * The robot is rendered at SCENE_SCALE× its real-world size.
 */
export const SCENE_SCALE = 15;

/** Maximum reach expressed in scene units (grid labels) */
export const MAX_REACH_SCENE = MAX_REACH_M * SCENE_SCALE; // ≈ 8.25 scene units

// ─── Coordinate Conversions ─────────────────────────────────────────────────────
// The robot in the scene is:
//   1. Rotated −90° around the X-axis (URDF Y→Scene −Z, URDF Z→Scene Y)
//   2. Scaled by SCENE_SCALE
//
// Scene (sx, sy, sz)  →  IK/URDF (sx/S, −sz/S, sy/S)
// IK/URDF (ux, uy, uz) →  Scene (ux*S, uz*S, −uy*S)

/** Convert 3D scene coordinates to IK/URDF space */
export function sceneToIK(
  sx: number,
  sy: number,
  sz: number,
): [number, number, number] {
  return [sx / SCENE_SCALE, -sz / SCENE_SCALE, sy / SCENE_SCALE];
}

/** Convert IK/URDF space coordinates to 3D scene coordinates */
export function ikToScene(
  ux: number,
  uy: number,
  uz: number,
): [number, number, number] {
  return [ux * SCENE_SCALE, uz * SCENE_SCALE, -uy * SCENE_SCALE];
}

// ─── Real-World Unit Formatting ─────────────────────────────────────────────────

export type MetricUnit = "m" | "cm" | "mm";

/** Convert raw URDF/IK meters into the preferred display unit */
export function convertToUnit(meters: number, unit: MetricUnit): number {
  switch (unit) {
    case "m":
      return meters;
    case "cm":
      return meters * 100;
    case "mm":
      return meters * 1000;
  }
}

/** Convert user input from preferred unit back into raw meters for the IK solver */
export function convertToMeters(value: number, unit: MetricUnit): number {
  switch (unit) {
    case "m":
      return value;
    case "cm":
      return value / 100;
    case "mm":
      return value / 1000;
  }
}

/** Format a raw meter coordinate for display with its unit label */
export function formatUnit(
  meters: number,
  unit: MetricUnit,
  fractionDigits: number = 3,
): string {
  return `${convertToUnit(meters, unit).toFixed(fractionDigits)}`;
}
