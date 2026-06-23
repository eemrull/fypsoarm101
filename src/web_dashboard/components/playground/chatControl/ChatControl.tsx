"use client";
import React, { useState, useEffect, useRef } from "react";
import { Rnd } from "react-rnd";
import { generateText, tool } from "ai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import { SettingsModal } from "./SettingsModal";
import { z } from "zod";
import {
  getApiKeyFromLocalStorage,
  getBaseURLFromLocalStorage,
  getSystemPromptFromLocalStorage,
  getModelFromLocalStorage,
} from "../../../lib/chatSettings";
import useMeasure from "react-use-measure";
import {
  panelStyle,
  panelHeaderClass,
  panelCloseButtonClass,
  panelButtonClass,
  panelInputClass,
  panelPrimaryButtonClass,
  panelDangerButtonClass,
} from "@/components/playground/panelStyle";
import { useRobotStateStore } from "@/store/useRobotStateStore";
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
import { JointState } from "../../../hooks/useRobotControl";
import { useIKWorker } from "@/hooks/useIKWorker";
import {
  sceneToIK,
  MAX_REACH_M,
  MAX_REACH_SCENE,
} from "@/config/robotConstants";
import {
  useRobotProfileStore,
  type RobotProfileState,
} from "@/store/useRobotProfileStore";
import { getOrderedRevoluteJoints } from "@/lib/kinematics/runtimeConfig";

interface ChatControlProps {
  show: boolean;
  onHide: () => void;
  robotName: string;
  systemPrompt?: string;
  getJointStates: () => JointState[];
  moveJointsSmoothly: (
    updates: { servoId: number; value: number }[],
    durationMs?: number,
    startFromFeedback?: boolean,
  ) => Promise<void>;
}

const MAX_CHAT_MESSAGES = 120;

function sleepWithAbort(ms: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) {
    return Promise.reject(new DOMException("Aborted", "AbortError"));
  }

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      signal.removeEventListener("abort", handleAbort);
      resolve();
    }, ms);

    const handleAbort = () => {
      clearTimeout(timeout);
      reject(new DOMException("Aborted", "AbortError"));
    };

    signal.addEventListener("abort", handleAbort, { once: true });
  });
}

export const ChatControl = React.memo(function ChatControl({
  show,
  onHide,
  robotName,
  systemPrompt: configSystemPrompt,
  getJointStates,
  moveJointsSmoothly,
}: ChatControlProps) {
  const [ref, bounds] = useMeasure();
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<{ sender: string; text: string }[]>(
    [],
  );
  const [showSettings, setShowSettings] = useState(false);
  const [position, setPosition] = useState(
    () => getPanelPosition("chatControl", "global") ?? { x: 0, y: 0 },
  );
  const [hasInitPos, setHasInitPos] = useState(
    () => getPanelPosition("chatControl", "global") !== null,
  );
  const [isMounted, setIsMounted] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const { solveIKWithMetricsAsync } = useIKWorker();
  const ikJointOrder = useRobotProfileStore(
    (state: RobotProfileState) => state.ikJointOrder,
  );

  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const appendMessage = (sender: string, text: string) => {
    setMessages((prev) => {
      const next = [...prev, { sender, text }];
      return next.length > MAX_CHAT_MESSAGES
        ? next.slice(next.length - MAX_CHAT_MESSAGES)
        : next;
    });
  };

  const [apiKey, setApiKey] = useState("");
  const [baseURL, setBaseURL] = useState("");
  const [model, setModel] = useState("gemini-3-flash-preview");
  const [systemPrompt, setSystemPrompt] = useState(
    configSystemPrompt ||
      `You are controlling a physical robotic arm. You have two tools:
1. 'keyPress': Use this for manual joint rotation (e.g. rotating base, pitching arm).
2. 'moveToXYZ': Use this Mathematical Inverse Kinematics (IK) solver when you need the end-effector to go exactly to a physical Cartesian coordinate (in meters). Note: the max physical reach of the robot is ~0.48m. Do not command coordinates outside of a 0.50m radius.
Whenever the user asks to move to a specific position or coordinate, prioritize using the 'moveToXYZ' tool to mathematically solve the angles instead of guessing keypress durations.`,
  );

  useEffect(() => {
    setIsMounted(true);
    setApiKey(getApiKeyFromLocalStorage());
    setBaseURL(getBaseURLFromLocalStorage() || "");
    setModel(getModelFromLocalStorage() || "gemini-3-flash-preview");
    setSystemPrompt(
      getSystemPromptFromLocalStorage(robotName) ||
        configSystemPrompt ||
        `You are controlling a physical robotic arm. You have two tools:
1. 'keyPress': Use this for manual joint rotation (e.g. rotating base, pitching arm).
2. 'moveToXYZ': Use this Mathematical Inverse Kinematics (IK) solver when you need the end-effector to go exactly to a physical Cartesian coordinate (in meters). Note: the max physical reach of the robot is ~0.48m. Do not command coordinates outside of a 0.50m radius.
Whenever the user asks to move to a specific position or coordinate, prioritize using the 'moveToXYZ' tool to mathematically solve the angles instead of guessing keypress durations.`,
    );
  }, [robotName, configSystemPrompt, showSettings]); // Refresh when settings modal closes
  useCloseOnEscape(show && isMounted, onHide);

  // Get provider dynamically based on current state
  const getProviderModel = () => {
    if (model.includes("gpt") || model.includes("mistral")) {
      const openai = createOpenAI({
        apiKey,
        baseURL: baseURL || undefined,
        compatibility: "strict",
        fetch: window.fetch,
      });
      return openai(model);
    } else {
      const google = createGoogleGenerativeAI({
        apiKey,
        baseURL:
          baseURL === "https://api.openai.com/v1/"
            ? undefined
            : baseURL || undefined,
        fetch: window.fetch,
      });
      return google(model);
    }
  };

  useEffect(() => {
    if (bounds.width > 0 && bounds.height > 0 && !hasInitPos) {
      const nextPos = setPanelPosition(
        "chatControl",
        {
          x: window.innerWidth - bounds.width - 20,
          y: 70,
        },
        "global",
      );
      setPosition(nextPos);
      setHasInitPos(true);
    }
  }, [bounds.height, bounds.width, hasInitPos]);

  useEffect(() => {
    const handleResize = () => {
      const clampedPos = getPanelPosition("chatControl", "global");
      if (clampedPos) {
        setPosition(clampedPos);
      }
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
    };
  }, []);

  const handleCommand = async (command: string) => {
    if (isLoading) return;
    setIsLoading(true);
    abortControllerRef.current = new AbortController();

    appendMessage("User", command);
    try {
      const providerModel = getProviderModel();

      let dynamicPrompt = systemPrompt;

      // Inject live sensor data so the AI knows the robot's current state
      const currentJointStates = getJointStates();
      const revoluteJoints = currentJointStates.filter(
        (j) => j.jointType === "revolute",
      );
      const jointInfo = revoluteJoints
        .map(
          (j) =>
            `${j.name}: ${typeof j.degrees === "number" ? j.degrees.toFixed(1) : "?"}°`,
        )
        .join(", ");

      dynamicPrompt += `\n\n[LIVE ROBOT STATE]`;
      dynamicPrompt += `\nJoint Angles: ${jointInfo}`;
      const currentEndEffectorPosition =
        useRobotStateStore.getState().endEffectorPosition;
      if (currentEndEffectorPosition) {
        dynamicPrompt += `\nEnd-Effector Position (meters): X=${currentEndEffectorPosition[0]}, Y=${currentEndEffectorPosition[1]}, Z=${currentEndEffectorPosition[2]}`;
      }

      // Manual multi-step loop: call generateText once per step,
      // feeding tool results back as context to avoid Gemini thought_signature errors
      const allToolResults: string[] = [];
      let currentPrompt = command;
      const MAX_STEPS = 8;

      for (let step = 0; step < MAX_STEPS; step++) {
        if (abortControllerRef.current?.signal.aborted) break;

        const result = await generateText({
          // @ts-expect-error - Bypass V1 vs V2/V3 interface mismatch between AI SDK packages
          model: providerModel,
          prompt: currentPrompt,
          system: dynamicPrompt,
          maxSteps: 8,
          abortSignal: abortControllerRef.current.signal,
          tools: {
            keyPress: tool({
              description:
                "Press and hold a keyboard key for a specified duration (in milliseconds) to control the robot",
              parameters: z.object({
                key: z
                  .string()
                  .describe(
                    "The key to press (e.g., 'w', 'a', 's', 'd', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight')",
                  ),
                duration: z
                  .number()
                  .int()
                  .min(100)
                  .max(5000)
                  .default(1000)
                  .describe(
                    "How long to hold the key in milliseconds (default: 1000, min: 100, max: 5000)",
                  ),
              }),
              // @ts-expect-error - AI SDK version mismatch on execute type definition
              execute: async ({
                key,
                duration,
              }: {
                key: string;
                duration?: number;
              }) => {
                const holdTime = duration ?? 1000;
                const normalizedKey = key.toLowerCase();
                const signal = abortControllerRef.current?.signal;
                const keydownEvent = new KeyboardEvent("keydown", {
                  key: normalizedKey,
                  bubbles: true,
                });
                window.dispatchEvent(keydownEvent);

                let interrupted = false;
                try {
                  if (signal) {
                    await sleepWithAbort(holdTime, signal);
                  } else {
                    await new Promise((resolve) =>
                      setTimeout(resolve, holdTime),
                    );
                  }
                } catch (error) {
                  if (
                    error instanceof DOMException &&
                    error.name === "AbortError"
                  ) {
                    interrupted = true;
                  } else {
                    throw error;
                  }
                } finally {
                  const keyupEvent = new KeyboardEvent("keyup", {
                    key: normalizedKey,
                    bubbles: true,
                  });
                  window.dispatchEvent(keyupEvent);
                }

                if (interrupted) {
                  return `Interrupted key "${normalizedKey.toUpperCase()}" before completion.`;
                }
                return `Held key "${normalizedKey.toUpperCase()}" for ${holdTime} ms`;
              },
            }),
            moveToXYZ: tool({
              description: `Move the robot's end-effector to a specific position in the 3D scene. Coordinates are in scene units (the grid labels). Y is up, ground is at Y=0. WARNING: The arm can only reach about ${MAX_REACH_SCENE.toFixed(1)} scene units from origin. The tool reports whether the IK solution converged.`,
              parameters: z.object({
                x: z
                  .number()
                  .describe("The target X coordinate in scene units"),
                y: z
                  .number()
                  .describe(
                    "The target Y coordinate in scene units (must be >= 0, ground is at Y=0)",
                  ),
                z: z
                  .number()
                  .describe("The target Z coordinate in scene units"),
              }),
              // @ts-expect-error - AI SDK version mismatch on execute type definition
              execute: async ({
                x,
                y,
                z,
              }: {
                x: number;
                y: number;
                z: number;
              }) => {
                // Clamp Y to ground plane - never go below 0
                const clampedY = Math.max(0.05, y);

                // Convert scene coordinates to IK/URDF space
                const [ikX, ikY, ikZ] = sceneToIK(x, clampedY, z);

                // Check if target is within arm's physical reach
                const distFromOrigin = Math.sqrt(
                  ikX * ikX + ikY * ikY + ikZ * ikZ,
                );
                if (distFromOrigin > MAX_REACH_M) {
                  return `WARNING: Target at scene (${x}, ${clampedY}, ${z}) is ${(distFromOrigin * 100).toFixed(1)}cm from base, which exceeds the arm's ${(MAX_REACH_M * 100).toFixed(0)}cm reach. Move the box closer or choose a nearer target.`;
                }

                // Current degrees, filtering for revolute joints and mapping to array
                const currentJointStates = getJointStates();
                const revoluteJoints = getOrderedRevoluteJoints(
                  currentJointStates,
                  ikJointOrder,
                );
                const currentDegrees = revoluteJoints.map((j) =>
                  typeof j.degrees === "number" ? j.degrees : 0,
                );

                // Use metrics-enabled solver for convergence feedback
                const result = await solveIKWithMetricsAsync(
                  [ikX, ikY, ikZ],
                  currentDegrees,
                );

                const updates = result.angles.map((angle, i) => {
                  return {
                    servoId: revoluteJoints[i].servoId!,
                    value: Math.round(angle),
                  };
                });

                // Move the 3D model smoothly over 1500ms
                await moveJointsSmoothly(updates, 1500);

                const errorMM = (result.metrics.finalErrorM * 1000).toFixed(1);
                const status = result.metrics.converged
                  ? "CONVERGED"
                  : `NOT CONVERGED (${errorMM}mm error)`;
                return `Moved to scene (${x.toFixed(1)}, ${clampedY.toFixed(1)}, ${z.toFixed(1)}). IK ${status} in ${result.metrics.iterationsUsed} iterations.`;
              },
            }),
          },
        });

        // Collect tool results from this step
        const stepToolResults: string[] = [];

        console.log("AI SDK Result object:", result);

        // AI SDK v3/v4 usually exposes `toolCalls` and `toolResults`
        // Wait, did `generateText` auto-execute tools? Yes, if tools are provided and it decides to call them.
        // Let's check `result.toolCalls` array
        if (result.toolCalls && Array.isArray(result.toolCalls)) {
          console.log("Found toolCalls:", result.toolCalls);
          for (const tc of result.toolCalls) {
            stepToolResults.push(`Called tool: ${tc.toolName}`);
          }
        }

        if (result.toolResults && Array.isArray(result.toolResults)) {
          console.log("Found toolResults:", result.toolResults);
          for (const tr of result.toolResults) {
            // In AI SDK v4, the returned value from `execute` is placed in `tr.output`
            // Wait, does it still exist? In the log snippet `tr: Object { type: "tool-result", toolCallId: "...", toolName: "...", ... }`. Yes, the output should be there.
            const output =
              (tr as { output?: unknown }).output ??
              (tr as { result?: unknown }).result;
            if (typeof output === "string") {
              stepToolResults.push(output);
            } else if (output !== undefined && output !== null) {
              stepToolResults.push(JSON.stringify(output));
            } else {
              stepToolResults.push(
                `Tool ${tr.toolName} completed with no string result.`,
              );
            }
          }
        } else {
          // Fallback for older formats or deeply nested structures
          for (const msg of result.response?.messages ?? []) {
            if (Array.isArray(msg.content)) {
              for (const part of msg.content) {
                const toolResult = part as { result?: unknown };
                if (typeof toolResult.result === "string") {
                  stepToolResults.push(toolResult.result);
                }
              }
            }
          }
        }

        allToolResults.push(...stepToolResults);

        // If the model produced final text (no more tools to call), we're done
        if (result.text.trim()) {
          allToolResults.push(result.text.trim());
          break;
        }

        // If no tools were called and no text, we're done
        if (stepToolResults.length === 0) break;

        // Feed tool results back as the next prompt so the model continues the plan
        currentPrompt = `Previous actions completed:\n${allToolResults.join("\n")}\n\nContinue executing the remaining steps of the original plan. Original request: "${command}"`;
      }

      const displayText = allToolResults.join("\n") || "No actions taken.";
      appendMessage("AI", displayText);
    } catch (error: unknown) {
      console.error("Error generating text:", error);
      const typedError = error as {
        message?: string;
        responseBody?: unknown;
        cause?: unknown;
      };
      let errMsg = typedError.message || "Unable to process your request.";
      // If it's an APICallError, it often has responseBody or statusCode
      if (typedError.responseBody) {
        try {
          errMsg += ` - ${JSON.stringify(typedError.responseBody)}`;
        } catch {}
      } else if (typedError.cause) {
        errMsg += ` - Cause: ${String(typedError.cause)}`;
      }

      appendMessage("AI", `Error: ${errMsg}`);
    } finally {
      setIsLoading(false);
      abortControllerRef.current = null;
    }
  };

  const handleStop = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
  };

  const handleSend = () => {
    if (input.trim()) {
      if (!apiKey) {
        setShowSettings(true);
        return;
      }
      handleCommand(input.trim());
      setInput(""); // Clear input after sending
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      handleSend();
    }
  };

  if (!show || !isMounted) return null;

  return (
    <Rnd
      default={{
        ...getDefaultPanelPosition("chatControl"),
        width:
          getPanelSize("chatControl", "global")?.width ??
          DEFAULT_PANEL_SIZES.chatControl.width,
        height:
          getPanelSize("chatControl", "global")?.height ??
          DEFAULT_PANEL_SIZES.chatControl.height,
      }}
      position={position}
      minWidth={280}
      minHeight={220}
      onDragStop={(_e, d) => {
        const nextPos = setPanelPosition(
          "chatControl",
          { x: d.x, y: d.y },
          "global",
        );
        setPosition(nextPos);
      }}
      enableResizing={true}
      onResizeStop={(_e, _dir, ref) => {
        setPanelSize(
          "chatControl",
          { width: ref.offsetWidth, height: ref.offsetHeight },
          "global",
        );
        const clampedPos = getPanelPosition("chatControl", "global");
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
        className={"p-4 w-full h-full flex flex-col z-50 " + panelStyle}
      >
        <h4 className={panelHeaderClass}>
          <span className="flex items-center gap-2">
            <GripDots />
            💬 AI Control Robot
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setShowSettings(true)}
              onTouchEnd={() => setShowSettings(true)}
              className={panelButtonClass}
            >
              Settings
            </button>
            <button
              type="button"
              onClick={onHide}
              onTouchEnd={onHide}
              className={panelCloseButtonClass}
              aria-label="Close chat panel"
              title="Collapse"
            >
              x
            </button>
          </div>
        </h4>
        <div className="mb-2 flex-1 overflow-y-auto">
          {messages.map((msg, idx) => (
            <div
              key={idx}
              className={`mb-2 ${
                msg.sender === "AI" ? "text-green-400" : "text-blue-400"
              }`}
            >
              <strong>{msg.sender}:</strong> {msg.text}
            </div>
          ))}
          {isLoading && (
            <div className="mb-2 text-zinc-400 flex items-center gap-2">
              <div className="animate-spin rounded-full h-4 w-4 border-2 border-zinc-400 border-t-transparent"></div>
              <span>AI is thinking...</span>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
        {messages.length > 0 && (
          <div className="mb-2 flex justify-end">
            <button
              type="button"
              onClick={() => setMessages([])}
              className={panelButtonClass}
            >
              Clear
            </button>
          </div>
        )}
        <div className="flex items-center space-x-2">
          <div className="relative flex items-center w-full gap-2">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyPress={handleKeyPress}
              onKeyDown={(e) => e.stopPropagation()}
              onKeyUp={(e) => e.stopPropagation()}
              placeholder={isLoading ? "Please wait..." : "Type a command..."}
              disabled={isLoading}
              className={`flex-1 disabled:opacity-50 ${panelInputClass}`}
            />
            {isLoading ? (
              <button
                type="button"
                onClick={handleStop}
                className={panelDangerButtonClass}
                title="Stop Generation"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={2}
                  stroke="currentColor"
                  className="w-5 h-5"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M5.25 7.5A2.25 2.25 0 017.5 5.25h9a2.25 2.25 0 012.25 2.25v9a2.25 2.25 0 01-2.25 2.25h-9a2.25 2.25 0 01-2.25-2.25v-9z"
                  />
                </svg>
              </button>
            ) : (
              <button
                type="button"
                onClick={handleSend}
                disabled={!input.trim()}
                className={panelPrimaryButtonClass}
                title="Send Message"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={2}
                  stroke="currentColor"
                  className="w-5 h-5"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5"
                  />
                </svg>
              </button>
            )}
          </div>
        </div>
      </div>
      <SettingsModal
        show={showSettings}
        onClose={() => setShowSettings(false)}
        robotName={robotName}
        systemPrompt={configSystemPrompt}
      />
    </Rnd>
  );
});
