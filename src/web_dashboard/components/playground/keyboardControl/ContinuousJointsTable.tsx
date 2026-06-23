import React, { useCallback, useEffect, useState } from "react";
import {
  JointState,
  UpdateJointSpeed,
  UpdateJointsSpeed,
} from "../../../hooks/useRobotControl";
import { DirectionalButton } from "./DirectionalButton";

type ContinuousJointsTableProps = {
  joints: JointState[];
  updateJointSpeed: UpdateJointSpeed;
  updateJointsSpeed: UpdateJointsSpeed; // Add updateJointsSpeed prop
  maxSpeed?: number;
};

const formatSpeed = (speed?: number | "N/A" | "error") => {
  if (speed === "error") {
    return <span className="text-red-500">Error</span>;
  }
  if (typeof speed === "number") {
    return `${speed.toFixed(0)}`;
  }
  return "/";
};

export function ContinuousJointsTable({
  joints,
  updateJointSpeed,
  updateJointsSpeed,
  maxSpeed = 1000,
}: ContinuousJointsTableProps) {
  const [keyState, setKeyState] = useState<string | null>(null);

  // If we have exactly two continuous joints, we assume they are differential drive wheels
  const isDifferentialDrive = joints.length === 2;

  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      const tag = (event.target as HTMLElement)?.tagName?.toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select") return;

      if (isDifferentialDrive) {
        switch (event.key) {
          case "ArrowUp":
            setKeyState("forward");
            updateJointsSpeed([
              { servoId: joints[0].servoId!, speed: -maxSpeed },
              { servoId: joints[1].servoId!, speed: maxSpeed },
            ]);
            break;
          case "ArrowDown":
            setKeyState("backward");
            updateJointsSpeed([
              { servoId: joints[0].servoId!, speed: maxSpeed },
              { servoId: joints[1].servoId!, speed: -maxSpeed },
            ]);
            break;
          case "ArrowLeft":
            setKeyState("left");
            updateJointsSpeed([
              { servoId: joints[0].servoId!, speed: maxSpeed },
              { servoId: joints[1].servoId!, speed: maxSpeed },
            ]);
            break;
          case "ArrowRight":
            setKeyState("right");
            updateJointsSpeed([
              { servoId: joints[0].servoId!, speed: -maxSpeed },
              { servoId: joints[1].servoId!, speed: -maxSpeed },
            ]);
            break;
          default:
            break;
        }
      }
    },
    [isDifferentialDrive, joints, maxSpeed, updateJointsSpeed],
  );

  const handleKeyUp = useCallback(
    (event: KeyboardEvent) => {
      const tag = (event.target as HTMLElement)?.tagName?.toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select") return;

      if (isDifferentialDrive) {
        if (
          ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.key)
        ) {
          setKeyState(null);
          updateJointsSpeed([
            { servoId: joints[0].servoId!, speed: 0 },
            { servoId: joints[1].servoId!, speed: 0 },
          ]);
        }
      }
    },
    [isDifferentialDrive, joints, updateJointsSpeed],
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, [handleKeyDown, handleKeyUp]);

  return (
    <div className="mt-4 flex relative">
      {/* Wheel Status Table */}
      <div className="flex-1">
        <table className="table-auto w-full text-left text-sm">
          <thead>
            <tr>
              <th className="border-b border-gray-600 pb-1 pr-2">
                {isDifferentialDrive ? "Wheel" : "Joint"}
              </th>
              <th className="border-b border-gray-600 pb-1 text-center px-2">
                Speed
              </th>
              <th className="border-b border-gray-600 pl-4">Control</th>
            </tr>
          </thead>
          <tbody>
            {joints.map((detail) => (
              <tr key={detail.servoId}>
                <td className="py-2">{detail.name}</td>
                <td className="py-2 pr-2 text-center w-16">
                  {formatSpeed(detail.speed)}
                </td>
                <td className="py-2 pl-4">
                  {!isDifferentialDrive ? (
                    <input
                      type="range"
                      min={-maxSpeed}
                      max={maxSpeed}
                      step={50}
                      value={
                        typeof detail.speed === "number" ? detail.speed : 0
                      }
                      onChange={(e) => {
                        updateJointSpeed(
                          detail.servoId!,
                          parseInt(e.target.value, 10),
                        );
                      }}
                      className="h-2 bg-zinc-700 appearance-none cursor-pointer w-24 custom-range-thumb"
                    />
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Directional Control Section - Only show for Differential Drive */}
      {isDifferentialDrive && (
        <div className="absolute right-3 top-10">
          <div className="flex flex-col items-center gap-1">
            <DirectionalButton
              direction="up"
              onMouseDown={() =>
                handleKeyDown({ key: "ArrowUp" } as KeyboardEvent)
              }
              onMouseUp={() => handleKeyUp({ key: "ArrowUp" } as KeyboardEvent)}
              isActive={keyState === "forward"}
            />
            <div className="flex gap-1">
              <DirectionalButton
                direction="left"
                onMouseDown={() =>
                  handleKeyDown({ key: "ArrowLeft" } as KeyboardEvent)
                }
                onMouseUp={() =>
                  handleKeyUp({ key: "ArrowLeft" } as KeyboardEvent)
                }
                isActive={keyState === "left"}
              />
              <DirectionalButton
                direction="down"
                onMouseDown={() =>
                  handleKeyDown({ key: "ArrowDown" } as KeyboardEvent)
                }
                onMouseUp={() =>
                  handleKeyUp({ key: "ArrowDown" } as KeyboardEvent)
                }
                isActive={keyState === "backward"}
              />
              <DirectionalButton
                direction="right"
                onMouseDown={() =>
                  handleKeyDown({ key: "ArrowRight" } as KeyboardEvent)
                }
                onMouseUp={() =>
                  handleKeyUp({ key: "ArrowRight" } as KeyboardEvent)
                }
                isActive={keyState === "right"}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
