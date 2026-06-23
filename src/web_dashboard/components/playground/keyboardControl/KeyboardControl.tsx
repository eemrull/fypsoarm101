"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { Rnd } from "react-rnd";
import {
  UpdateJointDegrees,
  UpdateJointsDegrees,
  JointState,
  UpdateJointSpeed,
  UpdateJointsSpeed,
} from "../../../hooks/useRobotControl";
import {
  useRobotStateStore,
  type RobotState,
} from "@/store/useRobotStateStore";
import { useRobotProfileStore } from "@/store/useRobotProfileStore";
import { useShallow } from "zustand/react/shallow";
import { RevoluteJointsTable } from "./RevoluteJointsTable"; // Updated import path
import { ContinuousJointsTable } from "./ContinuousJointsTable"; // Updated import path
import { IKPositionControl } from "./TeachingPendantTab";
import { robotConfigMap, RobotConfig } from "@/config/robotConfig";
import {
  panelStyle,
  panelHeaderClass,
  panelCloseButtonClass,
  panelPrimaryButtonClass,
  panelButtonClass,
  panelDangerButtonClass,
} from "@/components/playground/panelStyle";
import { RobotConnectionHelpDialog } from "./RobotConnectionHelpDialog";
import { GripDots } from "@/components/playground/GripDots";
import { useCloseOnEscape } from "@/components/playground/usePanelA11y";
import {
  getPanelPosition,
  setPanelPosition,
  getPanelSize,
  setPanelSize,
  getDefaultPanelPosition,
  getPanelViewportBounds,
  DEFAULT_PANEL_SIZES,
} from "@/lib/panelSettings";

// --- Control Panel Component ---
type ControlPanelProps = {
  updateJointDegrees: UpdateJointDegrees; // Updated type
  updateJointsDegrees: UpdateJointsDegrees; // Updated type
  updateJointSpeed: UpdateJointSpeed; // Updated type
  updateJointsSpeed: UpdateJointsSpeed; // Add updateJointsSpeed
  moveJointsSmoothly: (
    updates: { servoId: number; value: number }[],
    durationMs?: number,
    startFromFeedback?: boolean,
  ) => Promise<void>;

  isConnected: boolean;
  connectionMessage?: string;
  firmwareConfigStatus?: {
    level: "idle" | "pending" | "ok" | "error";
    message: string;
  };
  bridgeHealth?: {
    latencyMs: number;
    staleSec: number;
    fullJointState: boolean;
    zeroOnStale: boolean;
  };
  profileValidationErrors?: string[];
  profileValidationWarnings?: string[];

  connectRobot: () => Promise<void>;
  disconnectRobot: () => Promise<void>;
  keyboardControlMap: RobotConfig["keyboardControlMap"]; // New prop for keyboard control
  compoundMovements?: RobotConfig["compoundMovements"]; // Use type from robotConfig
  onHide?: () => void;
  show?: boolean;
  robotName?: string;
  transportMode?: "ros" | "usb";
};

const PANEL_ID = "keyboardControl";

export const ControlPanel = React.memo(function ControlPanel({
  robotName,
  show = true,
  onHide,
  updateJointDegrees,
  updateJointsDegrees,
  updateJointSpeed,
  updateJointsSpeed, // Pass updateJointsSpeed
  moveJointsSmoothly,
  isConnected,
  connectionMessage,
  firmwareConfigStatus,
  bridgeHealth,
  profileValidationErrors = [],
  profileValidationWarnings = [],
  connectRobot,
  disconnectRobot,
  keyboardControlMap,
  compoundMovements,
  transportMode = "ros",
}: ControlPanelProps) {
  const [connectionStatus, setConnectionStatus] = useState<
    "idle" | "connecting" | "disconnecting"
  >("idle");
  const [position, setPosition] = useState(() => {
    const savedPos = getPanelPosition(PANEL_ID, "global");
    if (savedPos) {
      return savedPos;
    }
    return { x: 0, y: 0 };
  });
  const [size, setSize] = useState(() => getPanelSize(PANEL_ID, "global"));
  const panelBodyRef = useRef<HTMLDivElement | null>(null);

  const [isMounted, setIsMounted] = useState(false);
  useEffect(() => setIsMounted(true), []);
  const [hasInitPos, setHasInitPos] = useState(
    () => getPanelPosition(PANEL_ID, "global") !== null,
  );

  useEffect(() => {
    if (!hasInitPos) {
      const nextPos = setPanelPosition(
        PANEL_ID,
        {
          x: window.innerWidth - size.width - 20,
          y: window.innerHeight - size.height - 20,
        },
        "global",
      );
      setPosition(nextPos);
      setHasInitPos(true);
    }
  }, [hasInitPos, size.height, size.width]);

  useEffect(() => {
    const syncViewportClamp = () => {
      const clampedSize = getPanelSize(PANEL_ID, "global");
      setSize(clampedSize);
      const clampedPos = getPanelPosition(PANEL_ID, "global");
      if (clampedPos) {
        setPosition(clampedPos);
      }
    };

    syncViewportClamp();
    window.addEventListener("resize", syncViewportClamp);
    window.visualViewport?.addEventListener("resize", syncViewportClamp);
    return () => {
      window.removeEventListener("resize", syncViewportClamp);
      window.visualViewport?.removeEventListener("resize", syncViewportClamp);
    };
  }, []);

  const fitPanelHeightToContent = useCallback(() => {
    const panelBody = panelBodyRef.current;
    const viewportBounds = getPanelViewportBounds();
    if (!panelBody || !viewportBounds) return;

    const current = getPanelSize(PANEL_ID, "global");
    const desiredHeight = Math.ceil(panelBody.scrollHeight + 8);
    const nextHeight = Math.min(
      viewportBounds.height,
      Math.max(current.height, desiredHeight),
    );
    if (nextHeight === current.height) return;

    setPanelSize(
      PANEL_ID,
      { width: current.width, height: nextHeight },
      "global",
    );
    setSize(getPanelSize(PANEL_ID, "global"));
    const clampedPos = getPanelPosition(PANEL_ID, "global");
    if (clampedPos) {
      setPosition(clampedPos);
    }
  }, []);

  useEffect(() => {
    if (!show || !isMounted) return;
    const frame = window.requestAnimationFrame(fitPanelHeightToContent);
    return () => window.cancelAnimationFrame(frame);
  }, [
    show,
    isMounted,
    fitPanelHeightToContent,
    isConnected,
    connectionMessage,
    firmwareConfigStatus?.message,
    profileValidationErrors.length,
    profileValidationWarnings.length,
  ]);

  const hasValidationErrors = profileValidationErrors.length > 0;
  const hasValidationWarnings = profileValidationWarnings.length > 0;

  const statusToneClass =
    firmwareConfigStatus?.level === "error"
      ? "text-red-300"
      : firmwareConfigStatus?.level === "ok"
        ? "text-emerald-300"
        : firmwareConfigStatus?.level === "pending"
          ? "text-amber-300"
          : "text-zinc-400";

  const handleConnect = async () => {
    if (hasValidationErrors) return;
    setConnectionStatus("connecting");
    try {
      await connectRobot();
    } finally {
      setConnectionStatus("idle");
    }
  };

  const handleDisconnect = async () => {
    setConnectionStatus("disconnecting");
    try {
      await disconnectRobot();
    } finally {
      setConnectionStatus("idle");
    }
  };

  useCloseOnEscape(show && isMounted, () => {
    if (onHide) onHide();
  });

  if (!isMounted) return null;

  return (
    <Rnd
      default={{
        ...getDefaultPanelPosition(PANEL_ID),
        width: DEFAULT_PANEL_SIZES.keyboardControl.width,
        height: DEFAULT_PANEL_SIZES.keyboardControl.height,
      }}
      size={size}
      position={position}
      minWidth={280}
      minHeight={360}
      onDragStop={(_e, d) => {
        const nextPos = setPanelPosition(
          PANEL_ID,
          { x: d.x, y: d.y },
          "global",
        );
        setPosition(nextPos);
      }}
      enableResizing={true}
      onResizeStop={(_e, _dir, ref, _delta, nextPos) => {
        setPanelSize(
          PANEL_ID,
          { width: ref.offsetWidth, height: ref.offsetHeight },
          "global",
        );
        setSize(getPanelSize(PANEL_ID, "global"));
        const clampedPos = setPanelPosition(PANEL_ID, nextPos, "global");
        setPosition(clampedPos);
      }}
      bounds="window"
      className="rnd-viewport-clamp !z-[9999]"
      dragHandleClassName="panel-drag-handle"
      style={{
        display: show ? undefined : "none",
        ["--panel-x" as string]: `${position.x}px`,
        ["--panel-y" as string]: `${position.y}px`,
      }}
    >
      <div
        ref={panelBodyRef}
        className={
          "w-full h-full flex flex-col overflow-y-auto text-sm " + panelStyle
        }
      >
        <h3 className={panelHeaderClass}>
          <span className="flex items-center gap-2">
            <GripDots />⌨ Joint Controls
          </span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              aria-label="Close joint controls panel"
              onClick={onHide}
              onTouchEnd={onHide}
              className={panelCloseButtonClass}
              title="Collapse"
            >
              x
            </button>
          </div>
        </h3>

        <SubscribedJointTables
          robotName={robotName}
          updateJointDegrees={updateJointDegrees}
          updateJointsDegrees={updateJointsDegrees}
          updateJointSpeed={updateJointSpeed}
          updateJointsSpeed={updateJointsSpeed}
          moveJointsSmoothly={moveJointsSmoothly}
          keyboardControlMap={keyboardControlMap}
          compoundMovements={compoundMovements}
        />

        {/* Connection Controls */}
        <div className="mt-3 flex justify-between items-center gap-2">
          <div className="flex justify-between items-center gap-2 flex-1">
            <button
              type="button"
              onClick={isConnected ? handleDisconnect : handleConnect}
              disabled={
                connectionStatus !== "idle" ||
                (!isConnected && hasValidationErrors)
              }
              className={`flex-1 w-full ${
                isConnected
                  ? panelDangerButtonClass
                  : hasValidationErrors
                    ? panelButtonClass
                    : panelPrimaryButtonClass
              }`}
            >
              {connectionStatus === "connecting"
                ? "Connecting..."
                : connectionStatus === "disconnecting"
                  ? "Disconnecting..."
                  : isConnected
                    ? transportMode === "usb" ? "Disconnect Web Serial" : "Disconnect ROSbridge"
                    : hasValidationErrors
                      ? "Fix Profile Before Connect"
                      : transportMode === "usb" ? "Connect via Web Serial" : "Connect via ROSbridge"}
            </button>
            <RobotConnectionHelpDialog />
          </div>
        </div>
        <div className="mt-2 rounded-md border border-white/10 bg-black/20 px-2 py-1.5 text-center text-[11px] font-medium">
          <p className="text-zinc-200">{connectionMessage}</p>
          {firmwareConfigStatus?.message && (
            <p className={`mt-0.5 ${statusToneClass}`}>
              Firmware: {firmwareConfigStatus.message}
            </p>
          )}
          <details className="mt-1 text-left">
            <summary className="cursor-pointer text-[10px] text-zinc-400 select-none">
              Diagnostics
            </summary>
            <div className="mt-1 space-y-1 text-[10px] text-zinc-400">
              <p>
                Serial connection takes place via local ROS2 backend. Ensure ROS
                is running.
              </p>
              {bridgeHealth && (
                <p>
                  Bridge: {bridgeHealth.latencyMs.toFixed(1)}ms latency,{" "}
                  {bridgeHealth.staleSec.toFixed(2)}s stale, full-order=
                  {bridgeHealth.fullJointState ? "yes" : "no"}, zero-on-stale=
                  {bridgeHealth.zeroOnStale ? "on" : "off"}
                </p>
              )}
            </div>
          </details>
          {hasValidationErrors && (
            <div className="mt-2 text-red-300 text-[10px]">
              <p>
                {profileValidationErrors.length} profile issue
                {profileValidationErrors.length === 1 ? "" : "s"} found.
              </p>
              <p>{profileValidationErrors[0]}</p>
              <a
                href="/assemble/so-101"
                className="inline-block mt-1 text-red-200 underline underline-offset-2"
              >
                Open Assemble to fix profile
              </a>
            </div>
          )}
          {!hasValidationErrors && hasValidationWarnings && (
            <p className="mt-2 text-amber-300 text-[10px]">
              {profileValidationWarnings[0]}
            </p>
          )}
        </div>
      </div>
    </Rnd>
  );
});

function SubscribedJointTables({
  robotName,
  updateJointDegrees,
  updateJointsDegrees,
  updateJointSpeed,
  updateJointsSpeed,
  moveJointsSmoothly,
  keyboardControlMap,
  compoundMovements,
}: {
  robotName?: string;
  updateJointDegrees: UpdateJointDegrees;
  updateJointsDegrees: UpdateJointsDegrees;
  updateJointSpeed: UpdateJointSpeed;
  updateJointsSpeed: UpdateJointsSpeed;
  moveJointsSmoothly: (
    updates: { servoId: number; value: number }[],
    durationMs?: number,
    startFromFeedback?: boolean,
  ) => Promise<void>;
  keyboardControlMap: RobotConfig["keyboardControlMap"];
  compoundMovements?: RobotConfig["compoundMovements"];
}) {
  const jointStates: JointState[] = useRobotStateStore(
    useShallow((state: RobotState) => state.jointStates),
  );
  const feedbackStates: JointState[] = useRobotStateStore(
    useShallow((state: RobotState) => state.feedbackStates),
  );

  // When connected to ROSbridge, feedbackStates contains the real servo
  // positions including wobble, weight deflection, and overshoot. Show those
  // in the UI so the displayed angles match the 3D model. When disconnected
  // (feedbackStates is empty), fall back to the commanded jointStates.
  const displayStates = feedbackStates.length > 0 ? feedbackStates : jointStates;

  const revoluteJoints = displayStates.filter(
    (state: JointState) => state.jointType === "revolute",
  );
  const continuousJoints = displayStates.filter(
    (state: JointState) => state.jointType === "continuous",
  );

  return (
    <>
      {/* Revolute Joints Table */}
      {revoluteJoints.length > 0 && (
        <RevoluteJointsTable
          joints={revoluteJoints}
          updateJointDegrees={updateJointDegrees}
          updateJointsDegrees={updateJointsDegrees}
          keyboardControlMap={keyboardControlMap}
          compoundMovements={compoundMovements}
        />
      )}

      {/* Continuous Joints Table */}
      {continuousJoints.length > 0 && (
        <ContinuousJointsTable
          joints={continuousJoints}
          updateJointSpeed={updateJointSpeed}
          updateJointsSpeed={updateJointsSpeed}
        />
      )}

      {/* Inverse Kinematics Target Panel */}
      {revoluteJoints.length >= 3 && (
        <IKPositionControl
          moveJointsSmoothly={moveJointsSmoothly}
          jointStates={jointStates}
        />
      )}

      {/* Home Position & Profile Actions */}
      {revoluteJoints.length > 0 && (
        <div className="mt-4 flex flex-col gap-2">
          <div className="flex justify-between items-center gap-2">
            <button
              type="button"
              onClick={() => {
                const config = robotConfigMap[robotName || "so-arm101"];
                if (config?.urdfInitJointAngles && moveJointsSmoothly) {
                  const resetAngles = revoluteJoints.map((jd: JointState) => ({
                    servoId: jd.servoId!,
                    value: config.urdfInitJointAngles![jd.name] || 180,
                  }));
                  // Calculate duration based on max angle change (10ms/deg, min 800ms, max 3000ms)
                  const maxDelta = resetAngles.reduce((max, upd) => {
                    const current = revoluteJoints.find(
                      (j: JointState) => j.servoId === upd.servoId,
                    );
                    const curDeg =
                      current && typeof current.degrees === "number"
                        ? current.degrees
                        : 180;
                    return Math.max(max, Math.abs(upd.value - curDeg));
                  }, 0);
                  const durationMs = Math.min(3000, Math.max(800, maxDelta * 10));
                  moveJointsSmoothly(resetAngles, durationMs, true);
                }
              }}
              className={`flex-1 ${panelButtonClass}`}
            >
              Home Position
            </button>
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => {
                const json = useRobotProfileStore.getState().exportProfile();
                const blob = new Blob([json], { type: "application/json" });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = `${robotName || "robot"}_profile.json`;
                a.click();
                URL.revokeObjectURL(url);
              }}
              className="flex-1 bg-white/5 hover:bg-white/10 text-xs text-zinc-400 py-1 rounded border border-white/10 transition-colors"
            >
              Export Profile
            </button>
            <label className="flex-1">
              <input
                type="file"
                accept=".json"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  const reader = new FileReader();
                  reader.onload = (event) => {
                    const content = event.target?.result as string;
                    if (useRobotProfileStore.getState().importProfile(content)) {
                      alert("Profile imported successfully!");
                    } else {
                      alert("Failed to import profile. Check file format.");
                    }
                  };
                  reader.readAsText(file);
                }}
              />
              <div className="w-full h-full bg-white/5 hover:bg-white/10 text-xs text-zinc-400 py-1 rounded border border-white/10 transition-colors text-center cursor-pointer">
                Import Profile
              </div>
            </label>
          </div>
        </div>
      )}
    </>
  );
}
