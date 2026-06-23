"use client";

import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
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
  ResponsiveContainer,
} from "recharts";
import {
  panelStyle,
  panelHeaderClass,
  panelCloseButtonClass,
  panelIconButtonClass,
} from "@/components/playground/panelStyle";
import { GripDots } from "@/components/playground/GripDots";
import { useRobotProfileStore } from "@/store/useRobotProfileStore";
import { useCloseOnEscape } from "@/components/playground/usePanelA11y";
import {
  getPanelPosition,
  setPanelPosition,
  getPanelSize,
  setPanelSize,
  getDefaultPanelPosition,
  DEFAULT_PANEL_SIZES,
} from "@/lib/panelSettings";
import { Activity, Download, Trash2, Play, Square } from "lucide-react";

// ─── Types ──────────────────────────────────────────────────────────────────

const JOINT_COLORS = [
  "#818cf8",
  "#34d399",
  "#fb923c",
  "#f472b6",
  "#38bdf8",
  "#a78bfa",
];

type PidSample = {
  time: number; // ms since recording started
  [key: string]: number; // e.g. "Rotation_target", "Rotation_actual"
};

interface PidResponsePanelProps {
  show: boolean;
  onHide: () => void;
  rosConnected: boolean;
  subscribePidResponse: (
    callback: (msg: Record<string, unknown>) => void,
  ) => () => void;
}

const PANEL_ID = "pidResponsePanel";
const MAX_SAMPLES = 500;

export const PidResponsePanel = React.memo(function PidResponsePanel({
  show,
  onHide,
  rosConnected,
  subscribePidResponse,
}: PidResponsePanelProps) {
  const profileJointNames = useRobotProfileStore((state) => state.joints);
  const [ref, bounds] = useMeasure();
  const [position, setPosition] = useState(
    () => getPanelPosition(PANEL_ID, "global") ?? { x: 0, y: 0 },
  );
  const [hasInitPos, setHasInitPos] = useState(
    () => getPanelPosition(PANEL_ID, "global") !== null,
  );

  const [isRecording, setIsRecording] = useState(false);
  const [samples, setSamples] = useState<PidSample[]>([]);
  const [selectedJoint, setSelectedJoint] = useState(0);
  const startTimeRef = useRef<number>(0);
  const pidUnsubscribeRef = useRef<(() => void) | null>(null);
  const [isMounted, setIsMounted] = useState(false);
  useEffect(() => setIsMounted(true), []);
  useCloseOnEscape(show && isMounted, onHide);

  const jointNames = useMemo(() => {
    if (profileJointNames.length > 0) {
      return profileJointNames;
    }

    const firstSample = samples[0];
    if (!firstSample) {
      return [] as string[];
    }

    return Object.keys(firstSample)
      .filter((key) => key.endsWith("_target"))
      .map((key) => key.slice(0, -"_target".length));
  }, [profileJointNames, samples]);

  useEffect(() => {
    setSelectedJoint((prev) =>
      jointNames.length === 0 ? 0 : Math.min(prev, jointNames.length - 1),
    );
  }, [jointNames]);

  useEffect(() => {
    if (bounds.width > 0 && bounds.height > 0 && !hasInitPos) {
      const nextPos = setPanelPosition(
        PANEL_ID,
        {
          x: Math.max(20, window.innerWidth - bounds.width - 20),
          y: 80,
        },
        "global",
      );
      setPosition(nextPos);
      setHasInitPos(true);
    }
  }, [bounds.height, bounds.width, hasInitPos]);

  useEffect(() => {
    const handleResize = () => {
      const clampedPos = getPanelPosition(PANEL_ID, "global");
      if (clampedPos) {
        setPosition(clampedPos);
      }
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const startRecording = useCallback(() => {
    if (!rosConnected) {
      console.warn("[PID] Rosbridge client is not connected");
      return;
    }

    if (pidUnsubscribeRef.current) {
      pidUnsubscribeRef.current();
      pidUnsubscribeRef.current = null;
    }

    startTimeRef.current = performance.now();

    const callback = (message: Record<string, unknown>) => {
      const data = message.data;
      if (!Array.isArray(data) || data.length < 2) return;

      const numericData = data.map((entry) => Number(entry));
      if (numericData.some((entry) => !Number.isFinite(entry))) return;
      const pairCount = Math.floor(numericData.length / 2);
      if (pairCount === 0) return;

      const timeMs = performance.now() - startTimeRef.current;
      const sample: PidSample = { time: parseFloat(timeMs.toFixed(1)) };
      const activeJointNames = Array.from({ length: pairCount }, (_, index) =>
        jointNames[index] ?? `Joint_${index + 1}`,
      );

      for (let i = 0; i < pairCount; i++) {
        const targetRad = numericData[i * 2];
        const actualRad = numericData[i * 2 + 1];
        // Convert to degrees
        sample[`${activeJointNames[i]}_target`] = parseFloat(
          ((targetRad * 180) / Math.PI).toFixed(2),
        );
        sample[`${activeJointNames[i]}_actual`] = parseFloat(
          ((actualRad * 180) / Math.PI).toFixed(2),
        );
      }

      setSamples((prev) => {
        const next = [...prev, sample];
        return next.length > MAX_SAMPLES
          ? next.slice(next.length - MAX_SAMPLES)
          : next;
      });
    };

    pidUnsubscribeRef.current = subscribePidResponse(callback);
    setIsRecording(true);
  }, [jointNames, rosConnected, subscribePidResponse]);

  const stopRecording = useCallback(() => {
    if (pidUnsubscribeRef.current) {
      pidUnsubscribeRef.current();
      pidUnsubscribeRef.current = null;
    }
    setIsRecording(false);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => stopRecording();
  }, [stopRecording]);

  useEffect(() => {
    if (!rosConnected && isRecording) {
      stopRecording();
    }
  }, [isRecording, rosConnected, stopRecording]);

  useEffect(() => {
    if (!show && isRecording) {
      stopRecording();
    }
  }, [isRecording, show, stopRecording]);
  const clearSamples = useCallback(() => {
    setSamples([]);
  }, []);

  const exportCSV = useCallback(() => {
    if (samples.length === 0) return;

    const headers = ["time_ms"];
    for (const name of jointNames) {
      headers.push(`${name}_target_deg`, `${name}_actual_deg`);
    }

    const rows = samples.map((s) => {
      const vals = [s.time];
      for (const name of jointNames) {
        vals.push(s[`${name}_target`] ?? 0, s[`${name}_actual`] ?? 0);
      }
      return vals.join(",");
    });

    const csv = [headers.join(","), ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `pid_response_${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [jointNames, samples]);

  const selectedJointName = jointNames[selectedJoint] ?? jointNames[0] ?? "Joint_1";
  const metrics = useMemo(
    () => computeMetrics(samples, selectedJointName),
    [samples, selectedJointName],
  );
  if (!show || !isMounted) return null;

  return (
    <Rnd
      default={{
        ...getDefaultPanelPosition(PANEL_ID),
        width:
          getPanelSize(PANEL_ID, "global")?.width ??
          DEFAULT_PANEL_SIZES.pidPanel.width,
        height:
          getPanelSize(PANEL_ID, "global")?.height ??
          DEFAULT_PANEL_SIZES.pidPanel.height,
      }}
      position={position}
      minWidth={360}
      minHeight={280}
      onDragStop={(_e, d) => {
        const nextPos = setPanelPosition(PANEL_ID, { x: d.x, y: d.y }, "global");
        setPosition(nextPos);
      }}
      enableResizing={true}
      onResizeStop={(_e, _dir, ref, _delta, nextPos) => {
        setPanelSize(
          PANEL_ID,
          { width: ref.offsetWidth, height: ref.offsetHeight },
          "global",
        );
        const clampedPos = setPanelPosition(PANEL_ID, nextPos, "global");
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
          {/* Header */}
          <div className={panelHeaderClass}>
            <div className="flex items-center gap-2">
              <GripDots />
              <Activity className="w-4 h-4 text-emerald-400" />
              <h3 className="font-bold text-base text-white">
                PID Step Response
              </h3>
            </div>
            <button
              type="button"
              onClick={onHide}
              onTouchEnd={onHide}
              className={panelCloseButtonClass}
              aria-label="Close PID response panel"
              title="Close"
            >
              x
            </button>
          </div>

          {/* Controls */}
          <div className="flex items-center gap-2 mb-3">
            {!isRecording ? (
              <button
                type="button"
                onClick={startRecording}
                disabled={!rosConnected}
                className={`flex items-center gap-1.5 text-xs py-1.5 px-3 rounded text-white transition font-medium ${
                  rosConnected
                    ? "bg-emerald-600/80 hover:bg-emerald-500"
                    : "bg-zinc-700/80 cursor-not-allowed opacity-60"
                }`}
                title={
                  rosConnected
                    ? "Start recording PID response"
                    : "Connect ROSbridge first"
                }
              >
                <Play className="w-3 h-3" /> Record
              </button>
            ) : (
              <button
                type="button"
                onClick={stopRecording}
                className="flex items-center gap-1.5 text-xs py-1.5 px-3 rounded bg-red-600/80 hover:bg-red-500 text-white transition font-medium"
              >
                <Square className="w-3 h-3" /> Stop
              </button>
            )}
            <button
              type="button"
              onClick={clearSamples}
              className={`${panelIconButtonClass} h-8 w-8 text-zinc-300 hover:text-red-300`}
              aria-label="Clear PID samples"
              title="Clear data"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={exportCSV}
              disabled={samples.length === 0}
              className={`${panelIconButtonClass} h-8 w-8 text-zinc-300 hover:text-white disabled:opacity-30`}
              aria-label="Export PID response CSV"
              title="Export CSV"
            >
              <Download className="w-3.5 h-3.5" />
            </button>

            <div className="ml-auto flex items-center gap-1">
              <span
                className={`w-2 h-2 rounded-full ${isRecording ? "bg-emerald-400 animate-pulse" : "bg-zinc-600"}`}
              />
              <span className="text-[10px] text-zinc-400">
                {isRecording
                  ? `${samples.length} samples`
                  : samples.length > 0
                    ? `${samples.length} recorded`
                    : "Idle"}
              </span>
            </div>
          </div>

          {/* Joint selector */}
          <div className="flex gap-1 mb-3 bg-black/30 rounded-md p-0.5 flex-wrap">
            {jointNames.map((name, i) => (
              <button
                key={name}
                type="button"
                className={`text-[10px] py-1 px-2 rounded transition font-medium ${
                  selectedJoint === i
                    ? "bg-indigo-600/80 text-white shadow"
                    : "text-zinc-400 hover:text-white hover:bg-white/5"
                }`}
                onClick={() => setSelectedJoint(i)}
              >
                {name.replace("_", " ")}
              </button>
            ))}
          </div>

          {/* Chart */}
          {samples.length === 0 ? (
            <div className="text-xs text-zinc-500 text-center py-8">
              Connect to robot, click <strong>Record</strong>, then move a joint
              to capture step response data.
            </div>
          ) : (
            <>
              <div className="h-48 -mx-2">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={samples}>
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke="rgba(255,255,255,0.08)"
                    />
                    <XAxis
                      dataKey="time"
                      tick={{ fill: "#a1a1aa", fontSize: 10 }}
                      label={{
                        value: "Time (ms)",
                        position: "insideBottom",
                        offset: -2,
                        fill: "#a1a1aa",
                        fontSize: 10,
                      }}
                    />
                    <YAxis
                      tick={{ fill: "#a1a1aa", fontSize: 10 }}
                      label={{
                        value: "Angle (°)",
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
                    />
                    <Legend wrapperStyle={{ fontSize: 10 }} />
                    {/* Target (dashed) */}
                    <Line
                      type="monotone"
                      dataKey={`${selectedJointName}_target`}
                      name="Target"
                      stroke={JOINT_COLORS[selectedJoint % JOINT_COLORS.length]}
                      strokeWidth={2}
                      strokeDasharray="6 3"
                      dot={false}
                      isAnimationActive={false}
                    />
                    {/* Actual (solid) */}
                    <Line
                      type="monotone"
                      dataKey={`${selectedJointName}_actual`}
                      name="Actual"
                      stroke="#f59e0b"
                      strokeWidth={2}
                      dot={false}
                      isAnimationActive={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>

              {/* Step Response Metrics */}
              {metrics && (
                <div className="grid grid-cols-4 gap-2 mt-3">
                  <MetricBox
                    label="Rise Time"
                    value={
                      metrics.riseTimeMs !== null
                        ? `${metrics.riseTimeMs.toFixed(0)}ms`
                        : "—"
                    }
                  />
                  <MetricBox
                    label="Overshoot"
                    value={
                      metrics.overshootPct !== null
                        ? `${metrics.overshootPct.toFixed(1)}%`
                        : "—"
                    }
                    valueClass={
                      metrics.overshootPct !== null && metrics.overshootPct > 10
                        ? "text-amber-400"
                        : "text-emerald-400"
                    }
                  />
                  <MetricBox
                    label="Settle"
                    value={
                      metrics.settlingTimeMs !== null
                        ? `${metrics.settlingTimeMs.toFixed(0)}ms`
                        : "—"
                    }
                  />
                  <MetricBox
                    label="SS Error"
                    value={
                      metrics.ssError !== null
                        ? `${metrics.ssError.toFixed(2)}°`
                        : "—"
                    }
                    valueClass={
                      metrics.ssError !== null && metrics.ssError > 2
                        ? "text-red-400"
                        : "text-emerald-400"
                    }
                  />
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </Rnd>
  );
});

// ─── Step Response Metric Computation ────────────────────────────────────────

type StepMetrics = {
  riseTimeMs: number | null;
  overshootPct: number | null;
  settlingTimeMs: number | null;
  ssError: number | null;
};

function computeMetrics(samples: PidSample[], jointName: string): StepMetrics {
  if (samples.length < 10)
    return {
      riseTimeMs: null,
      overshootPct: null,
      settlingTimeMs: null,
      ssError: null,
    };

  const targets = samples.map((s) => s[`${jointName}_target`] ?? 0);
  const actuals = samples.map((s) => s[`${jointName}_actual`] ?? 0);
  const times = samples.map((s) => s.time);

  // Find the step: where target changes significantly
  const initialTarget = targets[0];
  const finalTarget = targets[targets.length - 1];
  const stepSize = Math.abs(finalTarget - initialTarget);

  if (stepSize < 1) {
    // No significant step detected
    return {
      riseTimeMs: null,
      overshootPct: null,
      settlingTimeMs: null,
      ssError: null,
    };
  }

  const initialActual = actuals[0];

  // Rise time: time from 10% to 90% of step
  const target10 = initialActual + 0.1 * (finalTarget - initialActual);
  const target90 = initialActual + 0.9 * (finalTarget - initialActual);
  let riseStart: number | null = null;
  let riseEnd: number | null = null;

  for (let i = 0; i < actuals.length; i++) {
    if (
      riseStart === null &&
      (finalTarget > initialActual
        ? actuals[i] >= target10
        : actuals[i] <= target10)
    ) {
      riseStart = times[i];
    }
    if (
      riseEnd === null &&
      (finalTarget > initialActual
        ? actuals[i] >= target90
        : actuals[i] <= target90)
    ) {
      riseEnd = times[i];
    }
  }

  const riseTimeMs =
    riseStart !== null && riseEnd !== null ? riseEnd - riseStart : null;

  // Overshoot: max deviation past target
  const maxActual =
    finalTarget > initialActual ? Math.max(...actuals) : Math.min(...actuals);
  const overshoot = Math.abs(maxActual - finalTarget);
  const overshootPct = stepSize > 0 ? (overshoot / stepSize) * 100 : null;

  // Settling time: last time actual leaves ±5% band around target
  const band = stepSize * 0.05;
  let settlingTimeMs: number | null = null;
  for (let i = actuals.length - 1; i >= 0; i--) {
    if (Math.abs(actuals[i] - finalTarget) > band) {
      settlingTimeMs = times[Math.min(i + 1, actuals.length - 1)] - times[0];
      break;
    }
  }

  // Steady-state error: average of last 10 samples vs target
  const tail = actuals.slice(-10);
  const avgTail = tail.reduce((a, b) => a + b, 0) / tail.length;
  const ssError = Math.abs(avgTail - finalTarget);

  return { riseTimeMs, overshootPct, settlingTimeMs, ssError };
}

// ─── Metric Box ─────────────────────────────────────────────────────────────

function MetricBox({
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



