"use client";

import React, { useState, useEffect } from "react";
import { Rnd } from "react-rnd";
import {
  useGripperTuningStore,
  type GripperTuningState,
} from "@/store/useGripperTuningStore";
import {
  panelStyle,
  panelHeaderClass,
  panelCloseButtonClass,
  panelButtonClass,
  panelDangerButtonClass,
} from "@/components/playground/panelStyle";
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

function TuningSlider({
  label,
  value,
  min,
  max,
  step,
  defaultVal,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  defaultVal: number;
  onChange: (value: number) => void;
}) {
  const dotPct = ((defaultVal - min) / (max - min)) * 100;
  return (
    <div className="flex flex-col gap-1 text-xs text-white mb-3">
      <div className="flex justify-between font-mono text-[10px] text-zinc-400">
        <span>{label}</span>
        <span>Def: {defaultVal}</span>
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          className="bg-zinc-700 hover:bg-zinc-600 w-6 h-6 flex-shrink-0 rounded flex items-center justify-center font-bold text-white"
          onClick={() => onChange(Number((value - step * 10).toFixed(3)))}
        >
          -
        </button>
        <div className="relative flex-1 h-2.5 bg-zinc-800 rounded-full flex items-center group">
          <input
            type="range"
            min={min}
            max={max}
            step={step}
            value={value}
            onChange={(e) => onChange(parseFloat(e.target.value))}
            className="absolute w-full h-full opacity-0 cursor-pointer z-20"
          />
          <div
            className="h-full bg-[#FF746C] rounded-full z-10 pointer-events-none"
            style={{
              width: `${Math.max(0, Math.min(100, ((value - min) / (max - min)) * 100))}%`,
            }}
          />
          <div
            className="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-slate-200 border-[3px] border-[#1e293b] pointer-events-none z-30"
            style={{ left: `calc(${dotPct}% - 6px)` }}
          />
        </div>
        <button
          type="button"
          className="bg-zinc-700 hover:bg-zinc-600 w-6 h-6 flex-shrink-0 rounded flex items-center justify-center font-bold text-white"
          onClick={() => onChange(Number((value + step * 10).toFixed(3)))}
        >
          +
        </button>
        <input
          type="number"
          value={isNaN(value) ? "" : value}
          step={step}
          onChange={(e) => {
            const val = parseFloat(e.target.value);
            onChange(isNaN(val) ? 0 : val);
          }}
          className="w-20 min-w-[5rem] bg-zinc-900 border border-zinc-700 outline-none focus:border-zinc-500 text-center rounded px-1 h-6 text-[12px] tabular-nums"
        />
      </div>
    </div>
  );
}

function CollapsibleFolder({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mb-2 bg-slate-800/80 rounded overflow-hidden border border-slate-700">
      <div className="flex items-center justify-between px-2 py-2 hover:bg-slate-700/50 transition-colors">
        <button
          type="button"
          className="flex-1 flex justify-between items-center text-xs font-bold text-slate-200"
          onClick={() => setOpen(!open)}
        >
          <span>{title}</span>
          <span className="text-[10px]">{open ? "▼" : "▶"}</span>
        </button>
      </div>
      {open && (
        <div className="p-3 border-t border-slate-700 bg-slate-900/50">
          {children}
        </div>
      )}
    </div>
  );
}

interface GripperTuningPanelProps {
  show: boolean;
  onHide: () => void;
}

export const GripperTuningPanel = React.memo(function GripperTuningPanel({
  show,
  onHide,
}: GripperTuningPanelProps) {
  const f1 = useGripperTuningStore((state: GripperTuningState) => state.f1);
  const m1 = useGripperTuningStore((state: GripperTuningState) => state.m1);
  const setF1 = useGripperTuningStore(
    (state: GripperTuningState) => state.setF1,
  );
  const setM1 = useGripperTuningStore(
    (state: GripperTuningState) => state.setM1,
  );
  const resetAll = useGripperTuningStore(
    (state: GripperTuningState) => state.resetAll,
  );
  const [position, setPosition] = useState(() => {
    const saved = getPanelPosition("tuningPanel", "global");
    if (saved) return saved;
    return { x: 20, y: 60 };
  });

  const [isMounted, setIsMounted] = useState(false);
  useEffect(() => setIsMounted(true), []);
  useCloseOnEscape(show && isMounted, onHide);

  useEffect(() => {
    const handleResize = () => {
      const clampedPos = getPanelPosition("tuningPanel", "global");
      if (clampedPos) {
        setPosition(clampedPos);
      }
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const handleExport = () => {
    const data = { f1, m1 };
    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "gripper_tuning.json";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  if (!show || !isMounted) return null;

  return (
    <Rnd
      default={{
        ...getDefaultPanelPosition("tuningPanel"),
        width:
          getPanelSize("tuningPanel", "global")?.width ??
          DEFAULT_PANEL_SIZES.tuningPanel.width,
        height:
          getPanelSize("tuningPanel", "global")?.height ??
          DEFAULT_PANEL_SIZES.tuningPanel.height,
      }}
      position={position}
      minWidth={280}
      minHeight={220}
      bounds="window"
      enableResizing={true}
      onResizeStop={(_e, _dir, ref) => {
        setPanelSize(
          "tuningPanel",
          { width: ref.offsetWidth, height: ref.offsetHeight },
          "global",
        );
        const clampedPos = getPanelPosition("tuningPanel", "global");
        if (clampedPos) {
          setPosition(clampedPos);
        }
      }}
      className="rnd-viewport-clamp z-[9999] pointer-events-auto"
      dragHandleClassName="panel-drag-handle"
      style={{
        ["--panel-x" as string]: `${position.x}px`,
        ["--panel-y" as string]: `${position.y}px`,
      }}
      onDragStop={(_e, d) => {
        const nextPos = setPanelPosition(
          "tuningPanel",
          { x: d.x, y: d.y },
          "global",
        );
        setPosition(nextPos);
      }}
    >
      <div
        className={`w-full h-full overflow-y-auto custom-scrollbar flex flex-col ${panelStyle}`}
      >
        <div className={panelHeaderClass}>
          <h2 className="font-bold text-sm text-white flex items-center gap-2">
            <GripDots />⚙ Gripper Tuning
          </h2>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleExport}
              className={`${panelButtonClass} flex items-center gap-1`}
              title="Export configuration as JSON"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="10"
                height="10"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                <polyline points="7 10 12 15 17 10"></polyline>
                <line x1="12" y1="15" x2="12" y2="3"></line>
              </svg>
              Export
            </button>
            <button
              type="button"
              onClick={resetAll}
              className={panelDangerButtonClass}
              title="Reset exactly to default URDF config"
            >
              Reset All
            </button>
            <button
              type="button"
              onClick={onHide}
              className={panelCloseButtonClass}
              aria-label="Close gripper tuning panel"
            >
              x
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto pr-1">
          <div className="flex justify-between items-center mb-1 px-1">
            <h3 className="font-bold text-xs text-slate-300">
              1. Fixed Jaw (Bottom)
            </h3>
          </div>
          <CollapsibleFolder title="Step 1">
            <TuningSlider
              label="Width (X)"
              value={f1.fw1}
              min={0.01}
              max={0.5}
              step={0.01}
              defaultVal={0.08}
              onChange={(v: number) => setF1({ fw1: v })}
            />
            <TuningSlider
              label="Height (Y)"
              value={f1.fh1}
              min={0.01}
              max={0.5}
              step={0.01}
              defaultVal={0.15}
              onChange={(v: number) => setF1({ fh1: v })}
            />
            <TuningSlider
              label="Depth (Z)"
              value={f1.fd1}
              min={0.01}
              max={2.0}
              step={0.01}
              defaultVal={0.65}
              onChange={(v: number) => setF1({ fd1: v })}
            />
            <TuningSlider
              label="Offset X"
              value={f1.fx1}
              min={-1}
              max={1}
              step={0.01}
              defaultVal={-0.2}
              onChange={(v: number) => setF1({ fx1: v })}
            />
            <TuningSlider
              label="Offset Y"
              value={f1.fy1}
              min={-1}
              max={1}
              step={0.01}
              defaultVal={0}
              onChange={(v: number) => setF1({ fy1: v })}
            />
            <TuningSlider
              label="Offset Z"
              value={f1.fz1}
              min={-3}
              max={1}
              step={0.01}
              defaultVal={-0.915}
              onChange={(v: number) => setF1({ fz1: v })}
            />
          </CollapsibleFolder>
          <CollapsibleFolder title="Step 2">
            <TuningSlider
              label="Width (X)"
              value={f1.fw2}
              min={0.01}
              max={0.5}
              step={0.01}
              defaultVal={0.08}
              onChange={(v: number) => setF1({ fw2: v })}
            />
            <TuningSlider
              label="Height (Y)"
              value={f1.fh2}
              min={0.01}
              max={0.5}
              step={0.01}
              defaultVal={0.05}
              onChange={(v: number) => setF1({ fh2: v })}
            />
            <TuningSlider
              label="Depth (Z)"
              value={f1.fd2}
              min={0.01}
              max={2.0}
              step={0.01}
              defaultVal={0.1}
              onChange={(v: number) => setF1({ fd2: v })}
            />
            <TuningSlider
              label="Offset X"
              value={f1.fx2}
              min={-1}
              max={1}
              step={0.01}
              defaultVal={-0.2}
              onChange={(v: number) => setF1({ fx2: v })}
            />
            <TuningSlider
              label="Offset Y"
              value={f1.fy2}
              min={-1}
              max={1}
              step={0.01}
              defaultVal={0.2}
              onChange={(v: number) => setF1({ fy2: v })}
            />
            <TuningSlider
              label="Offset Z"
              value={f1.fz2}
              min={-3}
              max={1}
              step={0.01}
              defaultVal={-1.46}
              onChange={(v: number) => setF1({ fz2: v })}
            />
          </CollapsibleFolder>
          <CollapsibleFolder title="Step 3">
            <TuningSlider
              label="Width (X)"
              value={f1.fw3}
              min={0.01}
              max={0.5}
              step={0.01}
              defaultVal={0.08}
              onChange={(v: number) => setF1({ fw3: v })}
            />
            <TuningSlider
              label="Height (Y)"
              value={f1.fh3}
              min={0.01}
              max={0.5}
              step={0.01}
              defaultVal={0.05}
              onChange={(v: number) => setF1({ fh3: v })}
            />
            <TuningSlider
              label="Depth (Z)"
              value={f1.fd3}
              min={0.01}
              max={2.0}
              step={0.01}
              defaultVal={0.1}
              onChange={(v: number) => setF1({ fd3: v })}
            />
            <TuningSlider
              label="Offset X"
              value={f1.fx3}
              min={-1}
              max={1}
              step={0.01}
              defaultVal={-0.2}
              onChange={(v: number) => setF1({ fx3: v })}
            />
            <TuningSlider
              label="Offset Y"
              value={f1.fy3}
              min={-1}
              max={1}
              step={0.01}
              defaultVal={0.2}
              onChange={(v: number) => setF1({ fy3: v })}
            />
            <TuningSlider
              label="Offset Z"
              value={f1.fz3}
              min={-3}
              max={1}
              step={0.01}
              defaultVal={-1.2}
              onChange={(v: number) => setF1({ fz3: v })}
            />
          </CollapsibleFolder>
          <CollapsibleFolder title="Step 4">
            <TuningSlider
              label="Width (X)"
              value={f1.fw4}
              min={0.01}
              max={0.5}
              step={0.01}
              defaultVal={0.08}
              onChange={(v: number) => setF1({ fw4: v })}
            />
            <TuningSlider
              label="Height (Y)"
              value={f1.fh4}
              min={0.01}
              max={0.5}
              step={0.01}
              defaultVal={0.05}
              onChange={(v: number) => setF1({ fh4: v })}
            />
            <TuningSlider
              label="Depth (Z)"
              value={f1.fd4}
              min={0.01}
              max={2.0}
              step={0.01}
              defaultVal={0.1}
              onChange={(v: number) => setF1({ fd4: v })}
            />
            <TuningSlider
              label="Offset X"
              value={f1.fx4}
              min={-1}
              max={1}
              step={0.01}
              defaultVal={-0.2}
              onChange={(v: number) => setF1({ fx4: v })}
            />
            <TuningSlider
              label="Offset Y"
              value={f1.fy4}
              min={-1}
              max={1}
              step={0.01}
              defaultVal={0.2}
              onChange={(v: number) => setF1({ fy4: v })}
            />
            <TuningSlider
              label="Offset Z"
              value={f1.fz4}
              min={-3}
              max={1}
              step={0.01}
              defaultVal={-1.0}
              onChange={(v: number) => setF1({ fz4: v })}
            />
          </CollapsibleFolder>
          <CollapsibleFolder title="Step 5">
            <TuningSlider
              label="Width (X)"
              value={f1.fw5}
              min={0.01}
              max={0.5}
              step={0.01}
              defaultVal={0.08}
              onChange={(v: number) => setF1({ fw5: v })}
            />
            <TuningSlider
              label="Height (Y)"
              value={f1.fh5}
              min={0.01}
              max={0.5}
              step={0.01}
              defaultVal={0.05}
              onChange={(v: number) => setF1({ fh5: v })}
            />
            <TuningSlider
              label="Depth (Z)"
              value={f1.fd5}
              min={0.01}
              max={2.0}
              step={0.01}
              defaultVal={0.1}
              onChange={(v: number) => setF1({ fd5: v })}
            />
            <TuningSlider
              label="Offset X"
              value={f1.fx5}
              min={-1}
              max={1}
              step={0.01}
              defaultVal={-0.2}
              onChange={(v: number) => setF1({ fx5: v })}
            />
            <TuningSlider
              label="Offset Y"
              value={f1.fy5}
              min={-1}
              max={1}
              step={0.01}
              defaultVal={0.2}
              onChange={(v: number) => setF1({ fy5: v })}
            />
            <TuningSlider
              label="Offset Z"
              value={f1.fz5}
              min={-3}
              max={1}
              step={0.01}
              defaultVal={-0.8}
              onChange={(v: number) => setF1({ fz5: v })}
            />
          </CollapsibleFolder>
        </div>

        <div>
          <div className="flex justify-between items-center mb-1 px-1">
            <h3 className="font-bold text-xs text-slate-300">
              2. Moving Jaw (Top)
            </h3>
          </div>
          <CollapsibleFolder title="Base">
            <TuningSlider
              label="Width (X)"
              value={m1.mw1}
              min={0.01}
              max={0.5}
              step={0.01}
              defaultVal={0.08}
              onChange={(v: number) => setM1({ mw1: v })}
            />
            <TuningSlider
              label="Height (Y)"
              value={m1.mh1}
              min={0.01}
              max={0.5}
              step={0.01}
              defaultVal={0.35}
              onChange={(v: number) => setM1({ mh1: v })}
            />
            <TuningSlider
              label="Depth (Z)"
              value={m1.md1}
              min={0.01}
              max={2.0}
              step={0.01}
              defaultVal={0.1}
              onChange={(v: number) => setM1({ md1: v })}
            />
            <TuningSlider
              label="Offset X"
              value={m1.mx1}
              min={-1}
              max={1}
              step={0.01}
              defaultVal={-0.1}
              onChange={(v: number) => setM1({ mx1: v })}
            />
            <TuningSlider
              label="Offset Y"
              value={m1.my1}
              min={-1}
              max={1}
              step={0.01}
              defaultVal={-0.25}
              onChange={(v: number) => setM1({ my1: v })}
            />
            <TuningSlider
              label="Offset Z"
              value={m1.mz1}
              min={-1}
              max={2}
              step={0.01}
              defaultVal={0.35}
              onChange={(v: number) => setM1({ mz1: v })}
            />
          </CollapsibleFolder>
          <CollapsibleFolder title="Middle Step">
            <TuningSlider
              label="Width (X)"
              value={m1.mw2}
              min={0.01}
              max={0.5}
              step={0.01}
              defaultVal={0.08}
              onChange={(v: number) => setM1({ mw2: v })}
            />
            <TuningSlider
              label="Height (Y)"
              value={m1.mh2}
              min={0.01}
              max={0.5}
              step={0.01}
              defaultVal={0.15}
              onChange={(v: number) => setM1({ mh2: v })}
            />
            <TuningSlider
              label="Depth (Z)"
              value={m1.md2}
              min={0.01}
              max={2.0}
              step={0.01}
              defaultVal={0.1}
              onChange={(v: number) => setM1({ md2: v })}
            />
            <TuningSlider
              label="Offset X"
              value={m1.mx2}
              min={-1}
              max={1}
              step={0.01}
              defaultVal={-0.1}
              onChange={(v: number) => setM1({ mx2: v })}
            />
            <TuningSlider
              label="Offset Y"
              value={m1.my2}
              min={-2}
              max={1}
              step={0.01}
              defaultVal={-0.75}
              onChange={(v: number) => setM1({ my2: v })}
            />
            <TuningSlider
              label="Offset Z"
              value={m1.mz2}
              min={-1}
              max={2}
              step={0.01}
              defaultVal={0.2}
              onChange={(v: number) => setM1({ mz2: v })}
            />
          </CollapsibleFolder>
          <CollapsibleFolder title="Tip Step">
            <TuningSlider
              label="Width (X)"
              value={m1.mw3}
              min={0.01}
              max={0.5}
              step={0.01}
              defaultVal={0.08}
              onChange={(v: number) => setM1({ mw3: v })}
            />
            <TuningSlider
              label="Height (Y)"
              value={m1.mh3}
              min={0.01}
              max={0.5}
              step={0.01}
              defaultVal={0.15}
              onChange={(v: number) => setM1({ mh3: v })}
            />
            <TuningSlider
              label="Depth (Z)"
              value={m1.md3}
              min={0.01}
              max={2.0}
              step={0.01}
              defaultVal={0.1}
              onChange={(v: number) => setM1({ md3: v })}
            />
            <TuningSlider
              label="Offset X"
              value={m1.mx3}
              min={-1}
              max={1}
              step={0.01}
              defaultVal={-0.1}
              onChange={(v: number) => setM1({ mx3: v })}
            />
            <TuningSlider
              label="Offset Y"
              value={m1.my3}
              min={-2}
              max={1}
              step={0.01}
              defaultVal={-1.05}
              onChange={(v: number) => setM1({ my3: v })}
            />
            <TuningSlider
              label="Offset Z"
              value={m1.mz3}
              min={-2}
              max={1}
              step={0.01}
              defaultVal={0.05}
              onChange={(v: number) => setM1({ mz3: v })}
            />
          </CollapsibleFolder>
        </div>
      </div>
    </Rnd>
  );
});
