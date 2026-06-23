"use client";

import React, { useState, useCallback, useRef, useEffect } from "react";
import { Rnd } from "react-rnd";
import {
  panelStyle,
  panelHeaderClass,
  panelCloseButtonClass,
  panelPrimaryButtonClass,
  panelButtonClass,
  panelDangerButtonClass,
  panelInputClass,
} from "@/components/playground/panelStyle";
import { GripDots } from "@/components/playground/GripDots";
import { useCloseOnEscape } from "@/components/playground/usePanelA11y";
import {
  getPanelPosition,
  setPanelPosition,
  getPanelSize,
  setPanelSize,
  getDefaultPanelPosition,
} from "@/lib/panelSettings";
import { useRobotStateStore, type Keyframe } from "@/store/useRobotStateStore";
import { useShallow } from "zustand/react/shallow";

const PANEL_ID = "waypointPanel";

// ─── Import / Export ────────────────────────────────────────

interface WaypointExportFormat {
  version: 1;
  name: string;
  waypoints: { angles: number[]; durationMs: number; label?: string }[];
}

function exportWaypoints(keyframes: Keyframe[], name: string) {
  const payload: WaypointExportFormat = {
    version: 1,
    name,
    waypoints: keyframes.map((kf, i) => ({
      angles: kf.angles,
      durationMs: kf.durationMs,
      label: kf.label || `Waypoint ${i + 1}`,
    })),
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${name.replace(/\s+/g, "_").toLowerCase()}_waypoints.json`;
  a.click();
  URL.revokeObjectURL(url);
}

function parseImportedWaypoints(
  text: string,
): { keyframes: Keyframe[]; name: string } | null {
  try {
    const data = JSON.parse(text);
    if (data.version !== 1 || !Array.isArray(data.waypoints)) return null;
    const keyframes: Keyframe[] = data.waypoints
      .filter(
        (wp: Record<string, unknown>) =>
          Array.isArray(wp.angles) && typeof wp.durationMs === "number",
      )
      .map((wp: { angles: number[]; durationMs: number; label?: string }) => ({
        angles: wp.angles.map(Number),
        durationMs: wp.durationMs,
        label: wp.label,
      }));
    return { keyframes, name: data.name || "Imported" };
  } catch {
    return null;
  }
}

// ─── Interactive button styles ──────────────────────────────

const actionBtnBase = "rounded-md px-1.5 py-0.5 transition-all duration-150 cursor-pointer select-none";
const playBtnClass = `${actionBtnBase} text-[10px] text-emerald-400 hover:text-emerald-200 hover:bg-emerald-500/20 hover:shadow-[0_0_6px_rgba(16,185,129,0.3)] active:scale-90 active:bg-emerald-500/30`;
const previewBtnClass = `${actionBtnBase} text-[10px] text-indigo-400 hover:text-indigo-200 hover:bg-indigo-500/20 hover:shadow-[0_0_6px_rgba(99,102,241,0.3)] active:scale-90 active:bg-indigo-500/30`;
const removeBtnClass = `${actionBtnBase} text-[11px] text-red-400/70 hover:text-red-200 hover:bg-red-500/20 hover:shadow-[0_0_6px_rgba(239,68,68,0.3)] active:scale-90 active:bg-red-500/30 ml-0.5`;

// ─── Sub-components ─────────────────────────────────────────

const WaypointRow = React.memo(function WaypointRow({
  kf,
  index,
  isExpanded,
  isPlayingThis,
  isDragOver,
  jointNames,
  onToggle,
  onRemove,
  onUpdate,
  onPreview,
  onPlayPose,
  onDragStart,
  onDragOver,
  onDragEnd,
  onDrop,
}: {
  kf: Keyframe;
  index: number;
  isExpanded: boolean;
  isPlayingThis: boolean;
  isDragOver: boolean;
  jointNames: string[];
  onToggle: (index: number) => void;
  onRemove: (index: number) => void;
  onUpdate: (index: number, updated: Keyframe) => void;
  onPreview: (index: number) => void;
  onPlayPose: (index: number) => void;
  onDragStart: (index: number) => void;
  onDragOver: (e: React.DragEvent, index: number) => void;
  onDragEnd: () => void;
  onDrop: (e: React.DragEvent, index: number) => void;
}) {
  const editableJointNames =
    jointNames.length > 0
      ? kf.angles.map((_, jointIndex) => jointNames[jointIndex] ?? `Joint_${jointIndex + 1}`)
      : kf.angles.map((_, jointIndex) => `Joint_${jointIndex + 1}`);

  return (
    <div
      draggable
      onDragStart={() => onDragStart(index)}
      onDragOver={(e) => onDragOver(e, index)}
      onDragEnd={onDragEnd}
      onDrop={(e) => onDrop(e, index)}
      className={`rounded-lg border overflow-hidden transition-all ${
        isDragOver
          ? 'border-indigo-400/60 bg-indigo-500/15 shadow-[0_0_12px_rgba(99,102,241,0.25)]'
          : isPlayingThis
          ? 'border-amber-400/50 bg-amber-500/20 shadow-[0_0_15px_rgba(251,191,36,0.15)]'
          : 'border-white/10 bg-black/20 hover:border-white/20'
      }`}
    >
      {/* Compact row */}
      <div
        className="flex items-center justify-between px-2.5 py-2 cursor-pointer hover:bg-white/[0.04] transition-colors"
        onClick={() => onToggle(index)}
      >
        <div className="flex items-center gap-2 min-w-0">
          <span
            className="text-zinc-500 cursor-grab active:cursor-grabbing text-[11px] shrink-0 hover:text-zinc-300 transition-colors"
            title="Drag to reorder"
          >
            ⠿
          </span>
          <span className={`${isPlayingThis ? 'text-amber-300' : 'text-blue-400'} font-bold text-[11px] shrink-0`}>
            #{index + 1}
          </span>
          <input
            type="text"
            value={kf.label || ""}
            placeholder={`Waypoint ${index + 1}`}
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => onUpdate(index, { ...kf, label: e.target.value })}
            className={`bg-transparent border-none outline-none text-[11px] w-20 truncate placeholder:text-zinc-600 ${isPlayingThis ? 'text-amber-100' : 'text-zinc-300'}`}
          />
          <span className="text-[10px] text-zinc-500 tabular-nums shrink-0">
            {kf.durationMs}ms
          </span>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={(e) => { e.stopPropagation(); onPlayPose(index); }}
            className={playBtnClass}
            title="Play pose"
          >
            ▶
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onPreview(index); }}
            className={previewBtnClass}
            title="Preview pose"
          >
            👁
          </button>
          <span className="text-zinc-600 text-[10px]">
            {isExpanded ? "▲" : "▼"}
          </span>
          <button
            onClick={(e) => { e.stopPropagation(); onRemove(index); }}
            className={removeBtnClass}
            title="Remove"
          >
            ✕
          </button>
        </div>
      </div>

      {/* Expanded joint editor */}
      {isExpanded && (
        <div className="border-t border-white/5 px-2.5 py-2 bg-black/30 space-y-1.5">
          {/* Duration editor */}
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-zinc-500 font-medium">
              Duration
            </span>
            <div className="flex items-center gap-1">
              <input
                type="number"
                value={kf.durationMs}
                min={100}
                step={100}
                onChange={(e) =>
                  onUpdate(index, {
                    ...kf,
                    durationMs: Math.max(100, Number(e.target.value) || 100),
                  })
                }
                className={`${panelInputClass} !w-20 !py-0.5 text-center text-[11px] tabular-nums`}
              />
              <span className="text-[10px] text-zinc-600">ms</span>
            </div>
          </div>

          {/* Joint angle editors */}
          {editableJointNames.map((name, ji) => (
            <div key={name} className="flex items-center justify-between">
              <span className="text-[10px] text-zinc-400 font-mono truncate max-w-[90px]">
                {name.replace(/_/g, " ")}
              </span>
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  step="1"
                  value={
                    kf.angles[ji] !== undefined
                      ? Math.round(kf.angles[ji] * 10) / 10
                      : 0
                  }
                  onChange={(e) => {
                    const newAngles = [...kf.angles];
                    newAngles[ji] = Number(e.target.value) || 0;
                    onUpdate(index, { ...kf, angles: newAngles });
                  }}
                  className={`${panelInputClass} !w-20 !py-0.5 text-center text-[11px] tabular-nums`}
                />
                <span className="text-[10px] text-zinc-600">°</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
});

// ─── Main Panel ─────────────────────────────────────────────

interface WaypointPanelProps {
  show: boolean;
  onHide: () => void;
  robotName: string;
  moveJointsSmoothly: (
    updates: { servoId: number; value: number }[],
    durationMs?: number,
    startFromFeedback?: boolean,
  ) => Promise<void>;
}

export const WaypointPanel = React.memo(function WaypointPanel({
  show,
  onHide,
  robotName,
  moveJointsSmoothly,
}: WaypointPanelProps) {
  useCloseOnEscape(show, onHide);

  const {
    keyframes,
    setKeyframes,
    addKeyframe,
    removeKeyframe,
    clearKeyframes,
  } = useRobotStateStore(
    useShallow((state) => ({
      keyframes: state.keyframes,
      setKeyframes: state.setKeyframes,
      addKeyframe: state.addKeyframe,
      removeKeyframe: state.removeKeyframe,
      clearKeyframes: state.clearKeyframes,
      })),
  );

  const setPreviewAngles = useRobotStateStore(
    (state) => state.setPreviewAngles,
  );
  const jointNames = useRobotStateStore(
    useShallow((state) =>
      state.jointStates
        .filter((joint) => joint.jointType === "revolute")
        .map((joint) => joint.name),
    ),
  );

  const [durationMs, setDurationMs] = useState(1000);
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);
  const [isLooping, setIsLooping] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Drag-and-drop state
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [exportName, setExportName] = useState(robotName);

  // Playback state
  const [isPlaying, setIsPlaying] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [playingIndex, setPlayingIndex] = useState<number | null>(null);
  const playbackRef = useRef({ playing: false, paused: false, cancel: false });

  useEffect(() => {
    setExportName(robotName);
  }, [robotName]);

  // Panel position & size
  const [position, setPosition] = useState<
    { x: number; y: number } | undefined
  >();
  const [size, setSize] = useState<
    { width: number | string; height: number | string } | undefined
  >();

  useEffect(() => {
    if (show) {
      const p =
        getPanelPosition(PANEL_ID, robotName) ??
        getDefaultPanelPosition(PANEL_ID);
      const s = getPanelSize(PANEL_ID, robotName);
      setPosition(p);
      setSize(s);
    }
  }, [show, robotName]);

  const handleStop = useCallback(() => {
    setIsPlaying(false);
    setIsPaused(false);
    setPlayingIndex(null);
    playbackRef.current.cancel = true;
  }, []);

  // Clear preview when panel closes
  useEffect(() => {
    if (!show) {
      setPreviewAngles(null);
      handleStop();
    }
  }, [show, setPreviewAngles, handleStop]);

  const handleCapturePose = useCallback(() => {
    const jointStates = useRobotStateStore.getState().jointStates;
    const revoluteJoints = jointStates.filter(
      (j) => j.jointType === "revolute",
    );
    const currentDegrees = revoluteJoints.map((j) =>
      typeof j.degrees === "number" ? Math.round(j.degrees * 10) / 10 : 0,
    );
    addKeyframe({
      angles: currentDegrees,
      durationMs,
      label: `Pose ${keyframes.length + 1}`,
    });
  }, [addKeyframe, durationMs, keyframes.length]);

  const handlePlaySequence = useCallback(async () => {
    if (keyframes.length === 0) return;
    setPreviewAngles(null);
    
    setIsPlaying(true);
    setIsPaused(false);
    playbackRef.current = { playing: true, paused: false, cancel: false };

    do {
      for (let i = 0; i < keyframes.length; i++) {
        if (playbackRef.current.cancel) break;

        // Handle pause
        while (playbackRef.current.paused && !playbackRef.current.cancel) {
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
        if (playbackRef.current.cancel) break;

        setPlayingIndex(i);
        const kf = keyframes[i];

        const states = useRobotStateStore.getState().jointStates;
        const revoluteJoints = states.filter((j) => j.jointType === "revolute");
        const updates = revoluteJoints
          .map((joint, idx) => ({
            servoId: joint.servoId as number,
            value: kf.angles[idx],
          }))
          .filter((u) => u.servoId !== undefined);

        await moveJointsSmoothly(updates, kf.durationMs);
      }
    } while (isLooping && !playbackRef.current.cancel);

    setIsPlaying(false);
    setIsPaused(false);
    setPlayingIndex(null);
    playbackRef.current = { playing: false, paused: false, cancel: false };
  }, [keyframes, isLooping, moveJointsSmoothly, setPreviewAngles]);

  const handlePause = useCallback(() => {
    setIsPaused(true);
    playbackRef.current.paused = true;
  }, []);

  const handleResume = useCallback(() => {
    setIsPaused(false);
    playbackRef.current.paused = false;
  }, []);


  const handlePlayPose = useCallback((index: number) => {
    const kf = keyframes[index];
    if (!kf) return;
    const states = useRobotStateStore.getState().jointStates;
    const revoluteJoints = states.filter((j) => j.jointType === "revolute");
    const updates = revoluteJoints
      .map((joint, idx) => ({
        servoId: joint.servoId as number,
        value: kf.angles[idx],
      }))
      .filter((u) => u.servoId !== undefined);

    moveJointsSmoothly(updates, kf.durationMs);
  }, [keyframes, moveJointsSmoothly]);

  const handleToggleWaypoint = useCallback((index: number) => {
    setExpandedIndex((prev) => (prev === index ? null : index));
  }, []);

  // ─── Drag-and-drop handlers ────────────────────────────────
  const handleDragStart = useCallback((index: number) => {
    setDragIndex(index);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, index: number) => {
    e.preventDefault();
    setDragOverIndex(index);
  }, []);

  const handleDragEnd = useCallback(() => {
    setDragIndex(null);
    setDragOverIndex(null);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent, dropIndex: number) => {
    e.preventDefault();
    if (dragIndex === null || dragIndex === dropIndex) {
      setDragIndex(null);
      setDragOverIndex(null);
      return;
    }
    const current = useRobotStateStore.getState().keyframes;
    const next = [...current];
    const [moved] = next.splice(dragIndex, 1);
    next.splice(dropIndex, 0, moved);
    setKeyframes(next);
    setExpandedIndex(null);
    setDragIndex(null);
    setDragOverIndex(null);
  }, [dragIndex, setKeyframes]);

  const handleRemoveWaypoint = useCallback(
    (index: number) => {
      removeKeyframe(index);
      setExpandedIndex((prev) => {
        if (prev === null) return prev;
        if (prev === index) return null;
        if (prev > index) return prev - 1;
        return prev;
      });
    },
    [removeKeyframe],
  );

  const handleUpdateWaypoint = useCallback(
    (index: number, updated: Keyframe) => {
      const current = useRobotStateStore.getState().keyframes;
      if (!current[index]) return;
      if (current[index] === updated) return;
      const next = [...current];
      next[index] = updated;
      setKeyframes(next);
    },
    [setKeyframes],
  );

  const handlePreview = useCallback(
    (index: number) => {
      const kf = useRobotStateStore.getState().keyframes[index];
      if (!kf) return;
      setPreviewAngles(kf.angles);
    },
    [setPreviewAngles],
  );

  const handleImport = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileSelected = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        const result = parseImportedWaypoints(reader.result as string);
        if (result) {
          setKeyframes(result.keyframes);
          if (result.name) setExportName(result.name);
        } else {
          console.warn("[WaypointPanel] Invalid waypoint file format");
        }
      };
      reader.readAsText(file);
      e.target.value = "";
    },
    [setKeyframes],
  );

  const handleExport = useCallback(() => {
    if (keyframes.length === 0) return;
    exportWaypoints(keyframes, exportName || robotName);
  }, [keyframes, exportName, robotName]);

  const handleClear = useCallback(() => {
    clearKeyframes();
    setPreviewAngles(null);
    setExpandedIndex(null);
  }, [clearKeyframes, setPreviewAngles]);

  if (!show || !position || !size) return null;

  return (
    <Rnd
      default={{
        x: position.x,
        y: position.y,
        width: size.width,
        height: size.height,
      }}
      position={position}
      size={size}
      minWidth={340}
      minHeight={200}
      bounds="window"
      enableResizing={true}
      dragHandleClassName="panel-drag-handle"
      onDragStop={(_e, d) => {
        const nextPos = setPanelPosition(
          PANEL_ID,
          { x: d.x, y: d.y },
          robotName,
        );
        setPosition(nextPos);
      }}
      onResizeStop={(_e, _dir, ref, _delta, pos) => {
        const nextSize = {
          width: ref.offsetWidth,
          height: ref.offsetHeight,
        };
        setPanelSize(
          PANEL_ID,
          nextSize,
          robotName,
        );
        setSize(nextSize);
        const clampedPos = setPanelPosition(
          PANEL_ID,
          { x: pos.x, y: pos.y },
          robotName,
        );
        setPosition(clampedPos);
      }}
      className={`${panelStyle} rnd-viewport-clamp !z-[9999]`}
      style={{ position: "absolute" }}
    >
      <div className="flex flex-col h-full relative z-10 p-4">
        {/* Header */}
        <div className={panelHeaderClass}>
          <span className="flex items-center gap-2">
            <GripDots />
            <span>📋 Waypoints</span>
          </span>
          <div className="flex flex-1 items-center justify-end gap-3 mr-3">
            <span
              className={`rounded border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider transition-colors ${
                isPlaying && !isPaused
                  ? "border-amber-400/50 bg-amber-500/20 text-amber-300 animate-pulse"
                  : isPlaying && isPaused
                  ? "border-amber-400/30 bg-amber-500/10 text-amber-300/70"
                  : "border-zinc-700/50 bg-zinc-800/30 text-zinc-500"
              }`}
            >
              {isPlaying ? (isPaused ? "Paused" : "Playing") : "Idle"}
            </span>
          </div>
          <button
            type="button"
            onClick={onHide}
            className={panelCloseButtonClass}
            aria-label="Close panel"
          >
            ×
          </button>
        </div>

        {/* Toolbar */}
        <div className="flex items-center gap-2 mb-3 flex-wrap">
          <button
            type="button"
            onClick={handleCapturePose}
            className={`${panelPrimaryButtonClass} !py-1.5 !text-[11px]`}
          >
            ＋ Capture Pose
          </button>
          <div className="flex items-center gap-1">
            <input
              type="number"
              value={durationMs}
              onChange={(e) => setDurationMs(Number(e.target.value))}
              min={100}
              step={100}
              className={`${panelInputClass} !w-16 !py-1 text-center text-[11px]`}
            />
            <span className="text-[10px] text-zinc-500">ms</span>
          </div>

          <div className="flex-1" />

          <button
            type="button"
            onClick={handleImport}
            className={`${panelButtonClass} !py-1 !px-2 !text-[10px]`}
            title="Import waypoints from JSON"
          >
            📥 Import
          </button>
          <div className="flex items-center gap-1">
            <input
              type="text"
              value={exportName}
              onChange={(e) => setExportName(e.target.value)}
              className={`${panelInputClass} !w-24 !py-1 text-[10px]`}
              placeholder="File name"
            />
            <button
              type="button"
              onClick={handleExport}
              disabled={keyframes.length === 0}
              className={`${panelButtonClass} !py-1 !px-2 !text-[10px]`}
              title="Export waypoints as JSON"
            >
              📤 Export
            </button>
          </div>

          {/* Hidden file input for import */}
          <input
            ref={fileInputRef}
            type="file"
            accept=".json"
            className="hidden"
            onChange={handleFileSelected}
          />
        </div>

        {/* Waypoint List */}
        <div className="flex-1 min-h-0 overflow-y-auto space-y-1.5 pr-0.5">
          {keyframes.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-zinc-600 text-xs gap-2 py-8">
              <span className="text-2xl opacity-40">⊙</span>
              <span>No waypoints yet</span>
              <span className="text-[10px] text-zinc-700">
                Capture poses or import a sequence
              </span>
            </div>
          ) : (
            keyframes.map((kf, i) => (
              <WaypointRow
                key={i}
                kf={kf}
                index={i}
                isExpanded={expandedIndex === i}
                isPlayingThis={playingIndex === i}
                isDragOver={dragOverIndex === i}
                jointNames={jointNames}
                onToggle={handleToggleWaypoint}
                onRemove={handleRemoveWaypoint}
                onUpdate={handleUpdateWaypoint}
                onPreview={handlePreview}
                onPlayPose={handlePlayPose}
                onDragStart={handleDragStart}
                onDragOver={handleDragOver}
                onDragEnd={handleDragEnd}
                onDrop={handleDrop}
              />
            ))
          )}
        </div>

        {/* Footer */}
        {keyframes.length > 0 && (
          <div className="flex items-center justify-between mt-3 pt-3 border-t border-white/10">
            <button
              type="button"
              onClick={handleClear}
              className={`${panelDangerButtonClass} !py-1.5 !text-[10px]`}
            >
              Clear All
            </button>
            <div className="flex items-center gap-2">
              <label className="flex items-center gap-1.5 text-xs text-zinc-400 cursor-pointer hover:text-zinc-200 transition-colors mr-2">
                <input
                  type="checkbox"
                  checked={isLooping}
                  onChange={(e) => setIsLooping(e.target.checked)}
                  className="w-3.5 h-3.5 rounded border-zinc-700 bg-black/50 text-indigo-500 focus:ring-indigo-500/30 focus:ring-offset-0"
                />
                Loop
              </label>
              
              {isPlaying ? (
                <>
                  {isPaused ? (
                    <button
                      type="button"
                      onClick={handleResume}
                      className="rounded-md border border-amber-400/40 bg-amber-500/30 px-4 py-1.5 text-xs font-semibold text-amber-200 hover:bg-amber-500/40 transition-colors"
                    >
                      ▶ Resume
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={handlePause}
                      className="rounded-md border border-amber-400/40 bg-amber-500/30 px-4 py-1.5 text-xs font-semibold text-amber-200 hover:bg-amber-500/40 transition-colors"
                    >
                      ⏸ Pause
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={handleStop}
                    className="rounded-md border border-red-400/40 bg-red-500/70 px-4 py-1.5 text-xs font-semibold text-white hover:bg-red-500/85 transition-colors"
                  >
                    ■ Stop
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={handlePlaySequence}
                  className={`${panelPrimaryButtonClass} !px-4 !py-1.5`}
                >
                  ▶ Play ({keyframes.length})
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </Rnd>
  );
});
