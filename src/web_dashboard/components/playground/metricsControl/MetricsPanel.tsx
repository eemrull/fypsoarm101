"use client";

import React, { useState, useEffect } from "react";
import { Rnd } from "react-rnd";
import useMeasure from "react-use-measure";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  BarChart,
  Bar,
  ResponsiveContainer,
} from "recharts";
import {
  panelStyle,
  panelHeaderClass,
  panelCloseButtonClass,
  panelIconButtonClass,
  panelButtonClass,
} from "../panelStyle";
import {
  useMetricsStore,
  exportTrajectoryCSV,
  exportComparisonCSV,
  type MetricsState,
  type TrajectoryEntry,
  type IKComparisonEntry,
} from "@/store/useMetricsStore";
import type { IKSolverMetrics } from "@/lib/kinematics/IKSolver";
import { Download, Trash2, BarChart3 } from "lucide-react";
import { GripDots } from "@/components/playground/GripDots";
import { useCloseOnEscape } from "@/components/playground/usePanelA11y";
import {
  getPanelPosition,
  setPanelPosition,
  getPanelSize,
  setPanelSize,
  getDefaultPanelPosition,
  DEFAULT_PANEL_SIZES,
} from "@/lib/panelSettings";

// ─── Color palette for joints ────────────────────────────────────────────────
const JOINT_COLORS = [
  "#818cf8", // indigo-400
  "#34d399", // emerald-400
  "#fb923c", // orange-400
  "#f472b6", // pink-400
  "#38bdf8", // sky-400
  "#a78bfa", // violet-400
];

type TabId = "convergence" | "comparison" | "trajectory";

interface MetricsPanelProps {
  show: boolean;
  onHide: () => void;
}

export const MetricsPanel = React.memo(function MetricsPanel({
  show,
  onHide,
}: MetricsPanelProps) {
  const [ref, bounds] = useMeasure();
  const [position, setPosition] = useState(
    () => getPanelPosition("metricsControl", "global") ?? { x: 0, y: 0 },
  );
  const [hasInitPos, setHasInitPos] = useState(
    () => getPanelPosition("metricsControl", "global") !== null,
  );

  useEffect(() => {
    if (bounds.width > 0 && bounds.height > 0 && !hasInitPos) {
      const nextPos = setPanelPosition(
        "metricsControl",
        {
          x: Math.max(20, window.innerWidth - bounds.width - 20),
          y: 20,
        },
        "global",
      );
      setPosition(nextPos);
      setHasInitPos(true);
    }
  }, [bounds.height, bounds.width, hasInitPos]);

  useEffect(() => {
    const handleResize = () => {
      const clampedPos = getPanelPosition("metricsControl", "global");
      if (clampedPos) {
        setPosition(clampedPos);
      }
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);
  const [activeTab, setActiveTab] = useState<TabId>("convergence");
  const trajectoryLog = useMetricsStore(
    (state: MetricsState) => state.trajectoryLog,
  );
  const ikComparisonLog = useMetricsStore(
    (state: MetricsState) => state.ikComparisonLog,
  );
  const latestSolveMetrics = useMetricsStore(
    (state: MetricsState) => state.latestSolveMetrics,
  );
  const clearTrajectoryLog = useMetricsStore(
    (state: MetricsState) => state.clearTrajectoryLog,
  );
  const clearAll = useMetricsStore((state: MetricsState) => state.clearAll);

  const tabs: { id: TabId; label: string }[] = [
    { id: "convergence", label: "Convergence" },
    { id: "comparison", label: "Comparison" },
    { id: "trajectory", label: "Trajectory" },
  ];

  const [isMounted, setIsMounted] = useState(false);
  useEffect(() => setIsMounted(true), []);
  useCloseOnEscape(show && isMounted, onHide);

  if (!show || !isMounted) return null;

  return (
    <Rnd
      default={{
        ...getDefaultPanelPosition("metricsControl"),
        width:
          getPanelSize("metricsControl", "global")?.width ??
          DEFAULT_PANEL_SIZES.metricsControl.width,
        height:
          getPanelSize("metricsControl", "global")?.height ??
          DEFAULT_PANEL_SIZES.metricsControl.height,
      }}
      position={position}
      minWidth={320}
      minHeight={260}
      onDragStop={(_e, d) => {
        const nextPos = setPanelPosition(
          "metricsControl",
          { x: d.x, y: d.y },
          "global",
        );
        setPosition(nextPos);
      }}
      enableResizing={true}
      onResizeStop={(_e, _dir, ref, _delta, nextPos) => {
        setPanelSize(
          "metricsControl",
          { width: ref.offsetWidth, height: ref.offsetHeight },
          "global",
        );
        const clampedPos = setPanelPosition("metricsControl", nextPos, "global");
        setPosition(clampedPos);
      }}
      bounds="window"
      className="rnd-viewport-clamp z-50"
      dragHandleClassName="panel-drag-handle"
      style={{
        ["--panel-x" as string]: `${position.x}px`,
        ["--panel-y" as string]: `${position.y}px`,
      }}
    >
      <div
        ref={ref}
        className={`w-full h-full flex flex-col overflow-y-auto text-sm select-none ${panelStyle}`}
      >
        <div className="relative z-10">
          <div className={panelHeaderClass}>
            <div className="flex items-center gap-2">
              <GripDots />
              <BarChart3 className="w-4 h-4 text-indigo-400" />
              <h3 className="font-bold text-base text-white">IK Analyzer</h3>
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={clearAll}
                title="Clear all metrics"
                aria-label="Clear all metrics"
                className={`${panelIconButtonClass} h-8 w-8 text-zinc-300 hover:text-red-300`}
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={onHide}
                onTouchEnd={onHide}
                className={panelCloseButtonClass}
                aria-label="Close metrics panel"
                title="Close"
              >
                x
              </button>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex gap-1 mb-3 bg-black/30 rounded-md p-0.5">
            {tabs.map((tab: { id: TabId; label: string }) => (
              <button
                key={tab.id}
                type="button"
                className={`flex-1 text-xs py-1.5 px-2 rounded transition font-medium ${
                  activeTab === tab.id
                    ? "bg-indigo-600/80 text-white shadow"
                    : "text-zinc-400 hover:text-white hover:bg-white/5"
                }`}
                onClick={() => setActiveTab(tab.id)}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Tab Content */}
          {activeTab === "convergence" && (
            <ConvergenceChart metrics={latestSolveMetrics} />
          )}
          {activeTab === "comparison" && (
            <ComparisonChart comparison={ikComparisonLog} />
          )}
          {activeTab === "trajectory" && (
            <TrajectoryChart
              log={trajectoryLog}
              onExport={() => exportTrajectoryCSV(trajectoryLog)}
              onClear={clearTrajectoryLog}
            />
          )}
        </div>
      </div>
    </Rnd>
  );
});

// ─── Convergence Tab ────────────────────────────────────────────────────────────

function ConvergenceChart({
  metrics,
}: {
  metrics: IKSolverMetrics | null;
}) {
  if (!metrics) {
    return (
      <div className="text-xs text-zinc-500 text-center py-8">
        No solve data yet. Use the IK panel to solve a target position.
      </div>
    );
  }

  const data = metrics.convergenceHistory.map((error: number, i: number) => ({
    iteration: i + 1,
    error: parseFloat((error * 1000).toFixed(3)), // convert to mm for readability
  }));
  const solverLabel =
    metrics.solverType === "jacobian"
      ? "Jacobian DLS"
      : metrics.solverType === "hybrid"
        ? "Hybrid (CCD+Jacobian)"
        : "CCD";

  return (
    <div>
      {/* Stats row */}
      <div className="grid grid-cols-3 gap-2 mb-3">
        <StatBox
          label="Solver"
          value={solverLabel}
        />
        <StatBox label="Iterations" value={String(metrics.iterationsUsed)} />
        <StatBox
          label="Time"
          value={`${metrics.computationTimeMs.toFixed(1)}ms`}
        />
      </div>
      <div className="grid grid-cols-2 gap-2 mb-3">
        <StatBox
          label="Final Error"
          value={`${(metrics.finalErrorM * 1000).toFixed(2)}mm`}
        />
        <StatBox
          label="Status"
          value={metrics.converged ? "✅ Converged" : "⚠️ Max Iters"}
          valueClass={metrics.converged ? "text-emerald-400" : "text-amber-400"}
        />
      </div>

      {/* Chart */}
      <div className="h-44 -mx-2">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data}>
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="rgba(255,255,255,0.08)"
            />
            <XAxis
              dataKey="iteration"
              tick={{ fill: "#a1a1aa", fontSize: 10 }}
              label={{
                value: "Iteration",
                position: "insideBottom",
                offset: -2,
                fill: "#a1a1aa",
                fontSize: 10,
              }}
            />
            <YAxis
              tick={{ fill: "#a1a1aa", fontSize: 10 }}
              label={{
                value: "Error (mm)",
                angle: -90,
                position: "insideLeft",
                fill: "#a1a1aa",
                fontSize: 10,
              }}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: "rgba(0,0,0,0.85)",
                border: "1px solid rgba(255,255,255,0.15)",
                borderRadius: "8px",
                fontSize: 11,
              }}
              formatter={(value: unknown) => [
                `${Number(value).toFixed(3)} mm`,
                "Error",
              ]}
            />
            <Line
              type="monotone"
              dataKey="error"
              stroke="#818cf8"
              strokeWidth={2}
              dot={false}
              animationDuration={300}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ─── Comparison Tab ─────────────────────────────────────────────────────────────

function ComparisonChart({
  comparison,
}: {
  comparison: IKComparisonEntry[];
}) {
  const latest =
    comparison.length > 0 ? comparison[comparison.length - 1] : null;

  if (!latest) {
    return (
      <div className="text-xs text-zinc-500 text-center py-8">
        No comparison data yet. Use &ldquo;Compare Solvers&rdquo; in the IK
        panel.
      </div>
    );
  }

  const jac = latest.jacobianMetrics;
  const ccd = latest.ccdMetrics;

  // Bar chart data
  const barData = [
    {
      metric: "Time (ms)",
      Jacobian: parseFloat(jac.computationTimeMs.toFixed(2)),
      CCD: parseFloat(ccd.computationTimeMs.toFixed(2)),
    },
    {
      metric: "Iterations",
      Jacobian: jac.iterationsUsed,
      CCD: ccd.iterationsUsed,
    },
    {
      metric: "Error (mm)",
      Jacobian: parseFloat((jac.finalErrorM * 1000).toFixed(3)),
      CCD: parseFloat((ccd.finalErrorM * 1000).toFixed(3)),
    },
  ];

  // Convergence overlay
  const maxLen = Math.max(
    jac.convergenceHistory.length,
    ccd.convergenceHistory.length,
  );
  const convergenceData = Array.from({ length: maxLen }, (_: unknown, i: number) => ({
    iteration: i + 1,
    jacobian:
      i < jac.convergenceHistory.length
        ? parseFloat((jac.convergenceHistory[i] * 1000).toFixed(3))
        : null,
    ccd:
      i < ccd.convergenceHistory.length
        ? parseFloat((ccd.convergenceHistory[i] * 1000).toFixed(3))
        : null,
  }));

  return (
    <div>
      {/* Summary stats */}
      <div className="grid grid-cols-2 gap-2 mb-3">
        <div className="bg-indigo-500/10 border border-indigo-500/20 rounded-md p-2">
          <div className="text-[10px] text-indigo-400 uppercase tracking-wider font-semibold mb-1">
            Jacobian DLS
          </div>
          <div className="text-xs text-white">
            {jac.iterationsUsed} iters · {jac.computationTimeMs.toFixed(1)}ms ·{" "}
            {(jac.finalErrorM * 1000).toFixed(2)}mm
          </div>
          <div
            className={`text-[10px] mt-0.5 ${jac.converged ? "text-emerald-400" : "text-amber-400"}`}
          >
            {jac.converged ? "Converged ✓" : "Max iterations reached"}
          </div>
        </div>
        <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-md p-2">
          <div className="text-[10px] text-emerald-400 uppercase tracking-wider font-semibold mb-1">
            CCD
          </div>
          <div className="text-xs text-white">
            {ccd.iterationsUsed} iters · {ccd.computationTimeMs.toFixed(1)}ms ·{" "}
            {(ccd.finalErrorM * 1000).toFixed(2)}mm
          </div>
          <div
            className={`text-[10px] mt-0.5 ${ccd.converged ? "text-emerald-400" : "text-amber-400"}`}
          >
            {ccd.converged ? "Converged ✓" : "Max iterations reached"}
          </div>
        </div>
      </div>

      {/* Bar chart */}
      <div className="text-[10px] text-zinc-400 uppercase tracking-wider font-semibold mb-1">
        Algorithm Comparison
      </div>
      <div className="h-32 -mx-2 mb-3">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={barData}>
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="rgba(255,255,255,0.08)"
            />
            <XAxis dataKey="metric" tick={{ fill: "#a1a1aa", fontSize: 10 }} />
            <YAxis tick={{ fill: "#a1a1aa", fontSize: 10 }} />
            <Tooltip
              contentStyle={{
                backgroundColor: "rgba(0,0,0,0.85)",
                border: "1px solid rgba(255,255,255,0.15)",
                borderRadius: "8px",
                fontSize: 11,
              }}
            />
            <Bar dataKey="Jacobian" fill="#818cf8" radius={[4, 4, 0, 0]} />
            <Bar dataKey="CCD" fill="#34d399" radius={[4, 4, 0, 0]} />
            <Legend wrapperStyle={{ fontSize: 10, color: "#a1a1aa" }} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Convergence overlay */}
      <div className="text-[10px] text-zinc-400 uppercase tracking-wider font-semibold mb-1">
        Convergence Overlay
      </div>
      <div className="h-36 -mx-2">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={convergenceData}>
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="rgba(255,255,255,0.08)"
            />
            <XAxis
              dataKey="iteration"
              tick={{ fill: "#a1a1aa", fontSize: 10 }}
            />
            <YAxis tick={{ fill: "#a1a1aa", fontSize: 10 }} />
            <Tooltip
              contentStyle={{
                backgroundColor: "rgba(0,0,0,0.85)",
                border: "1px solid rgba(255,255,255,0.15)",
                borderRadius: "8px",
                fontSize: 11,
              }}
              formatter={(value: unknown) =>
                value !== null ? [`${Number(value).toFixed(3)} mm`] : ["—"]
              }
            />
            <Legend wrapperStyle={{ fontSize: 10 }} />
            <Line
              type="monotone"
              dataKey="jacobian"
              name="Jacobian"
              stroke="#818cf8"
              strokeWidth={2}
              dot={false}
              connectNulls
            />
            <Line
              type="monotone"
              dataKey="ccd"
              name="CCD"
              stroke="#34d399"
              strokeWidth={2}
              dot={false}
              connectNulls
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Export */}
      <button
        type="button"
        onClick={() => exportComparisonCSV(comparison)}
        className={`mt-2 w-full flex items-center justify-center gap-1.5 ${panelButtonClass}`}
      >
        <Download className="w-3 h-3" /> Export CSV
      </button>
    </div>
  );
}

// ─── Trajectory Tab ─────────────────────────────────────────────────────────────

function TrajectoryChart({
  log,
  onExport,
  onClear,
}: {
  log: TrajectoryEntry[];
  onExport: () => void;
  onClear: () => void;
}) {
  if (log.length === 0) {
    return (
      <div className="text-xs text-zinc-500 text-center py-8">
        No trajectory data yet. Solve targets with the IK panel to log target vs
        actual joint angles.
      </div>
    );
  }

  // Group by timestamp to create time-series data for each joint
  const jointNames = [
    ...new Set(log.map((e: TrajectoryEntry) => e.jointName)),
  ];
  const timestamps = [
    ...new Set(log.map((e: TrajectoryEntry) => e.timestamp)),
  ].sort((a: number, b: number) => a - b);

  // Build chart data: each row is one timestamp with error per joint
  const chartData = timestamps.map((ts: number, idx: number) => {
    const row: Record<string, number> = { index: idx };
    const entriesAtTs = log.filter(
      (e: TrajectoryEntry) => e.timestamp === ts,
    );
    entriesAtTs.forEach((entry: TrajectoryEntry) => {
      row[entry.jointName] = parseFloat(
        Math.abs(entry.targetDeg - entry.actualDeg).toFixed(2),
      );
    });
    return row;
  });

  return (
    <div>
      <div className="text-[10px] text-zinc-400 uppercase tracking-wider font-semibold mb-1">
        Joint Trajectory Error (|Target − Actual|)
      </div>
      <div className="h-44 -mx-2">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData}>
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="rgba(255,255,255,0.08)"
            />
            <XAxis
              dataKey="index"
              tick={{ fill: "#a1a1aa", fontSize: 10 }}
              label={{
                value: "Sample",
                position: "insideBottom",
                offset: -2,
                fill: "#a1a1aa",
                fontSize: 10,
              }}
            />
            <YAxis
              tick={{ fill: "#a1a1aa", fontSize: 10 }}
              label={{
                value: "Error (°)",
                angle: -90,
                position: "insideLeft",
                fill: "#a1a1aa",
                fontSize: 10,
              }}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: "rgba(0,0,0,0.85)",
                border: "1px solid rgba(255,255,255,0.15)",
                borderRadius: "8px",
                fontSize: 11,
              }}
              formatter={(value: unknown) => [`${Number(value).toFixed(2)}°`]}
            />
            <Legend wrapperStyle={{ fontSize: 10 }} />
            {jointNames.map((name: string, i: number) => (
              <Line
                key={name}
                type="monotone"
                dataKey={name}
                name={name}
                stroke={JOINT_COLORS[i % JOINT_COLORS.length]}
                strokeWidth={1.5}
                dot={false}
                connectNulls
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Actions */}
      <div className="flex gap-2 mt-2">
        <button
          type="button"
          onClick={onExport}
          className={`flex-1 flex items-center justify-center gap-1.5 ${panelButtonClass}`}
        >
          <Download className="w-3 h-3" /> Export CSV
        </button>
        <button
          type="button"
          onClick={onClear}
          aria-label="Clear trajectory data"
          className={`${panelIconButtonClass} h-8 w-10 text-zinc-300 hover:text-red-300`}
        >
          <Trash2 className="w-3 h-3" />
        </button>
      </div>
    </div>
  );
}

// ─── Stat Box ───────────────────────────────────────────────────────────────────

function StatBox({
  label,
  value,
  valueClass,
}: {
  label: string;
  value: string;
  valueClass?: string;
}) {
  return (
    <div className="bg-white/5 rounded-md px-2 py-1.5 border border-white/8">
      <div className="text-[9px] text-zinc-500 uppercase tracking-wider font-semibold">
        {label}
      </div>
      <div className={`text-xs font-medium ${valueClass || "text-white"}`}>
        {value}
      </div>
    </div>
  );
}


