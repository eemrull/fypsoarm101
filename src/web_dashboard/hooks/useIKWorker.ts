"use client";

import { useEffect, useCallback } from "react";
import type { IKWorkerRequest, IKWorkerResponse } from "../workers/ikWorker";
import type { IKSolverType, IKSolverResult } from "../lib/kinematics/IKSolver";
import { useRobotProfileStore } from "@/store/useRobotProfileStore";
import { useRobotStateStore } from "@/store/useRobotStateStore";
import {
  buildJointLimitRanges,
  getOrderedRevoluteJoints,
} from "@/lib/kinematics/runtimeConfig";

type PendingResolver = {
  resolve: (res: unknown) => void;
  reject: (err: unknown) => void;
};

const pendingResolvers = new Map<string, PendingResolver>();
let sharedWorker: Worker | null = null;
let activeConsumerCount = 0;
let requestCounter = 0;
let idleShutdownTimer: ReturnType<typeof setTimeout> | null = null;
const IDLE_SHUTDOWN_MS = 30_000;

function clearIdleShutdownTimer() {
  if (idleShutdownTimer) {
    clearTimeout(idleShutdownTimer);
    idleShutdownTimer = null;
  }
}

function rejectAllPending(reason: string) {
  const error = new Error(reason);
  pendingResolvers.forEach(({ reject }) => reject(error));
  pendingResolvers.clear();
}

function terminateSharedWorker(reason: string) {
  const hadPending = pendingResolvers.size > 0;
  if (sharedWorker) {
    sharedWorker.onmessage = null;
    sharedWorker.onmessageerror = null;
    sharedWorker.onerror = null;
    sharedWorker.terminate();
    sharedWorker = null;
  }

  if (hadPending) {
    rejectAllPending(reason);
  }
}

function scheduleIdleShutdown() {
  if (activeConsumerCount > 0 || pendingResolvers.size > 0) return;
  clearIdleShutdownTimer();
  idleShutdownTimer = setTimeout(() => {
    idleShutdownTimer = null;
    if (activeConsumerCount === 0 && pendingResolvers.size === 0) {
      terminateSharedWorker("IK worker idle shutdown");
    }
  }, IDLE_SHUTDOWN_MS);
}

function getOrCreateSharedWorker() {
  clearIdleShutdownTimer();
  if (sharedWorker) {
    return sharedWorker;
  }

  const worker = new Worker(new URL("../workers/ikWorker.ts", import.meta.url));

  worker.onmessage = (e: MessageEvent<IKWorkerResponse>) => {
    const { id, result, error } = e.data;
    const pending = pendingResolvers.get(id);
    if (!pending) {
      return;
    }

    pendingResolvers.delete(id);
    if (error) {
      pending.reject(new Error(error));
    } else {
      pending.resolve(result);
    }
    scheduleIdleShutdown();
  };

  worker.onerror = (event: ErrorEvent) => {
    const detail = event.message?.trim() || "IK worker crashed";
    terminateSharedWorker(detail);
  };

  worker.onmessageerror = () => {
    terminateSharedWorker("IK worker message error");
  };

  sharedWorker = worker;
  return worker;
}

function sendSharedRequest<T>(request: Omit<IKWorkerRequest, "id">): Promise<T> {
  return new Promise((resolve, reject) => {
    let worker: Worker;
    try {
      worker = getOrCreateSharedWorker();
    } catch (error) {
      reject(error);
      return;
    }

    requestCounter += 1;
    const id = `ik_${requestCounter}`;
    pendingResolvers.set(id, {
      resolve: resolve as (res: unknown) => void,
      reject,
    });

    try {
      worker.postMessage({ ...request, id } as IKWorkerRequest);
    } catch (error) {
      pendingResolvers.delete(id);
      reject(error);
    }
  });
}

export function useIKWorker() {
  useEffect(() => {
    activeConsumerCount += 1;
    getOrCreateSharedWorker();

    return () => {
      activeConsumerCount = Math.max(0, activeConsumerCount - 1);
      scheduleIdleShutdown();
    };
  }, []);

  const sendRequest = useCallback(
    <T>(request: Omit<IKWorkerRequest, "id">): Promise<T> => {
      const profileState = useRobotProfileStore.getState();
      const jointStates = useRobotStateStore.getState().jointStates;
      const orderedRevoluteJoints = getOrderedRevoluteJoints(
        jointStates,
        profileState.ikJointOrder,
      );

      return sendSharedRequest<T>({
        ...request,
        ikNodes:
          profileState.ikNodes.length > 0 ? profileState.ikNodes : undefined,
        tcpOffset: profileState.activeTool.tcpOffset ?? null,
        jointLimits:
          orderedRevoluteJoints.length > 0
            ? buildJointLimitRanges(orderedRevoluteJoints)
            : undefined,
      });
    },
    [],
  );

  const solveIKAsync = useCallback(
    (
      targetPose: number[],
      currentJointAnglesDeg: number[],
      solverType: IKSolverType = "jacobian",
    ): Promise<number[]> => {
      return sendRequest<number[]>({
        method: "solveIK",
        targetPose,
        currentJointAnglesDeg,
        solverType,
      });
    },
    [sendRequest],
  );

  const solveIKWithMetricsAsync = useCallback(
    (
      targetPose: number[],
      currentJointAnglesDeg: number[],
      solverType: IKSolverType = "hybrid",
    ): Promise<IKSolverResult> => {
      return sendRequest<IKSolverResult>({
        method: "solveIKWithMetrics",
        targetPose,
        currentJointAnglesDeg,
        solverType,
      });
    },
    [sendRequest],
  );

  const solveIK_Jacobian_WithMetricsAsync = useCallback(
    (
      targetPose: number[],
      currentJointAnglesDeg: number[],
    ): Promise<IKSolverResult> => {
      return sendRequest<IKSolverResult>({
        method: "solveIK_Jacobian_WithMetrics",
        targetPose,
        currentJointAnglesDeg,
      });
    },
    [sendRequest],
  );

  const solveIK_CCD_WithMetricsAsync = useCallback(
    (
      targetPose: number[], // Will be truncated to 3 elements in the worker
      currentJointAnglesDeg: number[],
    ): Promise<IKSolverResult> => {
      return sendRequest<IKSolverResult>({
        method: "solveIK_CCD_WithMetrics",
        targetPose,
        currentJointAnglesDeg,
      });
    },
    [sendRequest],
  );

  return {
    solveIKAsync,
    solveIKWithMetricsAsync,
    solveIK_Jacobian_WithMetricsAsync,
    solveIK_CCD_WithMetricsAsync,
  };
}
