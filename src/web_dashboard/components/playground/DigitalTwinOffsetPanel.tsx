"use client";

import React, { useState, useEffect } from "react";
import { Rnd } from "react-rnd";
import useMeasure from "react-use-measure";
import {
  panelStyle,
  panelHeaderClass,
  panelCloseButtonClass,
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
import { 
  useRobotProfileStore, 
  type RobotProfileState 
} from "@/store/useRobotProfileStore";
import { RiCloseLine } from "@remixicon/react";

type DigitalTwinOffsetPanelProps = {
  show: boolean;
  onHide: () => void;
  robotName: string;
};

const PANEL_ID = "digitalTwinOffsetPanel";

export const DigitalTwinOffsetPanel = React.memo(function DigitalTwinOffsetPanel({ 
  show, 
  onHide, 
  robotName 
}: DigitalTwinOffsetPanelProps) {
  const [ref] = useMeasure();
  const [position, setPosition] = useState(
    () => getPanelPosition(PANEL_ID, robotName) ?? getDefaultPanelPosition(PANEL_ID)
  );
  const [size, setSize] = useState(
    () => getPanelSize(PANEL_ID, robotName)
  );
  const [isMounted, setIsMounted] = useState(false);

  const profileActuators = useRobotProfileStore((state: RobotProfileState) => state.actuators);
  const profileJoints = useRobotProfileStore((state: RobotProfileState) => state.joints) as string[];
  const setActuator = useRobotProfileStore((state: RobotProfileState) => state.setActuator);
  const fakeGraspSettings = useRobotProfileStore((state: RobotProfileState) => state.fakeGraspSettings);
  const setFakeGraspSettings = useRobotProfileStore((state: RobotProfileState) => state.setFakeGraspSettings);

  useEffect(() => setIsMounted(true), []);
  useCloseOnEscape(show && isMounted, onHide);

  const handleOffsetChange = (jointName: string, value: string) => {
    let actuator = profileActuators[jointName];
    if (!actuator) {
      actuator = {
        jointName,
        hardwareType: "sts3215",
        hardwareId: profileJoints.indexOf(jointName) + 1,
      };
    }
    
    let parsed: number | undefined;
    if (value.trim() === "") {
      parsed = undefined;
    } else {
      parsed = Number(value);
      if (isNaN(parsed)) return;
    }

    setActuator(jointName, {
      ...actuator,
      digitalTwinOffsetDeg: parsed,
    });
  };

  if (!show || !isMounted) return null;

  return (
    <Rnd
      size={size}
      position={position}
      onDragStop={(e, d) => {
        const nextPos = setPanelPosition(PANEL_ID, { x: d.x, y: d.y }, robotName);
        setPosition(nextPos);
      }}
      onResizeStop={(e, direction, ref, delta, position) => {
        const nextSize = {
          width: parseInt(ref.style.width),
          height: parseInt(ref.style.height),
        };
        setPanelSize(PANEL_ID, nextSize, robotName);
        setSize(nextSize);
        setPosition(position);
      }}
      dragHandleClassName="panel-drag-handle"
      bounds="parent"
      enableResizing={{
        top: false,
        right: true,
        bottom: true,
        left: false,
        topRight: false,
        bottomRight: true,
        bottomLeft: false,
        topLeft: false,
      }}
      style={{ zIndex: 60 }}
    >
      <div className={panelStyle} style={{ width: "100%", height: "100%" }}>
        <div className={panelHeaderClass}>
          <div className="flex items-center gap-2">
            <GripDots />
            <span>Digital Twin Calibration</span>
          </div>
          <button onClick={onHide} className={panelCloseButtonClass}>
            <RiCloseLine />
          </button>
        </div>

        <div 
          ref={ref}
          className="space-y-4 overflow-y-auto custom-scrollbar h-[calc(100%-40px)] pr-1"
        >
          <p className="text-[10px] uppercase tracking-wider text-white/40 font-bold mb-2">
            Visual Kinematic Offsets
          </p>
          <p className="text-xs text-zinc-400 leading-relaxed bg-black/20 p-2 rounded-md border border-white/5">
            Adjust these to align the 3D model with your real-world arm.
            Only affects the digital twin rendering.
          </p>
          
          <div className="space-y-2">
            {profileJoints.map((jointName) => {
              const actuator = profileActuators[jointName];
              
              const currentOffset = actuator?.digitalTwinOffsetDeg ?? "";

              return (
                <div key={jointName} className="group relative flex flex-col gap-1 bg-white/5 p-2 rounded-lg border border-white/10 hover:border-white/20 transition-all">
                  <label className="text-[10px] font-semibold text-zinc-400 uppercase tracking-tighter">
                    {jointName.replace(/_/g, " ")}
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      step="0.5"
                      value={currentOffset}
                      onChange={(e) => handleOffsetChange(jointName, e.target.value)}
                      placeholder="0.0"
                      className={panelInputClass}
                    />
                    <span className="text-[10px] font-mono text-zinc-500 w-8">DEG</span>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="pt-6 border-t border-white/10 mt-8 space-y-3 pb-8">
            <div className="flex items-center justify-between px-1 mb-1">
              <p className="text-[10px] uppercase tracking-wider text-white/40 font-bold">
                Physics: Fake Grasping
              </p>
              <div className="flex items-center gap-2">
                <span className="text-[9px] text-zinc-500 uppercase font-bold">Enable</span>
                <input
                  type="checkbox"
                  checked={fakeGraspSettings.enabled}
                  onChange={(e) => setFakeGraspSettings({ enabled: e.target.checked })}
                  className="w-3.5 h-3.5 rounded border-white/10 bg-white/5 checked:bg-blue-500 focus:ring-0 focus:ring-offset-0"
                />
              </div>
            </div>

            <div className={`space-y-2 transition-opacity duration-300 ${fakeGraspSettings.enabled ? "opacity-100" : "opacity-40 pointer-events-none"}`}>
              <div className="group relative flex flex-col gap-1 bg-white/5 p-2 rounded-lg border border-white/10 hover:border-white/20 transition-all">
                <label className="text-[10px] font-semibold text-zinc-400 uppercase tracking-tighter">
                  Close Threshold
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    value={fakeGraspSettings.thresholdAngle}
                    onChange={(e) => setFakeGraspSettings({ thresholdAngle: Number(e.target.value) })}
                    className={panelInputClass}
                  />
                  <span className="text-[10px] font-mono text-zinc-500 w-8">DEG</span>
                </div>
                <p className="text-[9px] text-zinc-500/60 italic leading-none mt-0.5">
                  Sticks when Jaw &lt; value
                </p>
              </div>

              <div className="group relative flex flex-col gap-1 bg-white/5 p-2 rounded-lg border border-white/10 hover:border-white/20 transition-all">
                <label className="text-[10px] font-semibold text-zinc-400 uppercase tracking-tighter">
                  Detection Radius
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    step="0.5"
                    value={fakeGraspSettings.distanceThreshold * 100}
                    onChange={(e) => setFakeGraspSettings({ distanceThreshold: Number(e.target.value) / 100 })}
                    className={panelInputClass}
                  />
                  <span className="text-[10px] font-mono text-zinc-500 w-8">CM</span>
                </div>
                <p className="text-[9px] text-zinc-500/60 italic leading-none mt-0.5">
                  How close the box must be to the center point.
                </p>
              </div>

              <div className="group relative flex flex-col gap-2 bg-white/5 p-2 rounded-lg border border-white/10 hover:border-white/20 transition-all">
                <label className="text-[10px] font-semibold text-zinc-400 uppercase tracking-tighter">
                  Attachment Offset (Nudge)
                </label>
                <div className="grid grid-cols-3 gap-2">
                  <div className="flex flex-col gap-0.5">
                    <input
                      type="number"
                      step="0.1"
                      value={fakeGraspSettings.attachOffset[0] * 100}
                      onChange={(e) => {
                        const newOffset = [...fakeGraspSettings.attachOffset] as [number, number, number];
                        newOffset[0] = Number(e.target.value) / 100;
                        setFakeGraspSettings({ attachOffset: newOffset });
                      }}
                      className={panelInputClass}
                      placeholder="X"
                    />
                    <span className="text-[8px] text-center text-zinc-600 font-bold uppercase">X (CM)</span>
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <input
                      type="number"
                      step="0.1"
                      value={fakeGraspSettings.attachOffset[1] * 100}
                      onChange={(e) => {
                        const newOffset = [...fakeGraspSettings.attachOffset] as [number, number, number];
                        newOffset[1] = Number(e.target.value) / 100;
                        setFakeGraspSettings({ attachOffset: newOffset });
                      }}
                      className={panelInputClass}
                      placeholder="Y"
                    />
                    <span className="text-[8px] text-center text-zinc-600 font-bold uppercase">Y (CM)</span>
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <input
                      type="number"
                      step="0.1"
                      value={fakeGraspSettings.attachOffset[2] * 100}
                      onChange={(e) => {
                        const newOffset = [...fakeGraspSettings.attachOffset] as [number, number, number];
                        newOffset[2] = Number(e.target.value) / 100;
                        setFakeGraspSettings({ attachOffset: newOffset });
                      }}
                      className={panelInputClass}
                      placeholder="Z"
                    />
                    <span className="text-[8px] text-center text-zinc-600 font-bold uppercase">Z (CM)</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Rnd>
  );
});
