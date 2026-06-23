"use client";

import React, {
  useState,
  useMemo,
  useRef,
  useCallback,
  useEffect,
} from "react";
// NOTE: computeForwardKinematics is still used for ghost/preview FK position
import {
  IKSolverType,
  computeForwardKinematics,
} from "@/lib/kinematics/IKSolver";
import { useIKWorker } from "@/hooks/useIKWorker";
import {
  formatUnit,
  convertToUnit,
  convertToMeters,
} from "@/config/robotConstants";
import { JointState } from "@/hooks/useRobotControl";
import { useMetricsStore, type MetricsState } from "@/store/useMetricsStore";
import { useDisplayStore, type DisplayState } from "@/store/useDisplayStore";
import {
  useRobotStateStore,
  type RobotState,
} from "@/store/useRobotStateStore";
import {
  useRobotProfileStore,
  type RobotProfileState,
} from "@/store/useRobotProfileStore";
import { useShallow } from "zustand/react/shallow";
import { getOrderedRevoluteJoints } from "@/lib/kinematics/runtimeConfig";

const deg2rad = (deg: number) => deg * (Math.PI / 180);

interface IKPositionControlProps {
  jointStates: JointState[];
  feedbackStates?: JointState[];
  moveJointsSmoothly: (
    updates: { servoId: number; value: number }[],
    durationMs?: number,
    startFromFeedback?: boolean,
  ) => Promise<void>;
}

/**
 * Custom hook for press-and-hold continuous firing.
 * Uses a ref to always call the LATEST version of the callback,
 * preventing stale closures during long holds.
 */
function usePressAndHold(callback: () => void, intervalMs: number = 150) {
  const callbackRef = useRef(callback);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  const stop = useCallback(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    if (intervalRef.current) clearInterval(intervalRef.current);
    timeoutRef.current = null;
    intervalRef.current = null;
  }, []);

  const start = useCallback(() => {
    stop();
    callbackRef.current();
    timeoutRef.current = setTimeout(() => {
      intervalRef.current = setInterval(() => {
        callbackRef.current();
      }, intervalMs);
    }, 400);
  }, [intervalMs, stop]);

  useEffect(() => stop, [stop]);

  return {
    onMouseDown: start,
    onMouseUp: stop,
    onMouseLeave: stop,
    onTouchStart: (e: React.TouchEvent) => {
      e.preventDefault();
      start();
    },
    onTouchEnd: stop,
  };
}

/**
 * IK Position Control — unified Cartesian XYZ control panel.
 * Combines the former TeachingPendantTab (jog/go-to) and IKControlTab
 * (solver comparison + metrics) into a single clean section.
 */
export const IKPositionControl = React.memo(function IKPositionControl({
  jointStates,
  feedbackStates,
  moveJointsSmoothly,
}: IKPositionControlProps) {
  const {
    solveIKAsync,
    solveIKWithMetricsAsync,
    solveIK_Jacobian_WithMetricsAsync,
    solveIK_CCD_WithMetricsAsync,
  } = useIKWorker();
  const [isComputing, setIsComputing] = useState(false);

  const [xyzStep, setXyzStep] = useState<number>(0.02); // Stored in meters
  const [solverType, setSolverType] = useState<IKSolverType>("ccd");
  const [lastMetricsSummary, setLastMetricsSummary] = useState<string>("");
  const [comparing, setComparing] = useState(false);
  const compareTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const setLatestSolveMetrics = useMetricsStore(
    (state: MetricsState) => state.setLatestSolveMetrics,
  );
  const addIKComparison = useMetricsStore(
    (state: MetricsState) => state.addIKComparison,
  );
  const addTrajectoryBatch = useMetricsStore(
    (state: MetricsState) => state.addTrajectoryBatch,
  );
  const preferredUnit = useDisplayStore(
    (state: DisplayState) => state.preferredUnit,
  );
  const { ikJointOrder, ikNodes, activeTool } = useRobotProfileStore(
    useShallow((state: RobotProfileState) => ({
      ikJointOrder: state.ikJointOrder,
      ikNodes: state.ikNodes,
      activeTool: state.activeTool,
    })),
  );
  const tcpOffset = activeTool.tcpOffset ?? null;
  const revoluteJoints = useMemo(
    () => getOrderedRevoluteJoints(jointStates, ikJointOrder),
    [ikJointOrder, jointStates],
  );

  // Memoize currentDegrees with a stable string key to prevent new array
  // references on every render.
  const currentDegrees = useMemo(() => {
    return revoluteJoints.map((j) =>
      typeof j.degrees === "number" ? j.degrees : 0,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revoluteJoints.map((j) => (typeof j.degrees === "number" ? j.degrees : 0)).join(",")]);

  const currentDegreesRef = useRef(currentDegrees);
  currentDegreesRef.current = currentDegrees;
  const revoluteJointsRef = useRef(revoluteJoints);
  revoluteJointsRef.current = revoluteJoints;
  const xyzStepRef = useRef(xyzStep);
  xyzStepRef.current = xyzStep;
  const solverTypeRef = useRef(solverType);
  solverTypeRef.current = solverType;

  const storeEEPosition = useRobotStateStore(
    (state: RobotState) => state.endEffectorPosition,
  );
  const currentXYZ = useMemo(
    () => storeEEPosition ?? [0, 0, 0],
    [storeEEPosition],
  );

  const currentXYZRef = useRef(currentXYZ);
  currentXYZRef.current = currentXYZ;

  const [previewMode, setPreviewMode] = useState(false);
  const [previewAngles, setPreviewAngles] = useState<number[] | null>(null);

  const ghostXYZ = useMemo(() => {
    if (!previewAngles || previewAngles.length === 0) return null;
    const anglesRad = previewAngles.map(deg2rad);
    const transforms = computeForwardKinematics(anglesRad, ikNodes, tcpOffset);
    const eeMat = transforms[transforms.length - 1];
    return [eeMat[0][3], eeMat[1][3], eeMat[2][3]] as [number, number, number];
  }, [previewAngles, ikNodes, tcpOffset]);

  const previewModeRef = useRef(previewMode);
  previewModeRef.current = previewMode;

  const setGlobalPreviewAngles = useRobotStateStore(
    (state: RobotState) => state.setPreviewAngles,
  );
  const setIkTargetPose = useRobotStateStore(
    (state: RobotState) => state.setIkTargetPose,
  );

  useEffect(() => {
    if (previewMode && previewAngles) {
      setGlobalPreviewAngles(previewAngles);
    } else {
      setGlobalPreviewAngles(null);
    }
  }, [previewMode, previewAngles, setGlobalPreviewAngles]);

  const currentXYZRef2 = useRef(currentXYZ);
  currentXYZRef2.current = currentXYZ;
  const ghostXYZRef = useRef(ghostXYZ);
  ghostXYZRef.current = ghostXYZ;

  useEffect(() => {
    if (previewMode && ghostXYZRef.current) {
      const g = ghostXYZRef.current;
      setIkTargetPose([g[0], g[1], g[2]]);
    } else if (currentXYZRef2.current) {
      const c = currentXYZRef2.current;
      setIkTargetPose([c[0], c[1], c[2]]);
    }
  }, [previewMode, previewAngles, setIkTargetPose]);

  useEffect(() => {
    return () => {
      if (compareTimeoutRef.current) {
        clearTimeout(compareTimeoutRef.current);
        compareTimeoutRef.current = null;
      }
      setGlobalPreviewAngles(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const previewAnglesRef = useRef(previewAngles);
  previewAnglesRef.current = previewAngles;

  const jogXYZ = useCallback(
    async (axis: "x" | "y" | "z", direction: 1 | -1) => {
      const step = xyzStepRef.current;
      const joints = revoluteJointsRef.current;
      const solver = solverTypeRef.current;
      const isPreview = previewModeRef.current;

      let seedDegrees: number[];
      let xyz: number[];
      if (isPreview && previewAnglesRef.current) {
        seedDegrees = previewAnglesRef.current;
        const anglesRad = seedDegrees.map(deg2rad);
        const transforms = computeForwardKinematics(
          anglesRad,
          ikNodes,
          tcpOffset,
        );
        const eeMat = transforms[transforms.length - 1];
        xyz = [eeMat[0][3], eeMat[1][3], eeMat[2][3]];
      } else {
        seedDegrees = currentDegreesRef.current.slice();
        xyz = currentXYZRef.current;
      }

      const targetXYZ: [number, number, number] = [xyz[0], xyz[1], xyz[2]];
      if (axis === "x") targetXYZ[0] += direction * step;
      if (axis === "y") targetXYZ[1] += direction * step;
      if (axis === "z") targetXYZ[2] += direction * step;

      targetXYZ[2] = Math.max(0.01, targetXYZ[2]);

      setIsComputing(true);
      try {
        const solved = await solveIKAsync(targetXYZ, seedDegrees, solver);

        if (isPreview) {
          setPreviewAngles(solved);
        } else {
          const updates = solved.map((angle, i) => ({
            servoId: joints[i].servoId!,
            value: Math.round(angle),
          }));
          moveJointsSmoothly(updates, 100);
        }
      } finally {
        setIsComputing(false);
      }
    },
    [ikNodes, moveJointsSmoothly, solveIKAsync, tcpOffset],
  );

  const handleGoToXYZ = async (x: number, y: number, z: number) => {
    const isPreview = previewModeRef.current;

    setIsComputing(true);
    try {
      const result = await solveIKWithMetricsAsync(
        [x, y, Math.max(0.01, z)], // prevent table collision
        currentDegrees,
        solverType,
      );

      setLatestSolveMetrics(result.metrics);
      setLastMetricsSummary(
        `${result.metrics.iterationsUsed} iters · ${result.metrics.computationTimeMs.toFixed(1)}ms · ${(result.metrics.finalErrorM * 1000).toFixed(1)}mm`,
      );

      if (isPreview) {
        setPreviewAngles(result.angles);
      } else {
        const updates = result.angles.map((angle, i) => ({
          servoId: revoluteJoints[i].servoId!,
          value: Math.round(angle),
        }));
        moveJointsSmoothly(updates, 800);

        const now = Date.now();
        const fb = feedbackStates ?? jointStates;
        const fbByName = new Map(fb.map((state) => [state.name, state]));
        const trajectoryEntries = result.angles.map((targetAngle, i) => {
          const jointName = revoluteJoints[i]?.name ?? `J${i + 1}`;
          const feedback = fbByName.get(jointName);
          const actualDeg =
            feedback && typeof feedback.degrees === "number"
              ? feedback.degrees
              : currentDegrees[i];
          return {
            timestamp: now,
            jointIndex: i,
            jointName,
            targetDeg: Math.round(targetAngle),
            actualDeg,
          };
        });
        addTrajectoryBatch(trajectoryEntries);
      }
    } finally {
      setIsComputing(false);
    }
  };

  const executePreview = () => {
    if (!previewAngles) return;
    const updates = previewAngles.map((angle, i) => ({
      servoId: revoluteJoints[i].servoId!,
      value: Math.round(angle),
    }));
    const fb = feedbackStates ?? jointStates;
    const maxDelta = previewAngles.reduce((max, target, i) => {
      const curDeg =
        fb[i] && typeof fb[i].degrees === "number"
          ? (fb[i].degrees as number)
          : currentDegrees[i];
      return Math.max(max, Math.abs(target - curDeg));
    }, 0);
    const durationMs = Math.min(3000, Math.max(800, maxDelta * 10));
    moveJointsSmoothly(updates, durationMs);

    const now = Date.now();
    const fbByName = new Map(fb.map((state) => [state.name, state]));
    const trajectoryEntries = previewAngles.map((targetAngle, i) => {
      const jointName = revoluteJoints[i]?.name ?? `J${i + 1}`;
      const feedback = fbByName.get(jointName);
      const actualDeg =
        feedback && typeof feedback.degrees === "number"
          ? feedback.degrees
          : currentDegrees[i];
      return {
        timestamp: now,
        jointIndex: i,
        jointName,
        targetDeg: Math.round(targetAngle),
        actualDeg,
      };
    });
    addTrajectoryBatch(trajectoryEntries);
    setPreviewAngles(null);
  };

  const handleCompare = async () => {
    setComparing(true);
    setIsComputing(true);
    try {
      const inputAngles = currentDegrees.slice();
      const target: [number, number, number] = [
        parseFloat(inputXYZ[0]) || 0,
        parseFloat(inputXYZ[1]) || 0,
        Math.max(0, parseFloat(inputXYZ[2]) || 0),
      ];

      const [jacResult, ccdResult] = await Promise.all([
        solveIK_Jacobian_WithMetricsAsync(target, inputAngles),
        solveIK_CCD_WithMetricsAsync(target, inputAngles),
      ]);

      addIKComparison({
        timestamp: Date.now(),
        targetXYZ: target,
        jacobianMetrics: jacResult.metrics,
        ccdMetrics: ccdResult.metrics,
      });

      setLastMetricsSummary(
        `JAC: ${jacResult.metrics.computationTimeMs.toFixed(1)}ms / ${(jacResult.metrics.finalErrorM * 1000).toFixed(1)}mm  ·  CCD: ${ccdResult.metrics.computationTimeMs.toFixed(1)}ms / ${(ccdResult.metrics.finalErrorM * 1000).toFixed(1)}mm`,
      );

      if (compareTimeoutRef.current) {
        clearTimeout(compareTimeoutRef.current);
      }
      compareTimeoutRef.current = setTimeout(() => {
        setComparing(false);
        compareTimeoutRef.current = null;
      }, 200);
    } finally {
      setIsComputing(false);
    }
  };

  const [inputXYZ, setInputXYZ] = useState<[string, string, string]>(() => {
    return [(0.39).toString(), "0", (0.24).toString()];
  });

  const prevUnitRef = useRef(preferredUnit);
  useEffect(() => {
    if (prevUnitRef.current !== preferredUnit) {
      const oldVals = inputXYZ.map((val) => parseFloat(val) || 0);
      const asMeters = oldVals.map((v) =>
        convertToMeters(v, prevUnitRef.current),
      );
      const asNew = asMeters.map((m) =>
        convertToUnit(m, preferredUnit).toFixed(2),
      );
      setInputXYZ(asNew as [string, string, string]);
      prevUnitRef.current = preferredUnit;
    }
  }, [preferredUnit, inputXYZ]);

  const inputCls =
    "bg-white/5 border border-white/20 rounded px-2 py-1.5 text-sm text-white font-mono tabular-nums outline-none focus:border-indigo-400/60 transition";
  const glassBtn =
    "bg-white/10 hover:bg-white/20 active:bg-white/30 active:scale-95 border border-white/30 shadow-[inset_0_1px_0px_rgba(255,255,255,0.15)] text-sm px-3 py-1.5 rounded font-bold transition-all select-none cursor-pointer";

  return (
    <div className="mt-4 pt-4 border-t border-white/20">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <h4 className="font-bold text-white text-base">
            IK Position Control
          </h4>
          <label className="flex items-center gap-1.5 cursor-pointer ml-1">
            <input
              type="checkbox"
              checked={previewMode}
              onChange={(e) => {
                const checked = e.target.checked;
                setPreviewMode(checked);
                if (checked && !previewAngles) {
                  setPreviewAngles([...currentDegrees]);
                }
              }}
              className="accent-indigo-500 w-3 h-3"
            />
            <span className="text-xs text-zinc-300 font-medium select-none">
              Preview
            </span>
          </label>
        </div>
        <select
          className="bg-white/5 border border-white/20 text-xs px-1.5 py-1 rounded outline-none text-zinc-300"
          value={solverType}
          onChange={(e) => setSolverType(e.target.value as IKSolverType)}
        >
          <option value="ccd">CCD</option>
          <option value="jacobian">Jacobian DLS</option>
          <option value="hybrid">Hybrid (CCD+Jacobian)</option>
        </select>
      </div>

      <div className="bg-white/5 rounded border border-white/15 p-2.5 mb-3">
        <div className="text-xs text-zinc-400 mb-1.5 uppercase tracking-wider font-medium">
          End-Effector Position
        </div>
        <div className="grid grid-cols-3 gap-2 text-center">
          {["X", "Y", "Z"].map((label, i) => (
            <div key={label}>
              <div className="text-xs text-zinc-500 mb-0.5">{label}</div>
              <div className="text-base font-mono text-white tabular-nums font-semibold">
                {formatUnit(currentXYZ[i], preferredUnit)}
                <span className="text-zinc-500 text-xs ml-0.5">
                  {preferredUnit}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {previewMode && ghostXYZ && (
        <div className="bg-amber-900/20 rounded border border-amber-500/30 p-2.5 mb-3">
          <div className="text-xs text-amber-400 mb-1.5 uppercase tracking-wider font-medium">
            ▸ Ghost Target Position
          </div>
          <div className="grid grid-cols-3 gap-2 text-center">
            {["X", "Y", "Z"].map((label, i) => (
              <div key={label}>
                <div className="text-xs text-amber-500/60 mb-0.5">{label}</div>
                <div className="text-base font-mono text-amber-300 tabular-nums font-semibold">
                  {formatUnit(ghostXYZ[i], preferredUnit)}
                  <span className="text-amber-500/60 text-xs ml-0.5">
                    {preferredUnit}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-zinc-400">Jog Step</span>
        <select
          className="bg-white/5 border border-white/15 text-xs px-1.5 py-1 rounded outline-none text-zinc-300"
          value={xyzStep}
          onChange={(e) => setXyzStep(parseFloat(e.target.value))}
        >
          <option value={0.005}>
            {formatUnit(0.005, preferredUnit)} {preferredUnit}
          </option>
          <option value={0.01}>
            {formatUnit(0.01, preferredUnit)} {preferredUnit}
          </option>
          <option value={0.02}>
            {formatUnit(0.02, preferredUnit)} {preferredUnit}
          </option>
          <option value={0.05}>
            {formatUnit(0.05, preferredUnit)} {preferredUnit}
          </option>
        </select>
      </div>

      <div className="grid grid-cols-3 gap-2 mb-3">
        {(["x", "y", "z"] as const).map((axis) => (
          <JogButtonPair
            key={axis}
            label={axis.toUpperCase()}
            onMinus={() => jogXYZ(axis, -1)}
            onPlus={() => jogXYZ(axis, 1)}
            btnClass={glassBtn}
          />
        ))}
      </div>

      <div className="flex gap-1.5 items-end mb-2">
        {["X", "Y", "Z"].map((label, i) => (
          <div key={label} className="flex-1">
            <label className="text-xs text-zinc-400 block mb-1">
              {label} ({preferredUnit})
            </label>
            <input
              type="number"
              step={convertToUnit(xyzStep, preferredUnit)}
              className={`${inputCls} w-full text-center`}
              value={inputXYZ[i]}
              onChange={(e) => {
                const n = [...inputXYZ] as [string, string, string];
                n[i] = e.target.value;
                setInputXYZ(n);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  handleGoToXYZ(
                    convertToMeters(
                      parseFloat(inputXYZ[0]) || 0,
                      preferredUnit,
                    ),
                    convertToMeters(
                      parseFloat(inputXYZ[1]) || 0,
                      preferredUnit,
                    ),
                    convertToMeters(
                      parseFloat(inputXYZ[2]) || 0,
                      preferredUnit,
                    ),
                  );
                }
              }}
            />
          </div>
        ))}
        <button
          disabled={isComputing}
          onClick={() =>
            handleGoToXYZ(
              convertToMeters(parseFloat(inputXYZ[0]) || 0, preferredUnit),
              convertToMeters(parseFloat(inputXYZ[1]) || 0, preferredUnit),
              convertToMeters(parseFloat(inputXYZ[2]) || 0, preferredUnit),
            )
          }
          className={`${glassBtn} bg-indigo-600/40 hover:bg-indigo-500/50 border-indigo-400/40 px-4`}
        >
          Go
        </button>
      </div>

      {previewMode && previewAngles && (
        <button
          onClick={executePreview}
          className="w-full bg-amber-600/40 hover:bg-amber-500/60 text-amber-200 font-bold text-xs py-2 rounded transition border border-amber-500/50 mb-2 shadow-[0_0_10px_rgba(217,119,6,0.2)]"
        >
          Execute Preview Target
        </button>
      )}

      <button
        onClick={handleCompare}
        disabled={comparing || isComputing}
        className="w-full bg-emerald-600/30 hover:bg-emerald-500/40 text-emerald-300 font-medium text-xs py-1.5 rounded transition border border-emerald-500/30 disabled:opacity-50 mb-1"
      >
        Compare Solvers
      </button>

      {lastMetricsSummary && (
        <div className="text-[10px] text-zinc-400 bg-black/30 rounded px-2 py-1.5 mt-1 font-mono">
          {lastMetricsSummary}
        </div>
      )}
    </div>
  );
});

function JogButtonPair({
  label,
  onMinus,
  onPlus,
  btnClass,
}: {
  label: string;
  onMinus: () => void;
  onPlus: () => void;
  btnClass: string;
}) {
  const minusProps = usePressAndHold(onMinus, 150);
  const plusProps = usePressAndHold(onPlus, 150);

  return (
    <div className="flex items-center gap-1">
      <button className={`${btnClass} active:bg-rose-500/30`} {...minusProps}>
        −
      </button>
      <span className="text-sm font-mono font-bold text-zinc-300 flex-1 text-center">
        {label}
      </span>
      <button className={`${btnClass} active:bg-emerald-500/30`} {...plusProps}>
        +
      </button>
    </div>
  );
}
