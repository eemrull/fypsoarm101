import {
  solveIK,
  solveIKWithMetrics,
  solveIK_Jacobian_WithMetrics,
  solveIK_CCD_WithMetrics,
  type IKNode,
  type JointLimitRange,
  type IKRuntimeConfig,
  type IKSolverType,
  type IKSolverResult,
} from "../lib/kinematics/IKSolver";

// Define the shape of messages sent TO the worker
export type IKWorkerRequest = {
  id: string; // Unique ID to match responses to requests
  method:
    | "solveIK"
    | "solveIKWithMetrics"
    | "solveIK_Jacobian_WithMetrics"
    | "solveIK_CCD_WithMetrics";
  targetPose: number[];
  currentJointAnglesDeg: number[];
  ikNodes?: IKNode[];
  tcpOffset?: [number, number, number] | null;
  jointLimits?: JointLimitRange[];
  solverType?: IKSolverType;
};

// Define the shape of messages sent FROM the worker
export type IKWorkerResponse = {
  id: string;
  result?: number[] | IKSolverResult;
  error?: string;
};

self.onmessage = (e: MessageEvent<IKWorkerRequest>) => {
  const {
    id,
    method,
    targetPose,
    currentJointAnglesDeg,
    solverType,
    ikNodes,
    tcpOffset,
    jointLimits,
  } = e.data;

  try {
    let result: number[] | IKSolverResult;
    const runtimeConfig: IKRuntimeConfig = {
      ikNodes,
      tcpOffset,
      jointLimits,
    };

    switch (method) {
      case "solveIK":
        result = solveIK(
          targetPose,
          currentJointAnglesDeg,
          solverType,
          runtimeConfig,
        );
        break;
      case "solveIKWithMetrics":
        result = solveIKWithMetrics(
          targetPose,
          currentJointAnglesDeg,
          solverType,
          runtimeConfig,
        );
        break;
      case "solveIK_Jacobian_WithMetrics":
        result = solveIK_Jacobian_WithMetrics(
          targetPose,
          currentJointAnglesDeg,
          50,
          0.01,
          runtimeConfig,
        );
        break;
      case "solveIK_CCD_WithMetrics":
        result = solveIK_CCD_WithMetrics(
          targetPose,
          currentJointAnglesDeg,
          50,
          0.01,
          runtimeConfig,
        );
        break;
      default:
        throw new Error(`Unknown IK method: ${method}`);
    }

    // Send successful result back to main thread
    self.postMessage({ id, result } as IKWorkerResponse);
  } catch (err: any) {
    // Escalate errors to main thread safely
    self.postMessage({
      id,
      error: err.message || "IK Worker Error",
    } as IKWorkerResponse);
  }
};
