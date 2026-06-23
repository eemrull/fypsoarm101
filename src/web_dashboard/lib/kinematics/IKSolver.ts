export type Vector3 = [number, number, number];
export type Matrix4 = number[][];
export type JointLimitRange = [number, number];

export type IKSolverMetrics = {
  solverType: IKSolverType;
  iterationsUsed: number;
  computationTimeMs: number;
  finalErrorM: number;
  converged: boolean;
  convergenceHistory: number[];
};

export type IKSolverResult = {
  angles: number[];
  metrics: IKSolverMetrics;
};

export type IKSolverType = "jacobian" | "ccd" | "hybrid";

export interface IKNode {
  trans: [number, number, number];
  rot: [number, number, number];
}

export type IKRuntimeConfig = {
  ikNodes?: IKNode[];
  tcpOffset?: [number, number, number] | null;
  jointLimits?: JointLimitRange[];
};

const deg2rad = (deg: number) => (deg * Math.PI) / 180;
const rad2deg = (rad: number) => (rad * 180) / Math.PI;
const LEGACY_SO101_TCP_OFFSET: [number, number, number] = [0, 0, -0.087];

let currentJointLimits: JointLimitRange[] = [
  [-Math.PI, 3 * Math.PI],
  [0, 2 * Math.PI],
  [0, 2 * Math.PI],
  [0, 2 * Math.PI],
  [-Math.PI, 3 * Math.PI],
];

function fallbackLimitForIndex(index: number): JointLimitRange {
  if (index < currentJointLimits.length) {
    return currentJointLimits[index];
  }
  return [-2 * Math.PI, 2 * Math.PI];
}

function resolveJointLimits(
  jointCount: number,
  jointLimits?: JointLimitRange[],
): JointLimitRange[] {
  return Array.from({ length: jointCount }, (_, index) => {
    const provided = jointLimits?.[index];
    return provided ?? fallbackLimitForIndex(index);
  });
}

function clampAnglesToLimits(
  anglesRad: number[],
  jointLimits: JointLimitRange[],
): void {
  for (let i = 0; i < anglesRad.length; i += 1) {
    const [lower, upper] = jointLimits[i] ?? fallbackLimitForIndex(i);
    if (anglesRad[i] < lower) anglesRad[i] = lower;
    if (anglesRad[i] > upper) anglesRad[i] = upper;
  }
}

function normalizeRuntimeConfig(
  runtimeConfig: IKRuntimeConfig | undefined,
): Required<IKRuntimeConfig> {
  const ikNodes =
    runtimeConfig?.ikNodes && runtimeConfig.ikNodes.length > 0
      ? runtimeConfig.ikNodes
      : SO101_URDF_PARAMETERS;
  const tcpOffset =
    runtimeConfig?.tcpOffset === undefined
      ? LEGACY_SO101_TCP_OFFSET
      : runtimeConfig.tcpOffset;

  return {
    ikNodes,
    tcpOffset,
    jointLimits: resolveJointLimits(ikNodes.length, runtimeConfig?.jointLimits),
  };
}

// Matrix operations
export const createIdentityMatrix = (): Matrix4 => [
  [1, 0, 0, 0],
  [0, 1, 0, 0],
  [0, 0, 1, 0],
  [0, 0, 0, 1],
];

export const multiplyMatrices = (a: Matrix4, b: Matrix4): Matrix4 => {
  const result = Array.from({ length: 4 }, () => [0, 0, 0, 0]);
  for (let r = 0; r < 4; r += 1) {
    for (let c = 0; c < 4; c += 1) {
      result[r][c] =
        a[r][0] * b[0][c] +
        a[r][1] * b[1][c] +
        a[r][2] * b[2][c] +
        a[r][3] * b[3][c];
    }
  }
  return result;
};

export const createTranslationMatrix = (x: number, y: number, z: number): Matrix4 => [
  [1, 0, 0, x],
  [0, 1, 0, y],
  [0, 0, 1, z],
  [0, 0, 0, 1],
];

export const createRotationMatrixEuler = (rx: number, ry: number, rz: number): Matrix4 => {
  const cx = Math.cos(rx);
  const sx = Math.sin(rx);
  const cy = Math.cos(ry);
  const sy = Math.sin(ry);
  const cz = Math.cos(rz);
  const sz = Math.sin(rz);

  // Rotation matrix from Euler angles ZYX order
  return [
    [
      cy * cz,
      sx * sy * cz - cx * sz,
      cx * sy * cz + sx * sz,
      0,
    ],
    [
      cy * sz,
      sx * sy * sz + cx * cz,
      cx * sy * sz - sx * cz,
      0,
    ],
    [
      -sy,
      sx * cy,
      cx * cy,
      0,
    ],
    [0, 0, 0, 1],
  ];
};

export const createZRotationMatrix = (theta: number): Matrix4 => {
  const c = Math.cos(theta);
  const s = Math.sin(theta);
  return [
    [c, -s, 0, 0],
    [s, c, 0, 0],
    [0, 0, 1, 0],
    [0, 0, 0, 1],
  ];
};

export const SO101_URDF_PARAMETERS: IKNode[] = [
  {
    trans: [0.038836, 0.0, 0.0648],
    rot: [3.14159, 0, 0],
  },
  {
    trans: [-0.0303992, -0.0182778, -0.0542],
    rot: [-1.5708, 1.5692, 0],
  },
  {
    trans: [-0.11257, -0.028, 0],
    rot: [0, 0, 4.71239],
  },
  {
    trans: [-0.1349, 0.0052, 0],
    rot: [0, 0, 1.57079],
  },
  {
    trans: [0, -0.0611, 0.0181],
    rot: [1.5708, 3.1902695, 3.14159],
  },
];

export const SO101_MDH_PARAMETERS = [
  {
    joint: "rotation",
    a: 0.0,
    alpha: -Math.PI / 2,
    d: 0.10565,
    thetaOffset: 0.0,
  },
  { joint: "pitch", a: 0.135, alpha: 0.0, d: 0.005, thetaOffset: -Math.PI / 2 },
  { joint: "elbow", a: 0.135, alpha: 0.0, d: 0.0, thetaOffset: 0.0 },
  {
    joint: "wrist_pitch",
    a: 0.0,
    alpha: Math.PI / 2,
    d: 0.061,
    thetaOffset: 0.0,
  },
  { joint: "wrist_roll", a: 0.0, alpha: 0.0, d: 0.118, thetaOffset: 0.0 },
];

export function setJointLimits(limits: JointLimitRange[]): void {
  currentJointLimits = [...limits];
}

export function getJointLimits(): ReadonlyArray<JointLimitRange> {
  return currentJointLimits;
}

export function clampJointLimits(anglesRad: number[]): void {
  clampAnglesToLimits(anglesRad, currentJointLimits);
}

export const computeForwardKinematics = (
  jointAnglesRadians: number[],
  ikNodes: IKNode[] = SO101_URDF_PARAMETERS,
  tcpOffset: [number, number, number] | null = LEGACY_SO101_TCP_OFFSET,
): Matrix4[] => {
  let currentTransform = createIdentityMatrix();
  const globalTransforms: Matrix4[] = [];

  for (let i = 0; i < ikNodes.length; i += 1) {
    const node = ikNodes[i];
    const translationMatrix = createTranslationMatrix(
      node.trans[0],
      node.trans[1],
      node.trans[2],
    );
    const fixedRotation = createRotationMatrixEuler(
      node.rot[0],
      node.rot[1],
      node.rot[2],
    );
    const jointRotation = createZRotationMatrix(jointAnglesRadians[i] ?? 0);

    currentTransform = multiplyMatrices(
      currentTransform,
      multiplyMatrices(multiplyMatrices(translationMatrix, fixedRotation), jointRotation),
    );
    globalTransforms.push(currentTransform);
  }

  if (tcpOffset) {
    currentTransform = multiplyMatrices(
      currentTransform,
      createTranslationMatrix(tcpOffset[0], tcpOffset[1], tcpOffset[2]),
    );
    globalTransforms.push(currentTransform);
  }

  return globalTransforms;
};

// Vector Helpers
const getTranslation = (m: Matrix4): Vector3 => [m[0][3], m[1][3], m[2][3]];
const subtractVectors = (a: Vector3, b: Vector3): Vector3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dotProduct = (a: Vector3, b: Vector3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const crossProduct = (a: Vector3, b: Vector3): Vector3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const magnitude = (v: Vector3): number => Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]);
const scaleVector = (v: Vector3, s: number): Vector3 => [v[0] * s, v[1] * s, v[2] * s];

function projectToPlane(v: Vector3, normal: Vector3): Vector3 {
  const dot = dotProduct(v, normal);
  return [
    v[0] - dot * normal[0],
    v[1] - dot * normal[1],
    v[2] - dot * normal[2],
  ];
}

// Textbook standard CCD solver loop
function solveCcdCore(
  target: Vector3,
  currentJointAnglesDeg: number[],
  maxIterations: number,
  tolerance: number,
  runtimeConfig?: IKRuntimeConfig,
): IKSolverResult {
  const config = normalizeRuntimeConfig(runtimeConfig);
  const ikNodes = config.ikNodes;
  const tcpOffset = config.tcpOffset;
  const jointLimits = config.jointLimits;

  const anglesRad = currentJointAnglesDeg.map(deg2rad);
  const n = ikNodes.length;

  let iterationsUsed = 0;
  let finalErrorM = 0;
  let converged = false;
  const convergenceHistory: number[] = [];

  const startMs = typeof performance !== "undefined" ? performance.now() : Date.now();

  for (let iter = 0; iter < maxIterations; iter += 1) {
    iterationsUsed = iter + 1;

    // 1. Get current EE position
    const transforms = computeForwardKinematics(anglesRad, ikNodes, tcpOffset);
    const eePos = getTranslation(transforms[transforms.length - 1]);

    const dx = target[0] - eePos[0];
    const dy = target[1] - eePos[1];
    const dz = target[2] - eePos[2];
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
    convergenceHistory.push(dist);
    finalErrorM = dist;

    if (dist < tolerance) {
      converged = true;
      break;
    }

    // 2. Loop from end joint back to base
    for (let i = n - 1; i >= 0; i -= 1) {
      // Get current transforms again to reflect updates in the same iteration
      const currentTransforms = computeForwardKinematics(anglesRad, ikNodes, tcpOffset);
      const currentEE = getTranslation(currentTransforms[currentTransforms.length - 1]);

      // Joint transform
      const jointT = currentTransforms[i];
      const jointPos = getTranslation(jointT);

      // Z-axis of joint (3rd column of rotation matrix)
      const jointZ: Vector3 = [jointT[0][2], jointT[1][2], jointT[2][2]];

      // Vector from joint to EE
      const jointToEE = subtractVectors(currentEE, jointPos);
      // Vector from joint to Target
      const jointToTarget = subtractVectors(target, jointPos);

      // Project vectors onto the plane perpendicular to joint Z-axis
      const projEE = projectToPlane(jointToEE, jointZ);
      const projTarget = projectToPlane(jointToTarget, jointZ);

      const lenEE = magnitude(projEE);
      const lenTarget = magnitude(projTarget);

      if (lenEE > 1e-6 && lenTarget > 1e-6) {
        // Normalize projected vectors
        const uEE = scaleVector(projEE, 1 / lenEE);
        const uTarget = scaleVector(projTarget, 1 / lenTarget);

        // Angle between them
        let cosTheta = dotProduct(uEE, uTarget);
        cosTheta = Math.max(-1, Math.min(1, cosTheta));
        let theta = Math.acos(cosTheta);

        // Direction of rotation (cross product projected onto joint Z-axis)
        const cross = crossProduct(uEE, uTarget);
        const direction = dotProduct(cross, jointZ);

        if (direction < 0) {
          theta = -theta;
        }

        // Apply rotation
        anglesRad[i] = (anglesRad[i] ?? 0) + theta;

        // Clamp to joint limits
        const [lower, upper] = jointLimits[i] ?? fallbackLimitForIndex(i);
        if (anglesRad[i] < lower) anglesRad[i] = lower;
        if (anglesRad[i] > upper) anglesRad[i] = upper;
      }
    }
  }

  const endMs = typeof performance !== "undefined" ? performance.now() : Date.now();

  return {
    angles: anglesRad.map(rad2deg),
    metrics: {
      solverType: "ccd",
      iterationsUsed,
      computationTimeMs: endMs - startMs,
      finalErrorM,
      converged,
      convergenceHistory,
    },
  };
}

export const computeJacobian = (
  jointAnglesRad: number[],
  /* eslint-disable-next-line @typescript-eslint/no-unused-vars */
  ikNodes?: IKNode[],
  /* eslint-disable-next-line @typescript-eslint/no-unused-vars */
  tcpOffset?: [number, number, number] | null,
): number[][] => {
  return Array.from({ length: 6 }, () => Array.from({ length: jointAnglesRad.length }, () => 0));
};

export const solveIK_Jacobian = (
  targetPose: number[],
  currentJointAnglesDeg: number[],
  maxIterations: number = 50,
  tolerance: number = 0.01,
  runtimeConfig?: IKRuntimeConfig,
): number[] => {
  return solveIK_Jacobian_WithMetrics(targetPose, currentJointAnglesDeg, maxIterations, tolerance, runtimeConfig).angles;
};

export const solveIK_CCD = (
  targetPose: number[],
  currentJointAnglesDeg: number[],
  maxIterations: number = 50,
  tolerance: number = 0.01,
  runtimeConfig?: IKRuntimeConfig,
): number[] => {
  return solveIK_CCD_WithMetrics(targetPose, currentJointAnglesDeg, maxIterations, tolerance, runtimeConfig).angles;
};

export const solveIK = (
  targetPose: number[],
  currentJointAnglesDeg: number[],
  solverType: IKSolverType = "jacobian",
  runtimeConfig?: IKRuntimeConfig,
): number[] => {
  return solveIKWithMetrics(targetPose, currentJointAnglesDeg, solverType, runtimeConfig).angles;
};

export const solveIK_Jacobian_WithMetrics = (
  targetPose: number[],
  currentJointAnglesDeg: number[],
  maxIterations: number = 50,
  tolerance: number = 0.01,
  runtimeConfig?: IKRuntimeConfig,
): IKSolverResult => {
  return solveCcdCore(
    [targetPose[0] ?? 0, targetPose[1] ?? 0, targetPose[2] ?? 0],
    currentJointAnglesDeg,
    maxIterations,
    tolerance,
    runtimeConfig,
  );
};

export const solveIK_CCD_WithMetrics = (
  targetPose: Vector3 | number[],
  currentJointAnglesDeg: number[],
  maxIterations: number = 50,
  tolerance: number = 0.01,
  runtimeConfig?: IKRuntimeConfig,
): IKSolverResult => {
  return solveCcdCore(
    [targetPose[0] ?? 0, targetPose[1] ?? 0, targetPose[2] ?? 0],
    currentJointAnglesDeg,
    maxIterations,
    tolerance,
    runtimeConfig,
  );
};

export const solveIKWithMetrics = (
  targetPose: number[],
  currentJointAnglesDeg: number[],
  /* eslint-disable-next-line @typescript-eslint/no-unused-vars */
  solverType: IKSolverType = "ccd",
  runtimeConfig?: IKRuntimeConfig,
): IKSolverResult => {
  return solveCcdCore(
    [targetPose[0] ?? 0, targetPose[1] ?? 0, targetPose[2] ?? 0],
    currentJointAnglesDeg,
    50,
    0.01,
    runtimeConfig,
  );
};
