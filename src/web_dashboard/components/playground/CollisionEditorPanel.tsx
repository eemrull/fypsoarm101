"use client";

import React, { useState, useEffect } from "react";
import { Rnd } from "react-rnd";
import {
  useRobotProfileStore,
  type RobotProfileState,
} from "@/store/useRobotProfileStore";
import {
  panelStyle,
  panelHeaderClass,
  panelCloseButtonClass,
  panelButtonClass,
  panelInputClass,
  panelDangerButtonClass,
} from "@/components/playground/panelStyle";
import { GripDots } from "@/components/playground/GripDots";
import { computeAutoBoxes } from "@/lib/autoGenerateBoxes";
import { robotAllLinksRef } from "@/components/playground/RobotScene";
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
  const safeValue = value ?? defaultVal;
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
          onClick={() => onChange(Number((safeValue - step * 10).toFixed(3)))}
        >
          -
        </button>
        <div className="relative flex-1 h-2.5 bg-zinc-800 rounded-full flex items-center group">
          <input
            type="range"
            min={min}
            max={max}
            step={step}
            value={safeValue}
            onChange={(e) => onChange(parseFloat(e.target.value))}
            className="absolute w-full h-full opacity-0 cursor-pointer z-20"
          />
          <div
            className="h-full bg-[#3b82f6] rounded-full z-10 pointer-events-none"
            style={{
              width: `${Math.max(0, Math.min(100, ((safeValue - min) / (max - min)) * 100))}%`,
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
          onClick={() => onChange(Number((safeValue + step * 10).toFixed(3)))}
        >
          +
        </button>
        <input
          type="number"
          value={isNaN(safeValue) ? "" : safeValue}
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

interface CollisionEditorPanelProps {
  show: boolean;
  onHide: () => void;
}

type LinkBoundingBox = {
  size: [number, number, number];
  offset: [number, number, number];
};

export const CollisionEditorPanel = React.memo(function CollisionEditorPanel({
  show,
  onHide,
}: CollisionEditorPanelProps) {
  const profileLinks = useRobotProfileStore(
    (state: RobotProfileState) => state.links,
  ) as string[];
  const linkBoundingBoxes = useRobotProfileStore(
    (state: RobotProfileState) => state.linkBoundingBoxes,
  );
  const addLinkBoundingBox = useRobotProfileStore(
    (state: RobotProfileState) => state.addLinkBoundingBox,
  );
  const updateLinkBoundingBox = useRobotProfileStore(
    (state: RobotProfileState) => state.updateLinkBoundingBox,
  );
  const removeLinkBoundingBox = useRobotProfileStore(
    (state: RobotProfileState) => state.removeLinkBoundingBox,
  );
  const setAllLinkBoundingBoxes = useRobotProfileStore(
    (state: RobotProfileState) => state.setAllLinkBoundingBoxes,
  );

  const [autoGenStatus, setAutoGenStatus] = useState<string>("");

  const handleAutoGenerate = () => {
    const links = robotAllLinksRef.current;
    if (!links || links.length === 0) {
      setAutoGenStatus("No URDF loaded");
      setTimeout(() => setAutoGenStatus(""), 2000);
      return;
    }
    const boxes = computeAutoBoxes(links);
    const count = Object.keys(boxes).length;
    setAllLinkBoundingBoxes(boxes);
    setAutoGenStatus(`Generated for ${count} links`);
    setTimeout(() => setAutoGenStatus(""), 3000);
  };

  const handleClearAll = () => {
    setAllLinkBoundingBoxes({});
    setAutoGenStatus("All boxes cleared");
    setTimeout(() => setAutoGenStatus(""), 2000);
  };

  const [selectedLink, setSelectedLink] = useState<string>("");
  const [position, setPosition] = useState(() => {
    const saved = getPanelPosition("collisionPanel", "global");
    if (saved) return saved;
    return { x: 400, y: 60 };
  });

  const [isMounted, setIsMounted] = useState(false);
  useEffect(() => setIsMounted(true), []);
  useCloseOnEscape(show && isMounted, onHide);

  useEffect(() => {
    const handleResize = () => {
      const clampedPos = getPanelPosition("collisionPanel", "global");
      if (clampedPos) {
        setPosition(clampedPos);
      }
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    if (profileLinks.length > 0 && !selectedLink) {
      setSelectedLink(profileLinks[0]);
    }
  }, [profileLinks, selectedLink]);

  if (!show || !isMounted) return null;

  let boxesRaw: LinkBoundingBox[] | LinkBoundingBox | undefined =
    linkBoundingBoxes[selectedLink];
  if (!boxesRaw) boxesRaw = [];
  else if (!Array.isArray(boxesRaw)) boxesRaw = [boxesRaw];
  const currentBoxes = boxesRaw;

  const updateSize = (boxIdx: number, coordIdx: number, val: number) => {
    const box = currentBoxes[boxIdx];
    const newSize = [...box.size] as [number, number, number];
    newSize[coordIdx] = val;
    updateLinkBoundingBox(selectedLink, boxIdx, newSize, box.offset);
  };

  const updateOffset = (boxIdx: number, coordIdx: number, val: number) => {
    const box = currentBoxes[boxIdx];
    const newOffset = [...box.offset] as [number, number, number];
    newOffset[coordIdx] = val;
    updateLinkBoundingBox(selectedLink, boxIdx, box.size, newOffset);
  };

  return (
    <Rnd
      default={{
        ...getDefaultPanelPosition("collisionPanel"),
        width:
          getPanelSize("collisionPanel", "global")?.width ??
          DEFAULT_PANEL_SIZES.collisionPanel.width,
        height:
          getPanelSize("collisionPanel", "global")?.height ??
          DEFAULT_PANEL_SIZES.collisionPanel.height,
      }}
      position={position}
      minWidth={240}
      minHeight={220}
      bounds="window"
      enableResizing={true}
      onResizeStop={(_e, _dir, ref) => {
        setPanelSize(
          "collisionPanel",
          { width: ref.offsetWidth, height: ref.offsetHeight },
          "global",
        );
        const clampedPos = getPanelPosition("collisionPanel", "global");
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
          "collisionPanel",
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
            <GripDots />⬜ Collision Editor
          </h2>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onHide}
              className={panelCloseButtonClass}
              aria-label="Close collision editor panel"
            >
              x
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto pr-1 flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <div className="flex justify-between items-center mb-2">
              <button
                type="button"
                onClick={handleAutoGenerate}
                className="flex items-center gap-1 px-2 py-1 text-[11px] font-bold rounded bg-amber-600/80 hover:bg-amber-500 text-white transition-colors"
                title="Auto-generate bounding boxes for all links from mesh geometry"
              >
                Auto-Generate All
              </button>
              <button
                type="button"
                onClick={handleClearAll}
                className="flex items-center gap-1 px-2 py-1 text-[11px] font-bold rounded bg-red-600/80 hover:bg-red-500 text-white transition-colors"
                title="Remove all bounding boxes from all links"
              >
                Clear All
              </button>
              {autoGenStatus && (
                <span className="text-[10px] text-emerald-400 font-mono">
                  {autoGenStatus}
                </span>
              )}
            </div>
            <div className="flex justify-between items-center">
              <label className="text-xs text-slate-300 font-bold">
                Select Link
              </label>
              {selectedLink && (
                <button
                  type="button"
                  onClick={() => addLinkBoundingBox(selectedLink)}
                  className={panelButtonClass}
                >
                  + Add Box
                </button>
              )}
            </div>
            <select
              value={selectedLink}
              onChange={(e) => setSelectedLink(e.target.value)}
              className={`w-full ${panelInputClass}`}
            >
              {profileLinks.map((link: string) => (
                <option key={link} value={link}>
                  {link}
                </option>
              ))}
            </select>
          </div>

          {currentBoxes.map((box, boxIdx) => (
            <div
              key={boxIdx}
              className="bg-slate-800/80 p-3 rounded border border-slate-700 relative"
            >
              <div className="flex justify-between items-center mb-3 border-b border-slate-700 pb-1">
                <h3 className="text-xs font-bold text-slate-200">
                  Box {boxIdx + 1}
                </h3>
                <button
                  type="button"
                  onClick={() => removeLinkBoundingBox(selectedLink, boxIdx)}
                  className={panelDangerButtonClass}
                >
                  Remove
                </button>
              </div>

              <h4 className="text-[10px] font-bold text-slate-400 mb-2">
                Size (m)
              </h4>
              <TuningSlider
                label="Width (X)"
                value={box.size[0]}
                min={0.01}
                max={1.0}
                step={0.01}
                defaultVal={0.05}
                onChange={(v: number) => updateSize(boxIdx, 0, v)}
              />
              <TuningSlider
                label="Height (Y)"
                value={box.size[1]}
                min={0.01}
                max={1.0}
                step={0.01}
                defaultVal={0.05}
                onChange={(v: number) => updateSize(boxIdx, 1, v)}
              />
              <TuningSlider
                label="Depth (Z)"
                value={box.size[2]}
                min={0.01}
                max={1.0}
                step={0.01}
                defaultVal={0.05}
                onChange={(v: number) => updateSize(boxIdx, 2, v)}
              />

              <h4 className="text-[10px] font-bold text-slate-400 mt-4 mb-2">
                Offset (m)
              </h4>
              <TuningSlider
                label="Offset X"
                value={box.offset[0]}
                min={-1.0}
                max={1.0}
                step={0.01}
                defaultVal={0}
                onChange={(v: number) => updateOffset(boxIdx, 0, v)}
              />
              <TuningSlider
                label="Offset Y"
                value={box.offset[1]}
                min={-1.0}
                max={1.0}
                step={0.01}
                defaultVal={0}
                onChange={(v: number) => updateOffset(boxIdx, 1, v)}
              />
              <TuningSlider
                label="Offset Z"
                value={box.offset[2]}
                min={-1.0}
                max={1.0}
                step={0.01}
                defaultVal={0}
                onChange={(v: number) => updateOffset(boxIdx, 2, v)}
              />
            </div>
          ))}

          {currentBoxes.length === 0 && (
            <div className="text-xs text-slate-400 text-center py-4 italic">
              No bounding boxes attached to this link.
            </div>
          )}
        </div>
      </div>
    </Rnd>
  );
});
