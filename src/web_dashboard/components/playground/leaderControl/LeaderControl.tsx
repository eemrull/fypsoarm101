import React, { useState, useEffect } from "react";
import {
  getPanelPosition,
  setPanelPosition,
  getPanelSize,
  setPanelSize,
  getDefaultPanelPosition,
  DEFAULT_PANEL_SIZES,
} from "@/lib/panelSettings";
import { servoPositionToAngle } from "@/lib/utils";
import { Rnd } from "react-rnd";
import useMeasure from "react-use-measure";
import {
  panelStyle,
  panelHeaderClass,
  panelCloseButtonClass,
  panelPrimaryButtonClass,
  panelDangerButtonClass,
} from "@/components/playground/panelStyle";
import { LeaderConnectionHelpDialog } from "./LeaderConnectionHelpDialog";
import { GripDots } from "@/components/playground/GripDots";
import { useCloseOnEscape } from "@/components/playground/usePanelA11y";

/**
 * props:
 * - leaderControl: { isConnected, connectLeader, disconnectLeader, positions }
 * - jointDetails: JointDetails[]
 * - onSync: (leaderAngles: { servoId: number, angle: number }[]) => void
 * - show: boolean
 * - onHide: () => void
 */

const SYNC_INTERVAL = 10; // ms
const PANEL_ID = "leaderControl";

type RevoluteJointDetail = {
  servoId: number;
  name: string;
  jointType: "revolute";
};

type LeaderAngle = {
  servoId: number;
  angle: number;
};

type LeaderControlApi = {
  isConnected: boolean;
  connectLeader: () => Promise<void>;
  disconnectLeader: () => Promise<void>;
  getPositions: () => Promise<Map<number, number>>;
};

const LeaderControl = React.memo(function LeaderControl({
  leaderControl,
  jointDetails,
  onSync,
  show = true,
  onHide,
}: {
  leaderControl: LeaderControlApi;
  jointDetails: {
    servoId: number;
    name: string;
    jointType: "revolute" | "continuous";
  }[];
  onSync: (angles: LeaderAngle[]) => void;
  show?: boolean;
  onHide: () => void;
}) {
  const revoluteJoints = jointDetails.filter(
    (joint): joint is RevoluteJointDetail => joint.jointType === "revolute",
  );
  const { isConnected, connectLeader, disconnectLeader, getPositions } =
    leaderControl;
  const [angles, setAngles] = useState<LeaderAngle[]>(
    revoluteJoints.map((joint) => ({
      servoId: joint.servoId,
      angle: 0,
    })),
  );
  const [connectionStatus, setConnectionStatus] = useState<
    "idle" | "connecting" | "disconnecting"
  >("idle");
  const [ref] = useMeasure();
  const [position, setPosition] = useState(
    () =>
      getPanelPosition(PANEL_ID, "global") ?? getDefaultPanelPosition(PANEL_ID),
  );

  useEffect(() => {
    setAngles(
      revoluteJoints.map((joint) => ({
        servoId: joint.servoId,
        angle: 0,
      })),
    );
  }, [revoluteJoints]);

  // Periodically fetch positionChange and sync
  useEffect(() => {
    if (!isConnected) return;

    const timer = setInterval(async () => {
      const positions = await getPositions();
      // If positions map is empty, it might be due to disconnection or an error.
      // Avoid updating angles to prevent them from resetting to 0.
      if (positions.size === 0) return;

      const leaderAngles = revoluteJoints.map((joint) => ({
        servoId: joint.servoId,
        angle: servoPositionToAngle(positions.get(joint.servoId) ?? 0),
      }));
      setAngles(leaderAngles);
      onSync(leaderAngles);
    }, SYNC_INTERVAL);

    return () => clearInterval(timer);
  }, [isConnected, revoluteJoints, getPositions, onSync]);

  const handleConnect = async () => {
    setConnectionStatus("connecting");
    try {
      await connectLeader();
    } finally {
      setConnectionStatus("idle");
    }
  };

  const handleDisconnect = async () => {
    setConnectionStatus("disconnecting");
    try {
      await disconnectLeader();
      // Reset angles to 0 when disconnected
      setAngles(
        revoluteJoints.map((joint) => ({
          servoId: joint.servoId,
          angle: 0,
        })),
      );
    } finally {
      setConnectionStatus("idle");
    }
  };

  const [isMounted, setIsMounted] = useState(false);
  useEffect(() => setIsMounted(true), []);
  useCloseOnEscape(show && isMounted, onHide);

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

  if (!show || !isMounted) return null;

  return (
    <Rnd
      default={{
        ...getDefaultPanelPosition(PANEL_ID),
        width:
          getPanelSize(PANEL_ID, "global")?.width ??
          DEFAULT_PANEL_SIZES.leaderControl.width,
        height:
          getPanelSize(PANEL_ID, "global")?.height ??
          DEFAULT_PANEL_SIZES.leaderControl.height,
      }}
      position={position}
      minWidth={280}
      minHeight={220}
      onDragStop={(_, d) => {
        const nextPos = setPanelPosition(
          PANEL_ID,
          { x: d.x, y: d.y },
          "global",
        );
        setPosition(nextPos);
      }}
      onResizeStop={(_event, _direction, elementRef, _delta, nextPos) => {
        setPanelSize(
          PANEL_ID,
          {
            width: elementRef.offsetWidth,
            height: elementRef.offsetHeight,
          },
          "global",
        );
        const clampedPos = setPanelPosition(PANEL_ID, nextPos, "global");
        setPosition(clampedPos);
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
        className={"max-h-[90vh] overflow-y-auto text-sm " + panelStyle}
      >
        <h3 className={panelHeaderClass}>
          <span className="flex items-center gap-2">
            <GripDots />
            🎮 Control via Leader Robot
          </span>
          <button
            type="button"
            className={panelCloseButtonClass}
            title="Collapse"
            aria-label="Close leader control panel"
            onClick={onHide}
            onTouchEnd={onHide}
          >
            x
          </button>
        </h3>

        {revoluteJoints.length === 0 ? (
          <div className="mt-4 text-center text-gray-400">
            No joints available for leader control.
          </div>
        ) : (
          <>
            <div className="mt-4">
              <table className="w-full text-left">
                <thead>
                  <tr>
                    <th className="border-b border-gray-600 pb-1">Joint</th>
                    <th className="border-b border-gray-600 pb-1 text-center pl-4">
                      Angle
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {revoluteJoints.map((joint) => (
                    <tr key={joint.servoId}>
                      <td className="py-1">{joint.name}</td>
                      <td className="py-1 text-center">
                        {(() => {
                          const angle =
                            angles.find(
                              (entry) => entry.servoId === joint.servoId,
                            )?.angle ?? 0;
                          return angle.toFixed(1) + "°";
                        })()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-4 flex justify-between items-center gap-2">
              {isConnected ? (
                <button
                  type="button"
                  className={`flex-1 ${panelDangerButtonClass} ${
                    connectionStatus !== "idle"
                      ? "opacity-50 cursor-not-allowed"
                      : ""
                  }`}
                  onClick={handleDisconnect}
                  disabled={connectionStatus !== "idle"}
                >
                  {connectionStatus === "disconnecting"
                    ? "Disconnecting..."
                    : "Disconnect Leader Robot"}
                </button>
              ) : (
                <button
                  type="button"
                  className={`flex-1 ${panelPrimaryButtonClass} ${
                    connectionStatus !== "idle"
                      ? "opacity-50 cursor-not-allowed"
                      : ""
                  }`}
                  onClick={handleConnect}
                  disabled={connectionStatus !== "idle"}
                >
                  {connectionStatus === "connecting"
                    ? "Connecting..."
                    : "Connect Leader Robot"}
                </button>
              )}
              <LeaderConnectionHelpDialog />
            </div>
          </>
        )}
      </div>
    </Rnd>
  );
});

export default LeaderControl;
