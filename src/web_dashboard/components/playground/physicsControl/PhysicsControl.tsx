"use client";

import React, { useState, useEffect } from "react";
import { Rnd } from "react-rnd";
import useMeasure from "react-use-measure";
import {
  panelStyle,
  panelHeaderClass,
  panelCloseButtonClass,
  panelInputClass,
  panelPrimaryButtonClass,
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
import { useDisplayStore, type DisplayState } from "@/store/useDisplayStore";
import { convertToUnit, convertToMeters } from "@/config/robotConstants";

export type BoxConfig = {
  position: [number, number, number];
  size: [number, number, number];
  color: string;
};

type PhysicsControlProps = {
  show: boolean;
  onHide: () => void;
  config: BoxConfig;
  setConfig: React.Dispatch<React.SetStateAction<BoxConfig>>;
  onRespawn: () => void;
};

const PANEL_ID = "physicsControl";
import { boxRigidBodyRef } from "../RobotScene";
import { sceneToIK } from "@/config/robotConstants";

export const PhysicsControl = React.memo(function PhysicsControl({
  show,
  onHide,
  config,
  setConfig,
  onRespawn,
}: PhysicsControlProps) {
  const [ref, bounds] = useMeasure();
  const [position, setPosition] = useState(
    () => getPanelPosition(PANEL_ID, "global") ?? { x: 0, y: 0 },
  );
  const [hasInitPos, setHasInitPos] = useState(
    () => getPanelPosition(PANEL_ID, "global") !== null,
  );
  const [isMounted, setIsMounted] = useState(false);
  
  const [livePos, setLivePos] = useState<[number, number, number] | null>(null);

  useEffect(() => setIsMounted(true), []);
  useCloseOnEscape(show && isMounted, onHide);

  useEffect(() => {
    if (!show) return;
    const interval = setInterval(() => {
      const body = boxRigidBodyRef.current;
      if (body) {
        const t = body.translation();
        // Convert scene coordinates to URDF meters
        const [ux, uy, uz] = sceneToIK(t.x, t.y, t.z);
        setLivePos([ux, uy, uz]); 
      } else {
        setLivePos(null);
      }
    }, 100);
    return () => clearInterval(interval);
  }, [show]);

  const handleResetDefaults = () => {
    setConfig({
      position: [0.30, 0, 0.015],
      size: [0.03, 0.03, 0.03],
      color: "#6366f1",
    });
    onRespawn();
  };

  useEffect(() => {
    if (bounds.width > 0 && bounds.height > 0 && !hasInitPos) {
      const nextPos = setPanelPosition(
        PANEL_ID,
        {
          x: 20,
          y: window.innerHeight - bounds.height - 20,
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

  const preferredUnit = useDisplayStore(
    (state: DisplayState) => state.preferredUnit,
  );

  const handleChange = (
    type: "position" | "size",
    index: number,
    value: string,
  ) => {
    const num = parseFloat(value);
    if (isNaN(num)) return;

    // The user inputs a number in their preferred unit, but the store needs it in raw meters
    const metersValue = convertToMeters(num, preferredUnit);

    setConfig((prev) => {
      const newArray = [...prev[type]] as [number, number, number];
      newArray[index] = metersValue;
      return { ...prev, [type]: newArray };
    });
  };

  if (!isMounted) return null;

  return (
    <Rnd
      default={{
        ...getDefaultPanelPosition(PANEL_ID),
        width:
          getPanelSize(PANEL_ID, "global")?.width ??
          DEFAULT_PANEL_SIZES.physicsControl.width,
        height:
          getPanelSize(PANEL_ID, "global")?.height ??
          DEFAULT_PANEL_SIZES.physicsControl.height,
      }}
      position={position}
      minWidth={240}
      minHeight={220}
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
        display: show ? undefined : "none",
        ["--panel-x" as string]: `${position.x}px`,
        ["--panel-y" as string]: `${position.y}px`,
      }}
    >
      <div
        ref={ref}
        className={
          "p-4 w-full h-full flex flex-col overflow-y-auto z-50 " + panelStyle
        }
      >
        <h4 className={panelHeaderClass}>
          <span className="flex items-center gap-2">
            <GripDots />
            📦 Physics Box Config
          </span>
          <button
            type="button"
            onClick={onHide}
            className={panelCloseButtonClass}
            aria-label="Close physics panel"
            title="Collapse"
          >
            x
          </button>
        </h4>

        <div className="space-y-4 text-sm text-white/90">
          <div>
            <label className="font-semibold block mb-2">
              Position (X, Y, Z - URDF) in {preferredUnit}
            </label>
            <div className="flex gap-2">
              <input
                type="number"
                step={
                  preferredUnit === "m"
                    ? "0.01"
                    : preferredUnit === "cm"
                      ? "1"
                      : "10"
                }
                className={`w-1/3 ${panelInputClass}`}
                value={Number(
                  convertToUnit(config.position[0], preferredUnit).toFixed(2),
                )}
                onChange={(e) => handleChange("position", 0, e.target.value)}
              />
              <input
                type="number"
                step={
                  preferredUnit === "m"
                    ? "0.01"
                    : preferredUnit === "cm"
                      ? "1"
                      : "10"
                }
                className={`w-1/3 ${panelInputClass}`}
                value={Number(
                  convertToUnit(config.position[1], preferredUnit).toFixed(2),
                )}
                onChange={(e) => handleChange("position", 1, e.target.value)}
              />
              <input
                type="number"
                step={
                  preferredUnit === "m"
                    ? "0.01"
                    : preferredUnit === "cm"
                      ? "1"
                      : "10"
                }
                className={`w-1/3 ${panelInputClass}`}
                value={Number(
                  convertToUnit(config.position[2], preferredUnit).toFixed(2),
                )}
                onChange={(e) => handleChange("position", 2, e.target.value)}
              />
            </div>
          </div>

          <div className="bg-black/30 p-2 rounded border border-white/5 flex flex-col gap-1">
            <label className="text-xs text-zinc-400 font-semibold uppercase tracking-wider">Live Position</label>
            <div className="font-mono text-emerald-400 text-[11px] grid grid-cols-3 text-center">
              <span>X: {livePos ? convertToUnit(livePos[0], preferredUnit).toFixed(2) : "--"}</span>
              <span>Y: {livePos ? convertToUnit(livePos[1], preferredUnit).toFixed(2) : "--"}</span>
              <span>Z: {livePos ? convertToUnit(livePos[2], preferredUnit).toFixed(2) : "--"}</span>
            </div>
          </div>

          <div>
            <label className="font-semibold block mb-2">
              Size (w, h, d) in {preferredUnit}
            </label>
            <div className="flex gap-2">
              <input
                type="number"
                step={
                  preferredUnit === "m"
                    ? "0.01"
                    : preferredUnit === "cm"
                      ? "1"
                      : "10"
                }
                min="0.01"
                className={`w-1/3 ${panelInputClass}`}
                value={Number(
                  convertToUnit(config.size[0], preferredUnit).toFixed(2),
                )}
                onChange={(e) => handleChange("size", 0, e.target.value)}
              />
              <input
                type="number"
                step={
                  preferredUnit === "m"
                    ? "0.01"
                    : preferredUnit === "cm"
                      ? "1"
                      : "10"
                }
                min="0.01"
                className={`w-1/3 ${panelInputClass}`}
                value={Number(
                  convertToUnit(config.size[1], preferredUnit).toFixed(2),
                )}
                onChange={(e) => handleChange("size", 1, e.target.value)}
              />
              <input
                type="number"
                step={
                  preferredUnit === "m"
                    ? "0.01"
                    : preferredUnit === "cm"
                      ? "1"
                      : "10"
                }
                min="0.01"
                className={`w-1/3 ${panelInputClass}`}
                value={Number(
                  convertToUnit(config.size[2], preferredUnit).toFixed(2),
                )}
                onChange={(e) => handleChange("size", 2, e.target.value)}
              />
            </div>
          </div>
          <div>
            <label className="font-semibold block mb-2">Color</label>
            <input
              type="color"
              className="w-full h-8 rounded cursor-pointer"
              value={config.color}
              onChange={(e) =>
                setConfig((prev) => ({ ...prev, color: e.target.value }))
              }
            />
          </div>

          <div className="pt-2 border-t border-white/20 flex gap-2">
            <button
              type="button"
              className={`flex-1 ${panelPrimaryButtonClass}`}
              onClick={onRespawn}
            >
              Respawn
            </button>
            <button
              type="button"
              className={`flex-1 py-2 px-3 rounded bg-zinc-700 hover:bg-zinc-600 text-white text-xs font-medium transition-colors`}
              onClick={handleResetDefaults}
            >
              Reset Defaults
            </button>
          </div>
        </div>
      </div>
    </Rnd>
  );
});
