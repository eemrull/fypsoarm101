import { describe, it, expect } from "vitest";
import {
  computeForwardKinematics,
  solveIK_CCD_WithMetrics,
  createIdentityMatrix,
  createTranslationMatrix,
  createRotationMatrixEuler,
  createZRotationMatrix,
  multiplyMatrices,
  SO101_URDF_PARAMETERS,
} from "../IKSolver";

describe("Matrix Utilities", () => {
  it("identity * identity = identity", () => {
    const I = createIdentityMatrix();
    const result = multiplyMatrices(I, I);
    for (let r = 0; r < 4; r++) {
      for (let c = 0; c < 4; c++) {
        expect(result[r][c]).toBeCloseTo(r === c ? 1 : 0, 10);
      }
    }
  });

  it("translation matrix places value in correct column", () => {
    const T = createTranslationMatrix(1, 2, 3);
    expect(T[0][3]).toBe(1);
    expect(T[1][3]).toBe(2);
    expect(T[2][3]).toBe(3);
  });

  it("Rz(90°) rotates X-axis to Y-axis", () => {
    const R = createZRotationMatrix(Math.PI / 2);
    expect(R[0][0]).toBeCloseTo(0, 5);
    expect(R[1][0]).toBeCloseTo(1, 5);
    expect(R[2][0]).toBeCloseTo(0, 5);
  });

  it("Euler rotation at zero angles is identity", () => {
    const R = createRotationMatrixEuler(0, 0, 0);
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 3; c++) {
        expect(R[r][c]).toBeCloseTo(r === c ? 1 : 0, 10);
      }
    }
  });
});

describe("Forward Kinematics", () => {
  it("returns correct number of transforms", () => {
    const transforms = computeForwardKinematics([0, 0, 0, 0, 0]);
    expect(transforms.length).toBe(SO101_URDF_PARAMETERS.length + 1);
  });
});

describe("CCD Solver", () => {
  it("converges to target position", () => {
    const startAngles = [0, 0, 0, 0, 0];
    const initialEETransforms = computeForwardKinematics(startAngles);
    const initialEE = initialEETransforms[initialEETransforms.length - 1];
    
    // Target position is offset slightly from initial
    const target: [number, number, number] = [
      initialEE[0][3] + 0.02,
      initialEE[1][3] + 0.01,
      initialEE[2][3] + 0.02,
    ];

    const result = solveIK_CCD_WithMetrics(target, startAngles, 50, 0.05);
    expect(result.metrics.converged).toBe(true);
    expect(result.angles.length).toBe(5);
  });
});
