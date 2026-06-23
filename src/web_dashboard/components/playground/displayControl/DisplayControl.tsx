"use client";

import React, { useState, useEffect } from "react";
import { Rnd } from "react-rnd";
import useMeasure from "react-use-measure";
import { useDisplayStore, type DisplayState } from "@/store/useDisplayStore";
import { useShallow } from "zustand/react/shallow";
import { RiEyeLine } from "@remixicon/react";
import {
  panelStyle,
  panelHeaderClass,
  panelCloseButtonClass,
  panelButtonClass,
  panelSelectClass,
} from "@/components/playground/panelStyle";
import { GripDots } from "@/components/playground/GripDots";
import { useCloseOnEscape } from "@/components/playground/usePanelA11y";
import {
  getPanelPosition,
  setPanelPosition,
  getPanelSize,
  setPanelSize,
  resetPanelLayout,
  getDefaultPanelPosition,
  DEFAULT_PANEL_SIZES,
} from "@/lib/panelSettings";

const PANEL_ID = "displayControl";
const DEFAULT_POS = { x: 20, y: 20 };

interface DisplayControlProps {
  show: boolean;
  onHide: () => void;
  onResetLayout?: () => void;
}

export const DisplayControl = React.memo(function DisplayControl({
  show,
  onHide,
  onResetLayout,
}: DisplayControlProps) {
  const {
    physicsDebug,
    showGrid,
    showShadows,
    environment,
    robotOpacity,
    preferredUnit,
    renderQuality,
    setPhysicsDebug,
    setShowGrid,
    setShowShadows,
    setRenderQuality,
    setEnvironment,
    setRobotOpacity,
    setPreferredUnit,
    showPerf,
    setShowPerf,
    showIKTarget,
    setShowIKTarget,
    showLinkLabels,
    setShowLinkLabels,
    showGripperCoords,
    setShowGripperCoords,
  } = useDisplayStore(
    useShallow((state: DisplayState) => ({
      physicsDebug: state.physicsDebug,
      showGrid: state.showGrid,
      showShadows: state.showShadows,
      environment: state.environment,
      robotOpacity: state.robotOpacity,
      preferredUnit: state.preferredUnit,
      renderQuality: state.renderQuality,
      setPhysicsDebug: state.setPhysicsDebug,
      setShowGrid: state.setShowGrid,
      setShowShadows: state.setShowShadows,
      setRenderQuality: state.setRenderQuality,
      setEnvironment: state.setEnvironment,
      setRobotOpacity: state.setRobotOpacity,
      setPreferredUnit: state.setPreferredUnit,
      showPerf: state.showPerf,
      setShowPerf: state.setShowPerf,
      showIKTarget: state.showIKTarget,
      setShowIKTarget: state.setShowIKTarget,
      showLinkLabels: state.showLinkLabels,
      setShowLinkLabels: state.setShowLinkLabels,
      showGripperCoords: state.showGripperCoords,
      setShowGripperCoords: state.setShowGripperCoords,
    })),
  );

  const handleResetPanels = () => {
    if (onResetLayout) {
      onResetLayout();
      return;
    }
    resetPanelLayout("global");
    window.location.reload();
  };

  const [ref] = useMeasure();
  const [position, setPosition] = useState(
    () => getPanelPosition(PANEL_ID, "global") ?? DEFAULT_POS,
  );

  const [isMounted, setIsMounted] = useState(false);
  useEffect(() => setIsMounted(true), []);

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

  useCloseOnEscape(show && isMounted, onHide);

  if (!show || !isMounted) return null;

  return (
    <Rnd
      default={{
        ...getDefaultPanelPosition(PANEL_ID),
        width:
          getPanelSize(PANEL_ID, "global")?.width ??
          DEFAULT_PANEL_SIZES.displayControl.width,
        height:
          getPanelSize(PANEL_ID, "global")?.height ??
          DEFAULT_PANEL_SIZES.displayControl.height,
      }}
      position={position}
      minWidth={240}
      minHeight={260}
      onDragStop={(_e, d) => {
        const nextPos = setPanelPosition(
          PANEL_ID,
          { x: d.x, y: d.y },
          "global",
        );
        setPosition(nextPos);
      }}
      enableResizing={true}
      onResizeStop={(_e, _dir, ref) => {
        setPanelSize(
          PANEL_ID,
          { width: ref.offsetWidth, height: ref.offsetHeight },
          "global",
        );
        const clampedPos = getPanelPosition(PANEL_ID, "global");
        if (clampedPos) {
          setPosition(clampedPos);
        }
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
        className={
          "w-full h-full flex flex-col overflow-y-auto text-sm select-none " +
          panelStyle
        }
      >
        <div className="relative z-10">
          {/* Header - drag handle */}
          <div className={panelHeaderClass}>
            <span className="flex items-center gap-2">
              <GripDots />
              <RiEyeLine size={18} className="text-indigo-400" />
              Display Settings
            </span>
            <button
              type="button"
              aria-label="Close display panel"
              onClick={onHide}
              onTouchEnd={onHide}
              className={panelCloseButtonClass}
              title="Close"
            >
              x
            </button>
          </div>

          <div className="space-y-3">
            {/* Physics Debug */}
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-slate-300">
                Physics & Axes Debug
              </label>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  id="display-physics-debug"
                  type="checkbox"
                  className="sr-only peer"
                  checked={physicsDebug}
                  onChange={(e) => setPhysicsDebug(e.target.checked)}
                />
                <div className="w-9 h-5 bg-zinc-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-indigo-500"></div>
              </label>
            </div>

            {/* Show Target Sphere */}
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-slate-300">
                Show IK Target Sphere
              </label>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  id="display-show-ik-target"
                  type="checkbox"
                  className="sr-only peer"
                  checked={showIKTarget}
                  onChange={(e) => setShowIKTarget(e.target.checked)}
                />
                <div className="w-9 h-5 bg-zinc-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-indigo-500"></div>
              </label>
            </div>

            {/* Show Grid */}
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-slate-300">
                Show Grid
              </label>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  id="display-show-grid"
                  type="checkbox"
                  className="sr-only peer"
                  checked={showGrid}
                  onChange={(e) => setShowGrid(e.target.checked)}
                />
                <div className="w-9 h-5 bg-zinc-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-indigo-500"></div>
              </label>
            </div>

            {/* Enable Shadows */}
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-slate-300">
                Enable Shadows
              </label>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  id="display-show-shadows"
                  type="checkbox"
                  className="sr-only peer"
                  checked={showShadows}
                  onChange={(e) => setShowShadows(e.target.checked)}
                />
                <div className="w-9 h-5 bg-zinc-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-indigo-500"></div>
              </label>
            </div>

            {/* Enable Performance Monitor */}
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-slate-300">
                Show Performance Monitor
              </label>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  id="display-show-perf"
                  type="checkbox"
                  className="sr-only peer"
                  checked={showPerf}
                  onChange={(e) => setShowPerf(e.target.checked)}
                />
                <div className="w-9 h-5 bg-zinc-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-indigo-500"></div>
              </label>
            </div>

            {/* Show Link Labels */}
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-slate-300">
                Show Link Labels
              </label>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  id="display-show-link-labels"
                  type="checkbox"
                  className="sr-only peer"
                  checked={showLinkLabels}
                  onChange={(e) => setShowLinkLabels(e.target.checked)}
                />
                <div className="w-9 h-5 bg-zinc-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-indigo-500"></div>
              </label>
            </div>

            {/* Show Gripper Coordinates */}
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-slate-300">
                Show Gripper Coordinates
              </label>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  id="display-show-gripper-coords"
                  type="checkbox"
                  className="sr-only peer"
                  checked={showGripperCoords}
                  onChange={(e) => setShowGripperCoords(e.target.checked)}
                />
                <div className="w-9 h-5 bg-zinc-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-indigo-500"></div>
              </label>
            </div>

            <div className="pt-2 mt-2 border-t border-white/20">
              <label className="block text-xs font-medium text-slate-300 mb-1.5">
                Render Quality
              </label>
              <select
                value={renderQuality}
                onChange={(e) =>
                  setRenderQuality(e.target.value as "balanced" | "high")
                }
                className={panelSelectClass}
              >
                <option value="balanced">
                  Balanced (better long-session responsiveness)
                </option>
                <option value="high">High (max visual fidelity)</option>
              </select>
            </div>
            {/* Measurement Unit */}
            <div className="pt-2 mt-2 border-t border-white/20">
              <label className="block text-xs font-medium text-slate-300 mb-1.5">
                Metric Unit
              </label>
              <select
                value={preferredUnit}
                onChange={(e) =>
                  setPreferredUnit(e.target.value as "m" | "cm" | "mm")
                }
                className={panelSelectClass}
              >
                <option value="m">Meters (m)</option>
                <option value="cm">Centimeters (cm)</option>
                <option value="mm">Millimeters (mm)</option>
              </select>
            </div>

            {/* Robot Model Opacity */}
            <div className="pt-2 mt-2 border-t border-white/20">
              <div className="flex justify-between mb-1">
                <label className="block text-xs font-medium text-slate-300">
                  Robot Opacity (X-Ray Mode)
                </label>
                <span className="text-xs text-indigo-300 font-mono">
                  {Math.round(robotOpacity * 100)}%
                </span>
              </div>
              <input
                type="range"
                min="0.1"
                max="1"
                step="0.05"
                value={robotOpacity}
                onChange={(e) => setRobotOpacity(parseFloat(e.target.value))}
                className="w-full appearance-none bg-zinc-700 h-1.5 rounded-full outline-none [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:bg-indigo-400 [&::-webkit-slider-thumb]:rounded-full"
              />
            </div>

            {/* Environment */}
            <div className="pt-2 mt-2 border-t border-white/20">
              <label className="block text-xs font-medium text-slate-300 mb-1.5">
                Lighting Environment
              </label>
              <select
                value={environment}
                onChange={(e) =>
                  setEnvironment(
                    e.target.value as
                      | "city"
                      | "studio"
                      | "warehouse"
                      | "apartment",
                  )
                }
                className={panelSelectClass}
              >
                <option value="city">City (Outdoor)</option>
                <option value="studio">Studio (Clean)</option>
                <option value="warehouse">Warehouse (Industrial)</option>
                <option value="apartment">Apartment (Warm)</option>
              </select>
            </div>

            <div className="pt-2 mt-2 border-t border-white/20">
              <button
                type="button"
                onClick={handleResetPanels}
                className={`w-full ${panelButtonClass}`}
                title="Clear saved panel size and position layout"
              >
                Reset Panel Layout
              </button>
            </div>
          </div>
        </div>
      </div>
    </Rnd>
  );
});
