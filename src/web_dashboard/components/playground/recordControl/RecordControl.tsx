import React, { useState, useEffect, useRef } from "react";
import { Rnd } from "react-rnd";
import useMeasure from "react-use-measure";
import {
  panelStyle,
  panelHeaderClass,
  panelCloseButtonClass,
} from "@/components/playground/panelStyle";
import { RECORDING_INTERVAL } from "@/config/uiConfig";
import { ReplayHelpDialog } from "./ReplayHelpDialog";
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

interface RecordControlProps {
  show: boolean;
  onHide: () => void;
  isRecording: boolean;
  recordData: number[][];
  startRecording: () => void;
  stopRecording: () => void;
  clearRecordData: () => void;
  updateJointsDegrees?: (updates: { servoId: number; value: number }[]) => void;
  updateJointsSpeed?: (updates: { servoId: number; speed: number }[]) => void;
  jointDetails?: { servoId: number; jointType: "revolute" | "continuous" }[];
  setRecordData?: (data: number[][]) => void;
}

type RecordingState = "idle" | "recording" | "paused" | "stopped" | "replaying";

const RecordControl = React.memo(function RecordControl({
  show,
  onHide,
  isRecording,
  recordData,
  startRecording,
  stopRecording,
  clearRecordData,
  updateJointsDegrees,
  updateJointsSpeed,
  jointDetails = [],
  setRecordData,
}: RecordControlProps) {
  const [recordingState, setRecordingState] = useState<RecordingState>("idle");
  const [recordingTime, setRecordingTime] = useState(0);
  const [recordingFrames, setRecordingFrames] = useState(0);
  const [position, setPosition] = useState(
    () => getPanelPosition("recordControl", "global") ?? { x: 0, y: 0 },
  );
  const [hasInitPos, setHasInitPos] = useState(
    () => getPanelPosition("recordControl", "global") !== null,
  );
  const [ref, bounds] = useMeasure();
  const [replayProgress, setReplayProgress] = useState(0);
  const isReplayingRef = useRef(false);

  const [isMounted, setIsMounted] = useState(false);
  useEffect(() => setIsMounted(true), []);
  useCloseOnEscape(show && isMounted, onHide);

  // Sync recording state with hook
  useEffect(() => {
    if (isRecording && recordingState !== "recording") {
      setRecordingState("recording");
      setRecordingFrames(0);
    }
  }, [isRecording, recordingState]);

  // Timer for recording duration (UI update only, 10Hz to save performance)
  useEffect(() => {
    if (recordingState !== "recording") return;

    const UI_UPDATE_INTERVAL = 100; // 100ms
    const timer = setInterval(() => {
      setRecordingTime((prev) => prev + UI_UPDATE_INTERVAL / 1000);
      setRecordingFrames(
        (prev) => prev + UI_UPDATE_INTERVAL / RECORDING_INTERVAL,
      );
    }, UI_UPDATE_INTERVAL);

    return () => clearInterval(timer);
  }, [recordingState]);

  useEffect(() => {
    if (bounds.width > 0 && bounds.height > 0 && !hasInitPos) {
      const nextPos = setPanelPosition(
        "recordControl",
        { x: 20, y: 70 },
        "global",
      );
      setPosition(nextPos);
      setHasInitPos(true);
    }
  }, [bounds.height, bounds.width, hasInitPos]);

  useEffect(() => {
    const handleResize = () => {
      const clampedPos = getPanelPosition("recordControl", "global");
      if (clampedPos) {
        setPosition(clampedPos);
      }
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const handleStartRecord = () => {
    setRecordingState("recording");
    setRecordingTime(0);
    startRecording();
  };

  const handlePause = () => {
    setRecordingState("paused");
    stopRecording();
  };

  const handleStop = () => {
    setRecordingState("stopped");
    stopRecording();
  };

  const handleReplay = async () => {
    if (recordData.length === 0 || !updateJointsDegrees || !updateJointsSpeed) {
      console.warn("No data to replay or missing update functions");
      return;
    }

    setRecordingState("replaying");
    isReplayingRef.current = true;
    setReplayProgress(0);

    for (let frameIndex = 0; frameIndex < recordData.length; frameIndex++) {
      if (!isReplayingRef.current) {
        break;
      }
      const frame = recordData[frameIndex];
      const revoluteUpdates: { servoId: number; value: number }[] = [];
      const continuousUpdates: { servoId: number; speed: number }[] = [];

      // Process each joint in the frame
      jointDetails.forEach((joint, jointIndex) => {
        if (jointIndex < frame.length) {
          const value = frame[jointIndex];
          if (joint.jointType === "revolute") {
            revoluteUpdates.push({ servoId: joint.servoId, value });
          } else if (joint.jointType === "continuous") {
            continuousUpdates.push({ servoId: joint.servoId, speed: value });
          }
        }
      });

      // Apply updates
      if (revoluteUpdates.length > 0) {
        await updateJointsDegrees(revoluteUpdates);
      }
      if (continuousUpdates.length > 0) {
        await updateJointsSpeed(continuousUpdates);
      }

      setReplayProgress(frameIndex + 1);

      // Wait for the recording interval between frames to match recording timing
      if (frameIndex < recordData.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, RECORDING_INTERVAL));
      }
    }

    isReplayingRef.current = false;
    setRecordingState("stopped");
    setReplayProgress(0);
  };

  const handleStopReplay = () => {
    isReplayingRef.current = false;
  };

  useEffect(() => {
    if (show || !isReplayingRef.current) return;
    isReplayingRef.current = false;
    setRecordingState("stopped");
    setReplayProgress(0);
  }, [show]);

  useEffect(() => {
    return () => {
      isReplayingRef.current = false;
    };
  }, []);

  const handleSave = () => {
    if (recordData.length === 0) return;
    console.log("Saving recorded dataset...", recordData);
    const dataStr = JSON.stringify(recordData, null, 2);
    const dataBlob = new Blob([dataStr], { type: "application/json" });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `robot_sequence_${Date.now()}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !setRecordData) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const json = JSON.parse(event.target?.result as string);
        if (Array.isArray(json) && json.length > 0 && Array.isArray(json[0])) {
          setRecordData(json as number[][]);
          setRecordingState("stopped");
        } else {
          alert(
            "Invalid JSON format. Expected an array of arrays representing joint sequences.",
          );
        }
      } catch (err) {
        alert("Failed to parse JSON file.");
        console.error(err);
      }
    };
    reader.readAsText(file);
    // Reset file input so the same file can be selected again if needed
    e.target.value = "";
  };

  const handleReset = () => {
    setRecordingState("idle");
    setRecordingTime(0);
    clearRecordData();
  };

  const formatTime = (time: number) => {
    const minutes = Math.floor(time / 60);
    const seconds = (time % 60).toFixed(1);
    return `${minutes}:${seconds.padStart(4, "0")}`;
  };

  if (!show || !isMounted) return null;

  return (
    <Rnd
      default={{
        ...getDefaultPanelPosition("recordControl"),
        width:
          getPanelSize("recordControl", "global")?.width ??
          DEFAULT_PANEL_SIZES.recordControl.width,
        height:
          getPanelSize("recordControl", "global")?.height ??
          DEFAULT_PANEL_SIZES.recordControl.height,
      }}
      position={position}
      minWidth={280}
      minHeight={240}
      onDragStop={(_e, d) => {
        const nextPos = setPanelPosition(
          "recordControl",
          { x: d.x, y: d.y },
          "global",
        );
        setPosition(nextPos);
      }}
      enableResizing={true}
      onResizeStop={(_e, _dir, ref) => {
        setPanelSize(
          "recordControl",
          { width: ref.offsetWidth, height: ref.offsetHeight },
          "global",
        );
        const clampedPos = getPanelPosition("recordControl", "global");
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
          "w-full h-full flex flex-col overflow-y-auto text-sm " + panelStyle
        }
      >
        <h3 className={panelHeaderClass}>
          <span className="flex items-center gap-2">
            <GripDots />
            🔴 Record Dataset
          </span>
          <button
            type="button"
            className={panelCloseButtonClass}
            title="Collapse"
            aria-label="Close record panel"
            onClick={onHide}
            onTouchEnd={onHide}
          >
            x
          </button>
        </h3>

        <div className="mb-4">
          <div className="flex items-center justify-between">
            <span>Duration:</span>
            <span className="font-mono">{formatTime(recordingTime)}</span>
          </div>
          <div className="flex items-center justify-between">
            <span>Frames:</span>
            <span className="font-mono">
              {recordingState === "replaying"
                ? `${replayProgress}/${recordData.length}`
                : recordingState === "recording"
                  ? Math.floor(recordingFrames)
                  : recordData.length}
            </span>
          </div>
        </div>

        <div className="flex gap-2">
          <button
            className={`flex-1 px-2 py-2 rounded text-xs ${
              recordingState === "idle" || recordingState === "stopped"
                ? "bg-blue-600 hover:bg-blue-500"
                : recordingState === "paused"
                  ? "bg-blue-600 hover:bg-blue-500"
                  : "bg-gray-700 cursor-not-allowed"
            }`}
            onClick={
              recordingState === "stopped"
                ? handleReset
                : recordingState === "paused"
                  ? () => {
                      setRecordingState("recording");
                      startRecording();
                    }
                  : handleStartRecord
            }
            disabled={
              recordingState === "recording" || recordingState === "replaying"
            }
          >
            {recordingState === "paused"
              ? "Resume"
              : recordingState === "stopped"
                ? "New"
                : "Start"}
          </button>

          <button
            className={`flex-1 px-2 py-2 rounded text-xs ${
              recordingState === "recording"
                ? "bg-yellow-600 hover:bg-yellow-500"
                : "bg-gray-700 cursor-not-allowed"
            }`}
            onClick={handlePause}
            disabled={recordingState !== "recording"}
          >
            Pause
          </button>

          <button
            className={`flex-1 px-2 py-2 rounded text-xs ${
              recordingState === "recording" || recordingState === "paused"
                ? "bg-red-600 hover:bg-red-500"
                : "bg-gray-700 cursor-not-allowed"
            }`}
            onClick={handleStop}
            disabled={
              recordingState === "idle" ||
              recordingState === "stopped" ||
              recordingState === "replaying"
            }
          >
            Stop
          </button>

          <div className="flex-1 flex items-center gap-2">
            <button
              className={`w-full px-2 py-2 rounded text-xs whitespace-nowrap ${
                recordingState === "stopped"
                  ? "bg-blue-600 hover:bg-blue-500"
                  : recordingState === "replaying"
                    ? "bg-orange-600 hover:bg-orange-500"
                    : "bg-gray-700 cursor-not-allowed"
              }`}
              onClick={
                recordingState === "replaying" ? handleStopReplay : handleReplay
              }
              disabled={
                recordingState !== "stopped" && recordingState !== "replaying"
              }
            >
              {recordingState === "replaying" ? "Stop Replay" : "Replay"}
            </button>
            <ReplayHelpDialog />
          </div>

          <button
            className={`flex-1 px-2 py-2 rounded text-xs ${
              recordingState === "stopped" && recordData.length > 0
                ? "bg-green-600 hover:bg-green-500"
                : "bg-gray-700 cursor-not-allowed"
            }`}
            onClick={handleSave}
            disabled={recordingState !== "stopped" || recordData.length === 0}
            title="Export sequence as JSON"
          >
            Export JSON
          </button>
          <div className="flex-1 relative">
            <input
              type="file"
              accept=".json"
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed"
              onChange={handleImport}
              disabled={
                recordingState === "recording" ||
                recordingState === "replaying" ||
                !setRecordData
              }
              title="Import a previously exported JSON sequence"
            />
            <button
              className={`w-full px-2 py-2 rounded text-xs pointer-events-none ${
                recordingState !== "recording" &&
                recordingState !== "replaying" &&
                setRecordData
                  ? "bg-blue-600 hover:bg-blue-500"
                  : "bg-gray-700 opacity-50"
              }`}
            >
              Import JSON
            </button>
          </div>
        </div>

        {/* SEQUENCE EDITOR / TIMELINE */}
        {recordData.length > 0 && (
          <div className="mt-4 border-t border-white/20 pt-4">
            <h4 className="font-semibold text-white/90 mb-2">
              Sequence Timeline
            </h4>
            <div className="max-h-40 overflow-y-auto pr-1 space-y-1 custom-scrollbar">
              {recordData.map((frame, idx) => (
                <div
                  key={idx}
                  className={`flex items-center justify-between text-xs px-2 py-1.5 rounded bg-white/5 border border-white/10 transition-colors ${recordingState === "replaying" && replayProgress === idx + 1 ? "border-orange-500 bg-orange-500/20" : ""}`}
                >
                  <span className="font-mono text-white/50 w-8">F{idx}</span>
                  <div className="flex-1 flex gap-2 overflow-x-hidden font-mono text-[10px] text-zinc-300">
                    {frame
                      .map((val, i) => (
                        <span key={i} title={`J${i + 1}`}>
                          {val.toFixed(0)}°
                        </span>
                      ))
                      .slice(0, 4)}
                    {frame.length > 4 && (
                      <span className="opacity-50">...</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
            {recordingState === "stopped" && (
              <button
                className="w-full mt-2 text-xs py-1.5 text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded transition-colors"
                onClick={handleReset}
              >
                Clear Sequence
              </button>
            )}
          </div>
        )}
      </div>
    </Rnd>
  );
});

export default RecordControl;
