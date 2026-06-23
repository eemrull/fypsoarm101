"use client";
import React, { useState, useEffect, useRef } from "react"; // Added useRef
import {
  JointState,
  UpdateJointDegrees,
  UpdateJointsDegrees,
} from "../../../hooks/useRobotControl";
import { radiansToDegrees } from "../../../lib/utils";
import { compileSafeExpression } from "@/lib/safeExpression";
import { RobotConfig } from "@/config/robotConfig";

type RevoluteJointsTableProps = {
  joints: JointState[];
  updateJointDegrees: UpdateJointDegrees;
  updateJointsDegrees: UpdateJointsDegrees;
  keyboardControlMap: RobotConfig["keyboardControlMap"];
  compoundMovements?: RobotConfig["compoundMovements"]; // Use type from robotConfig
};

// Define constants for interval and step size
const KEY_UPDATE_INTERVAL_MS = 16;
const KEY_UPDATE_STEP_DEGREES = 0.8;

const formatDegrees = (degrees?: number | "N/A" | "error") => {
  if (degrees === "error") {
    return <span className="text-red-500">Error</span>;
  }
  if (typeof degrees === "number") {
    return `${degrees.toFixed(1)} deg`;
  }
  return "/";
};

// compoundMovements çº¦å®šï¼škeys[0] æ˜¯æ­£å‘è¿åŠ¨ï¼Œkeys[1] æ˜¯åå‘è¿åŠ¨
// ä¾‹å¦‚ keys: ["8", "i"]ï¼Œ"8" æŽ§åˆ¶æ­£å‘ï¼Œ"i" æŽ§åˆ¶åå‘

export function RevoluteJointsTable({
  joints,
  updateJointDegrees,
  updateJointsDegrees,
  keyboardControlMap,
  compoundMovements,
}: RevoluteJointsTableProps) {
  const [pressedKeys, setPressedKeys] = useState<Set<string>>(new Set());
  // Refs to hold the latest values needed inside the interval callback
  const jointsRef = useRef(joints);
  const updateJointsDegreesRef = useRef(updateJointsDegrees);
  const keyboardControlMapRef = useRef(keyboardControlMap);
  const formulaCacheRef = useRef<
    Map<string, ((variables: Record<string, number>) => number) | null>
  >(new Map());

  // Update refs whenever the props change
  useEffect(() => {
    jointsRef.current = joints;
  }, [joints]);

  useEffect(() => {
    updateJointsDegreesRef.current = updateJointsDegrees;
  }, [updateJointsDegrees]);

  useEffect(() => {
    keyboardControlMapRef.current = keyboardControlMap;
  }, [keyboardControlMap]);

  const evaluateFormula = (
    formula: string | undefined,
    variables: Record<string, number>,
    fallback: number,
  ): number => {
    if (!formula) return fallback;

    const cache = formulaCacheRef.current;
    let evaluator = cache.get(formula);
    if (evaluator === undefined) {
      evaluator = compileSafeExpression(formula);
      cache.set(formula, evaluator);
    }
    if (!evaluator) return fallback;

    const value = evaluator(variables);
    return Number.isFinite(value) ? value : fallback;
  };

  // Effect for keyboard listeners
  useEffect(() => {
    const clearPressedKeys = () => {
      setPressedKeys((prevKeys) => {
        if (prevKeys.size === 0) return prevKeys;
        return new Set();
      });
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      // Skip keyboard controls if user is typing in an input field
      const tag = (event.target as HTMLElement)?.tagName?.toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select") return;

      // Check if the pressed key is actually used for control to potentially prevent default
      // Note: Using the ref here ensures we check against the *latest* map
      const isControlKey = Object.values(keyboardControlMapRef.current || {})
        .flat()
        .includes(event.key);
      if (isControlKey) {
        // event.preventDefault(); // Optional: uncomment if keys like arrows scroll the page
      }
      setPressedKeys((prevKeys) => new Set(prevKeys).add(event.key));
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      setPressedKeys((prevKeys) => {
        const newKeys = new Set(prevKeys);
        newKeys.delete(event.key);
        return newKeys;
      });
    };

    const handleVisibilityChange = () => {
      if (document.hidden) {
        clearPressedKeys();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    window.addEventListener("blur", clearPressedKeys);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    // Cleanup function to remove event listeners
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      window.removeEventListener("blur", clearPressedKeys);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []); // Empty dependency array: sets up listeners once

  // Effect for handling continuous updates when keys are pressed
  useEffect(() => {
    let intervalId: NodeJS.Timeout | null = null;

    const updateJointsBasedOnKeys = () => {
      const currentJoints = jointsRef.current;
      const currentControlMap = keyboardControlMapRef.current || {};
      const currentPressedKeys = pressedKeys;
      const currentCompoundMovements = compoundMovements || [];

      // æ™®é€šå•å…³èŠ‚æŽ§åˆ¶
      let updates = currentJoints
        .map((joint) => {
          const decreaseKey = currentControlMap[joint.servoId!]?.[1];
          const increaseKey = currentControlMap[joint.servoId!]?.[0];
          const currentDegrees =
            typeof joint.degrees === "number" ? joint.degrees : 0;
          let newValue = currentDegrees;

          if (decreaseKey && currentPressedKeys.has(decreaseKey)) {
            newValue -= KEY_UPDATE_STEP_DEGREES;
          }
          if (increaseKey && currentPressedKeys.has(increaseKey)) {
            newValue += KEY_UPDATE_STEP_DEGREES;
          }

          const lowerLimit = Math.round(
            radiansToDegrees(joint.limit?.lower ?? -Infinity),
          );
          const upperLimit = Math.round(
            radiansToDegrees(joint.limit?.upper ?? Infinity),
          );
          newValue = Math.max(lowerLimit, Math.min(upperLimit, newValue));

          if (newValue !== currentDegrees) {
            return { servoId: joint.servoId!, value: newValue };
          }
          return null;
        })
        .filter((update) => update !== null) as {
        servoId: number;
        value: number;
      }[];

      // å¤„ç† compoundMovementsï¼Œè¦†ç›–æ™®é€šå•å…³èŠ‚æŽ§åˆ¶
      currentCompoundMovements.forEach((cm) => {
        // åˆ¤æ–­æ˜¯å¦æœ‰ key è¢«æŒ‰ä¸‹
        // keys[0] ä¸ºæ­£å‘ï¼Œkeys[1] ä¸ºåå‘
        const pressedIdx = cm.keys.findIndex((k) => currentPressedKeys.has(k));
        if (pressedIdx === -1) return;

        // primaryJoint å½“å‰è§’åº¦
        const primaryJoint = currentJoints.find(
          (j) => j.servoId === cm.primaryJoint,
        );
        if (!primaryJoint) return;
        const primary =
          typeof primaryJoint.degrees === "number" ? primaryJoint.degrees : 0;

        // å–ç¬¬ä¸€ä¸ª dependent joint ä½œä¸º dependent
        const dependentJointId = cm.dependents[0]?.joint;
        const dependentJoint = currentJoints.find(
          (j) => j.servoId === dependentJointId,
        );
        const dependent =
          typeof dependentJoint?.degrees === "number"
            ? dependentJoint.degrees
            : 0;

        // æ­¥è¿›å¤§å°æ€»æ˜¯ KEY_UPDATE_STEP_DEGREES
        // sign å†³å®šæ–¹å‘ï¼Œæ­£å‘ä¸º +1ï¼Œåå‘ä¸º -1
        let sign = 1;
        if (cm.primaryFormula) {
          const primaryFormulaResult = evaluateFormula(
            cm.primaryFormula,
            {
              primary,
              dependent,
              delta: KEY_UPDATE_STEP_DEGREES,
            },
            pressedIdx === 0 ? 1 : -1,
          );
          sign = Math.sign(primaryFormulaResult) || 1;
        } else {
          sign = pressedIdx === 0 ? 1 : -1;
        }
        // æŒ‰é”®é¡ºåºå†³å®š deltaPrimary æ­£è´Ÿ
        const deltaPrimary =
          KEY_UPDATE_STEP_DEGREES * sign * (pressedIdx === 0 ? 1 : -1);

        // primaryJoint æ–°å€¼
        let newPrimaryValue = primary + deltaPrimary;
        const lowerLimit = Math.round(
          radiansToDegrees(primaryJoint.limit?.lower ?? -Infinity),
        );
        const upperLimit = Math.round(
          radiansToDegrees(primaryJoint.limit?.upper ?? Infinity),
        );
        newPrimaryValue = Math.max(
          lowerLimit,
          Math.min(upperLimit, newPrimaryValue),
        );

        // ç”¨ Map æ–¹ä¾¿è¦†ç›–
        const updatesMap = new Map<number, number>();
        updates.forEach((u) => updatesMap.set(u.servoId, u.value));
        updatesMap.set(primaryJoint.servoId!, newPrimaryValue);

        // dependents
        cm.dependents.forEach((dep) => {
          const dependentJoint = currentJoints.find(
            (j) => j.servoId === dep.joint,
          );
          if (!dependentJoint) return;
          const dependent =
            typeof dependentJoint.degrees === "number"
              ? dependentJoint.degrees
              : 0;
          let deltaDependent = evaluateFormula(
            dep.formula,
            {
              primary,
              dependent,
              deltaPrimary,
            },
            0,
          );
          // If deltaDependent is not a valid number, set it to 0
          if (!Number.isFinite(deltaDependent)) {
            deltaDependent = 0;
          }
          let newDependentValue = dependent + deltaDependent;
          const depLowerLimit = Math.round(
            radiansToDegrees(dependentJoint.limit?.lower ?? -Infinity),
          );
          const depUpperLimit = Math.round(
            radiansToDegrees(dependentJoint.limit?.upper ?? Infinity),
          );
          newDependentValue = Math.max(
            depLowerLimit,
            Math.min(depUpperLimit, newDependentValue),
          );
          updatesMap.set(dependentJoint.servoId!, newDependentValue);
        });

        // compoundMovements çš„ joint æ›´æ–°è¦†ç›–æ™®é€šå•å…³èŠ‚æŽ§åˆ¶
        updates = Array.from(updatesMap.entries()).map(([servoId, value]) => ({
          servoId,
          value,
        }));
      });

      if (updates.length > 0) {
        updateJointsDegreesRef.current(updates);
      }
    };

    if (pressedKeys.size > 0) {
      intervalId = setInterval(updateJointsBasedOnKeys, KEY_UPDATE_INTERVAL_MS);
    }

    return () => {
      if (intervalId) {
        clearInterval(intervalId);
      }
    };
  }, [compoundMovements, pressedKeys]); // Re-run when key set or compound map changes

  // Mouse handlers update the `pressedKeys` state, which triggers the interval effect
  const handleMouseDown = (key: string | undefined) => {
    if (key) {
      setPressedKeys((prevKeys) => new Set(prevKeys).add(key));
    }
  };

  const handleMouseUp = (key: string | undefined) => {
    if (key) {
      setPressedKeys((prevKeys) => {
        const newKeys = new Set(prevKeys);
        newKeys.delete(key);
        return newKeys;
      });
    }
  };

  // Component rendering uses the `joints` prop for display
  return (
    <div className="mt-2">
      <table className="table-auto w-full text-left text-xs sm:text-sm">
        <thead>
          {/* ... existing table head ... */}
          <tr>
            <th className="border-b border-zinc-600 pb-1 pr-2">Joint</th>
            <th className="border-b border-zinc-600 pb-1 text-center px-1">
              Angle
            </th>
            <th className="border-b border-zinc-600 pb-1 text-center px-2">
              Control
            </th>
          </tr>
        </thead>
        <tbody>
          {joints.map((detail) => {
            // Use `joints` prop for rendering current state
            const decreaseKey = (keyboardControlMap || {})[
              detail.servoId!
            ]?.[1];
            const increaseKey = (keyboardControlMap || {})[
              detail.servoId!
            ]?.[0];
            const isDecreaseActive =
              decreaseKey && pressedKeys.has(decreaseKey);
            const isIncreaseActive =
              increaseKey && pressedKeys.has(increaseKey);

            return (
              <tr key={`${detail.servoId ?? "u"}-${detail.name}`}>
                <td className="py-1 pr-1 leading-tight">
                  {/* <span className="text-zinc-600">{detail.servoId}</span>{" "} */}
                  {detail.name}
                </td>

                <td className="py-1 pr-1 text-center w-20 whitespace-nowrap leading-tight">
                  {formatDegrees(detail.degrees)}
                </td>
                <td className="py-1 px-2 flex items-center">
                  <button
                    type="button"
                    onMouseDown={() => handleMouseDown(decreaseKey)}
                    onMouseUp={() => handleMouseUp(decreaseKey)}
                    onMouseLeave={() => handleMouseUp(decreaseKey)} // Optional: stop if mouse leaves button while pressed
                    onTouchStart={() => handleMouseDown(decreaseKey)} // Optional: basic touch support
                    onTouchEnd={() => handleMouseUp(decreaseKey)} // Optional: basic touch support
                    className={`${
                      isDecreaseActive
                        ? "bg-blue-600"
                        : "bg-zinc-700 hover:bg-zinc-600"
                    } text-white text-xs font-bold w-5 h-5 text-right pr-1 uppercase select-none`} // Added select-none
                    style={{
                      clipPath:
                        "polygon(0 50%, 30% 0, 100% 0, 100% 100%, 30% 100%)",
                    }}
                  >
                    {decreaseKey || "-"}
                  </button>
                  <input
                    type="range"
                    min={Math.round(
                      radiansToDegrees(detail.limit?.lower ?? -Math.PI) || -180,
                    )}
                    max={Math.round(
                      radiansToDegrees(detail.limit?.upper ?? Math.PI) || 180,
                    )}
                    step="0.1"
                    value={
                      typeof detail.degrees === "number" &&
                      !Number.isNaN(detail.degrees)
                        ? detail.degrees
                        : 0
                    }
                    // Note: onChange is only triggered by user sliding the range input,
                    // not when the `value` prop changes programmatically (e.g., via button clicks).
                    onChange={(e) => {
                      const valueInDegrees = parseFloat(e.target.value);
                      updateJointDegrees(detail.servoId!, valueInDegrees);
                    }}
                    className="h-2 bg-zinc-700 appearance-none cursor-pointer w-14 custom-range-thumb"
                  />
                  <button
                    type="button"
                    onMouseDown={() => handleMouseDown(increaseKey)}
                    onMouseUp={() => handleMouseUp(increaseKey)}
                    onMouseLeave={() => handleMouseUp(increaseKey)} // Optional
                    onTouchStart={() => handleMouseDown(increaseKey)} // Optional
                    onTouchEnd={() => handleMouseUp(increaseKey)} // Optional
                    className={`${
                      isIncreaseActive
                        ? "bg-blue-600"
                        : "bg-zinc-700 hover:bg-zinc-600"
                    } text-white text-xs font-semibold w-5 h-5 text-left pl-1 uppercase select-none`} // Added select-none
                    style={{
                      clipPath:
                        "polygon(100% 50%, 70% 0, 0 0, 0 100%, 70% 100%)",
                    }}
                  >
                    {increaseKey || "+"}
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {/* Display compoundMovements if present */}
      {compoundMovements && compoundMovements.length > 0 && (
        <div className="mt-3">
          <div className="font-bold mb-1.5">Compound Movements</div>
          <table className="table-auto w-full text-left text-xs sm:text-sm">
            <tbody>
              {compoundMovements.map((cm, idx) => {
                const decreaseKey = cm.keys[1];
                const increaseKey = cm.keys[0];
                const isDecreaseActive =
                  decreaseKey && pressedKeys.has(decreaseKey);
                const isIncreaseActive =
                  increaseKey && pressedKeys.has(increaseKey);
                return (
                  <tr key={idx}>
                    <td className="font-semibold pr-2 py-0.5 align-top">
                      {cm.name}
                    </td>
                    <td>
                      {cm.keys && cm.keys.length > 0 && (
                        <span className="space-x-1 flex flex-row">
                          {/* Decrease key */}
                          <button
                            type="button"
                            onMouseDown={() => handleMouseDown(decreaseKey)}
                            onMouseUp={() => handleMouseUp(decreaseKey)}
                            onMouseLeave={() => handleMouseUp(decreaseKey)}
                            onTouchStart={() => handleMouseDown(decreaseKey)}
                            onTouchEnd={() => handleMouseUp(decreaseKey)}
                            className={`${
                              isDecreaseActive
                                ? "bg-blue-600"
                                : "bg-zinc-700 hover:bg-zinc-600"
                            } text-white text-xs font-bold w-5 h-5 text-right pr-1 uppercase select-none`}
                            style={{
                              clipPath:
                                "polygon(0 50%, 30% 0, 100% 0, 100% 100%, 30% 100%)",
                              minWidth: "1.8em",
                              minHeight: "1.8em",
                              fontWeight: 600,
                              boxShadow: "0 1px 2px 0 rgba(0,0,0,0.04)",
                            }}
                            tabIndex={-1}
                          >
                            {decreaseKey || "-"}
                          </button>
                          {/* Increase key */}
                          <button
                            type="button"
                            onMouseDown={() => handleMouseDown(increaseKey)}
                            onMouseUp={() => handleMouseUp(increaseKey)}
                            onMouseLeave={() => handleMouseUp(increaseKey)}
                            onTouchStart={() => handleMouseDown(increaseKey)}
                            onTouchEnd={() => handleMouseUp(increaseKey)}
                            className={`${
                              isIncreaseActive
                                ? "bg-blue-600"
                                : "bg-zinc-700 hover:bg-zinc-600"
                            } text-white text-xs font-semibold w-5 h-5 text-left pl-1 uppercase select-none`}
                            style={{
                              clipPath:
                                "polygon(100% 50%, 70% 0, 0 0, 0 100%, 70% 100%)",
                              minWidth: "1.8em",
                              minHeight: "1.8em",
                              fontWeight: 600,
                              boxShadow: "0 1px 2px 0 rgba(0,0,0,0.04)",
                            }}
                            tabIndex={-1}
                          >
                            {increaseKey || "+"}
                          </button>
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <style jsx global>{`
        .custom-range-thumb::-webkit-slider-thumb {
          -webkit-appearance: none;
          appearance: none;
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: #fff;
          cursor: pointer;
        }
        .custom-range-thumb::-moz-range-thumb {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: #fff;
          cursor: pointer;
        }
        .custom-range-thumb::-ms-thumb {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: #fff;
          cursor: pointer;
        }
        .custom-range-thumb {
          /* Remove default styles for Firefox */
          overflow: hidden;
        }
        input[type="range"].custom-range-thumb {
          /* Remove default focus outline for Chrome */
          outline: none;
        }
      `}</style>
    </div>
  );
}
