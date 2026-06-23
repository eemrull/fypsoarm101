"use client";

import React, { useState, useRef, useCallback, useEffect } from "react";
import * as THREE from "three";
import { Rnd } from "react-rnd";
import useMeasure from "react-use-measure";
import {
  FlaskConical,
  Download,
  Play,
  Square,
  Trash2,
  Wifi,
  Target,
  Repeat,
  Box,
} from "lucide-react";
import {
  panelStyle,
  panelHeaderClass,
  panelCloseButtonClass,
  panelIconButtonClass,
  panelButtonClass,
  panelPrimaryButtonClass,
} from "../panelStyle";
import { GripDots } from "../GripDots";
import { useCloseOnEscape } from "../usePanelA11y";
import {
  getPanelPosition,
  setPanelPosition,
  getDefaultPanelPosition,
} from "@/lib/panelSettings";
import { getRosbridgeClient } from "@/lib/rosbridge";
import {
  useMetricsStore,
  exportLatencyCSV,
  exportComparisonCSV,
  exportRepeatabilityCSV,
  exportOvershootCSV,
  exportPickPlaceCSV,
  type MetricsState,
  type PickPlaceIteration,
} from "@/store/useMetricsStore";
import {
  solveIK_Jacobian_WithMetrics,
  solveIK_CCD_WithMetrics,
  solveIKWithMetrics,
} from "@/lib/kinematics/IKSolver";
import { useRobotStateStore, type RobotState, type RobotJointState } from "@/store/useRobotStateStore";
import {
  useRobotProfileStore,
  type RobotProfileState,
} from "@/store/useRobotProfileStore";
import { useShallow } from "zustand/react/shallow";
import { getOrderedRevoluteJoints } from "@/lib/kinematics/runtimeConfig";
import { boxRigidBodyRef, robotAllLinksRef } from "../RobotScene";
import { sceneToIK } from "@/config/robotConstants";
import { type BoxConfig } from "../physicsControl/PhysicsControl";

// ─── Types ──────────────────────────────────────────────────────────────────────

type TestStatus = "idle" | "running" | "done" | "error";

interface TestRunnerPanelProps {
  show: boolean;
  onHide: () => void;
  isConnected: boolean;
  moveJointsSmoothly: (
    updates: { servoId: number; value: number }[],
    durationMs?: number,
  ) => Promise<void>;
  setBoxConfig?: (config: BoxConfig) => void;
  setBoxKey?: (updater: (prev: number) => number) => void;
}


function generateIKGridTargets(): [number, number, number][] {
  const targets: [number, number, number][] = [];
  // Near zone
  targets.push([0.08, 0.0, 0.15]);
  targets.push([0.06, 0.04, 0.12]);
  targets.push([0.05, -0.03, 0.18]);
  targets.push([0.09, 0.02, 0.10]);
  targets.push([0.07, -0.05, 0.14]);
  // Mid zone
  targets.push([0.15, 0.0, 0.15]);
  targets.push([0.12, 0.08, 0.12]);
  targets.push([0.18, -0.05, 0.10]);
  targets.push([0.10, 0.10, 0.20]);
  targets.push([0.20, 0.0, 0.08]);
  targets.push([0.14, -0.08, 0.15]);
  targets.push([0.16, 0.06, 0.18]);
  targets.push([0.13, -0.03, 0.22]);
  targets.push([0.18, 0.04, 0.14]);
  targets.push([0.11, 0.0, 0.25]);
  // Far zone
  targets.push([0.25, 0.0, 0.10]);
  targets.push([0.22, 0.05, 0.08]);
  targets.push([0.28, 0.0, 0.06]);
  targets.push([0.24, -0.04, 0.12]);
  targets.push([0.30, 0.0, 0.05]);
  // Edge cases — near singularities / extreme angles
  targets.push([0.35, 0.0, 0.03]); // far reach, low
  targets.push([0.05, 0.0, 0.30]); // near, high up
  targets.push([0.0, 0.15, 0.15]); // far left
  targets.push([0.0, -0.15, 0.15]); // far right
  targets.push([0.20, 0.0, 0.25]); // mid, elevated
  return targets;
}

// ─── Component ──────────────────────────────────────────────────────────────────

export const TestRunnerPanel = React.memo(function TestRunnerPanel({
  show,
  onHide,
  isConnected,
  moveJointsSmoothly,
  setBoxConfig,
  setBoxKey,
}: TestRunnerPanelProps) {
  const [ref, bounds] = useMeasure();
  const [position, setPositionState] = useState(
    () => getPanelPosition("testRunner", "global") ?? { x: 0, y: 0 },
  );
  const [hasInitPos, setHasInitPos] = useState(
    () => getPanelPosition("testRunner", "global") !== null,
  );

  useEffect(() => {
    if (bounds.width > 0 && bounds.height > 0 && !hasInitPos) {
      const nextPos = setPanelPosition(
        "testRunner",
        { x: Math.max(20, window.innerWidth / 2 - bounds.width / 2), y: 60 },
        "global",
      );
      setPositionState(nextPos);
      setHasInitPos(true);
    }
  }, [bounds.height, bounds.width, hasInitPos]);

  // ─── Store bindings ─────────────────────────────────────────────────────────
  const latencyLog = useMetricsStore((s: MetricsState) => s.latencyLog);
  const ikComparisonLog = useMetricsStore((s: MetricsState) => s.ikComparisonLog);
  const repeatabilityLog = useMetricsStore((s: MetricsState) => s.repeatabilityLog);
  const overshootLog = useMetricsStore((s: MetricsState) => s.overshootLog);
  const addLatencySample = useMetricsStore((s: MetricsState) => s.addLatencySample);
  const addIKComparison = useMetricsStore((s: MetricsState) => s.addIKComparison);
  const addRepeatabilityTrial = useMetricsStore(
    (s: MetricsState) => s.addRepeatabilityTrial,
  );
  const addOvershootSample = useMetricsStore(
    (s: MetricsState) => s.addOvershootSample,
  );
  const clearLatencyLog = useMetricsStore((s: MetricsState) => s.clearLatencyLog);
  const clearRepeatabilityLog = useMetricsStore(
    (s: MetricsState) => s.clearRepeatabilityLog,
  );
  const clearOvershootLog = useMetricsStore(
    (s: MetricsState) => s.clearOvershootLog,
  );
  const pickPlaceLog = useMetricsStore((s: MetricsState) => s.pickPlaceLog);
  const addPickPlaceIteration = useMetricsStore(
    (s: MetricsState) => s.addPickPlaceIteration,
  );
  const clearPickPlaceLog = useMetricsStore(
    (s: MetricsState) => s.clearPickPlaceLog,
  );

  const jointStates = useRobotStateStore((s: RobotState) => s.jointStates);
  const { ikJointOrder, ikNodes, activeTool } = useRobotProfileStore(
    useShallow((s: RobotProfileState) => ({
      ikJointOrder: s.ikJointOrder,
      ikNodes: s.ikNodes,
      activeTool: s.activeTool,
    })),
  );
  const tcpOffset = activeTool.tcpOffset ?? null;

  // ─── Test states ────────────────────────────────────────────────────────────
  const [latencyStatus, setLatencyStatus] = useState<TestStatus>("idle");
  const [latencyProgress, setLatencyProgress] = useState("");
  const latencyStopRef = useRef(false);

  const [ikStatus, setIkStatus] = useState<TestStatus>("idle");
  const [ikProgress, setIkProgress] = useState("");

  const [repeatStatus, setRepeatStatus] = useState<TestStatus>("idle");
  const [repeatProgress, setRepeatProgress] = useState("");
  const repeatStopRef = useRef(false);

  const [overshootStatus, setOvershootStatus] = useState<TestStatus>("idle");
  const [overshootProgress, setOvershootProgress] = useState("");
  const overshootStopRef = useRef(false);

  const [pickPlaceStatus, setPickPlaceStatus] = useState<TestStatus>("idle");
  const [pickPlaceProgress, setPickPlaceProgress] = useState("");
  const [autoResetBox, setAutoResetBox] = useState(false);
  const pickPlaceStopRef = useRef(false);
  const pickPlaceFileRef = useRef<HTMLInputElement>(null);

  const [isMounted, setIsMounted] = useState(false);
  useEffect(() => setIsMounted(true), []);
  useCloseOnEscape(show && isMounted, onHide);

  // ─── Latency Test ─────────────────────────────────────────────────────────
  const runLatencyTest = useCallback(
    (durationSec: number = 60) => {
      if (!isConnected) return;
      clearLatencyLog();
      setLatencyStatus("running");
      latencyStopRef.current = false;

      let sampleCount = 0;
      const client = getRosbridgeClient();
      client.startLatencyProbe((rttMs: number) => {
        sampleCount++;
        addLatencySample(rttMs);
        setLatencyProgress(`${sampleCount} samples`);
      }, 500);

      const timer = setTimeout(() => {
        client.stopLatencyProbe();
        setLatencyStatus("done");
        setLatencyProgress(`Done — ${sampleCount} samples`);
      }, durationSec * 1000);

      // Store cleanup ref
      latencyStopRef.current = false;
      const check = setInterval(() => {
        if (latencyStopRef.current) {
          clearTimeout(timer);
          clearInterval(check);
          client.stopLatencyProbe();
          setLatencyStatus("done");
          setLatencyProgress(`Stopped — ${sampleCount} samples`);
        }
      }, 200);
    },
    [addLatencySample, clearLatencyLog, isConnected],
  );

  const stopLatencyTest = useCallback(() => {
    latencyStopRef.current = true;
  }, []);

  // ─── IK Grid Test ─────────────────────────────────────────────────────────
  const runIKGridTest = useCallback(() => {
    setIkStatus("running");
    const targets = generateIKGridTargets();
    const revoluteJoints = getOrderedRevoluteJoints(
      jointStates as RobotJointState[],
      ikJointOrder,
    );
    const currentDeg = revoluteJoints.map((j) =>
      typeof j.degrees === "number" ? j.degrees : 180,
    );

    let processed = 0;
    const total = targets.length;

    // Process targets with a small async delay so UI stays responsive
    const processNext = () => {
      if (processed >= total) {
        setIkStatus("done");
        setIkProgress(`Done — ${total} points × 3 solvers`);
        return;
      }

      const target = targets[processed];
      try {
        const jacResult = solveIK_Jacobian_WithMetrics(target, currentDeg, 80, 0.005, {
          ikNodes,
          tcpOffset,
        });
        const ccdResult = solveIK_CCD_WithMetrics(target, currentDeg, 80, 0.005, {
          ikNodes,
          tcpOffset,
        });
        // Also run hybrid for comparison
        const hybridResult = solveIKWithMetrics(target, currentDeg, "hybrid", {
          ikNodes,
          tcpOffset,
        });

        addIKComparison({
          timestamp: Date.now(),
          targetXYZ: target,
          jacobianMetrics: jacResult.metrics,
          ccdMetrics: ccdResult.metrics,
        });

        // Store hybrid in a separate comparison entry so CSV captures it
        addIKComparison({
          timestamp: Date.now(),
          targetXYZ: target,
          jacobianMetrics: hybridResult.metrics, // hybrid stored in "jacobian" column
          ccdMetrics: ccdResult.metrics,
        });
      } catch {
        // Skip unreachable points
      }

      processed++;
      setIkProgress(`${processed}/${total} points`);
      setTimeout(processNext, 10);
    };

    processNext();
  }, [addIKComparison, ikJointOrder, ikNodes, jointStates, tcpOffset]);

  // ─── Repeatability Test ───────────────────────────────────────────────────
  const runRepeatabilityTest = useCallback(
    async (numTrials: number = 10) => {
      if (!isConnected) return;
      clearRepeatabilityLog();
      setRepeatStatus("running");
      repeatStopRef.current = false;

      const revoluteJoints = getOrderedRevoluteJoints(
        jointStates as RobotJointState[],
        ikJointOrder,
      );
      const jointNames = revoluteJoints.map((j) => j.name);

      // Target pose: current arm position (what the arm is at right now)
      const targetDeg = revoluteJoints.map((j) =>
        typeof j.degrees === "number" ? j.degrees : 180,
      );

      // Home pose (everything at 180°)
      const homeDeg = revoluteJoints.map(() => 180);
      const homeUpdates = revoluteJoints.map((j, i) => ({
        servoId: j.servoId!,
        value: homeDeg[i],
      }));
      const targetUpdates = revoluteJoints.map((j, i) => ({
        servoId: j.servoId!,
        value: targetDeg[i],
      }));

      const waitForSettle = async () => {
        let settleCount = 0;
        let prevDeg: number[] = [];
        while (settleCount < 3) {
          if (repeatStopRef.current) break;
          await new Promise(r => setTimeout(r, 100));
          const live = useRobotStateStore.getState();
          const fb = live.feedbackStates.length > 0 ? live.feedbackStates : live.jointStates;
          const currentDeg = jointNames.map(name => {
            const s = fb.find(state => state.name === name);
            return s && typeof s.degrees === "number" ? s.degrees : 0;
          });
          if (prevDeg.length > 0) {
            const maxDelta = Math.max(...currentDeg.map((d, i) => Math.abs(d - prevDeg[i])));
            settleCount = maxDelta < 0.1 ? settleCount + 1 : 0;
          }
          prevDeg = currentDeg;
        }
      };

      for (let trial = 0; trial < numTrials; trial++) {
        if (repeatStopRef.current) break;

        setRepeatProgress(`Trial ${trial + 1}/${numTrials} — going home`);
        // Go to home
        await moveJointsSmoothly(homeUpdates, 1500);
        await waitForSettle();

        if (repeatStopRef.current) break;

        setRepeatProgress(`Trial ${trial + 1}/${numTrials} — going to target`);
        // Go to target
        await moveJointsSmoothly(targetUpdates, 1500);
        await waitForSettle();

        // Read feedback directly from the live Zustand store — not the
        // stale React closure — so we capture real wobble / weight deflection.
        const liveState = useRobotStateStore.getState();
        const fb =
          liveState.feedbackStates.length > 0
            ? liveState.feedbackStates
            : liveState.jointStates;
        const fbByName = new Map(fb.map((s) => [s.name, s]));
        const actualDeg = jointNames.map((name) => {
          const state = fbByName.get(name);
          return state && typeof state.degrees === "number" ? state.degrees : 0;
        });

        addRepeatabilityTrial({
          trialIndex: trial,
          timestamp: Date.now(),
          commandedDeg: [...targetDeg],
          actualDeg,
          jointNames,
        });
      }

      setRepeatStatus("done");
      setRepeatProgress(
        repeatStopRef.current
          ? `Stopped`
          : `Done — ${numTrials} trials`,
      );
    },
    [
      addRepeatabilityTrial,
      clearRepeatabilityLog,
      ikJointOrder,
      isConnected,
      jointStates,
      moveJointsSmoothly,
    ],
  );

  // ─── Overshoot / Step Response Test ───────────────────────────────────────
  const runOvershootTest = useCallback(
    async () => {
      if (!isConnected) return;
      clearOvershootLog();
      setOvershootStatus("running");
      overshootStopRef.current = false;

      const revoluteJoints = getOrderedRevoluteJoints(
        jointStates as RobotJointState[],
        ikJointOrder,
      );

      // Test each revolute joint: move from 180° to 90° (large 90° step)
      for (let ji = 0; ji < Math.min(revoluteJoints.length, 5); ji++) {
        if (overshootStopRef.current) break;

        const joint = revoluteJoints[ji];
        const startDeg = 180;
        const targetDeg = 90;

        setOvershootProgress(`Joint ${ji + 1}/${Math.min(revoluteJoints.length, 5)}: ${joint.name} — resetting`);

        // Move all joints to home first
        const homeUpdates = revoluteJoints.map((j) => ({
          servoId: j.servoId!,
          value: 180,
        }));
        await moveJointsSmoothly(homeUpdates, 1500);
        await new Promise((r) => setTimeout(r, 2000));

        if (overshootStopRef.current) break;

        setOvershootProgress(`Joint ${ji + 1}: ${joint.name} — step response`);

        // Send the step command (only this joint moves)
        const stepUpdates = [{ servoId: joint.servoId!, value: targetDeg }];
        const commandTime = Date.now();
        moveJointsSmoothly(stepUpdates, 100); // fast — we want to see overshoot

        // Sample feedback at ~20ms intervals for 3 seconds
        for (let sample = 0; sample < 150; sample++) {
          if (overshootStopRef.current) break;

          await new Promise((r) => setTimeout(r, 20));

          // Read live store — not stale closure — to capture real overshoot
          const liveState = useRobotStateStore.getState();
          const fb =
            liveState.feedbackStates.length > 0
              ? liveState.feedbackStates
              : liveState.jointStates;
          const fbByName = new Map(fb.map((s) => [s.name, s]));

          const state = fbByName.get(joint.name);
          const actualDeg =
            state && typeof state.degrees === "number" ? state.degrees : startDeg;

          addOvershootSample({
            timestamp: Date.now(),
            elapsedMs: Date.now() - commandTime,
            jointIndex: ji,
            jointName: joint.name,
            targetDeg,
            actualDeg,
          });
        }
      }

      setOvershootStatus("done");
      setOvershootProgress("Done");
    },
    [
      addOvershootSample,
      clearOvershootLog,
      ikJointOrder,
      isConnected,
      jointStates,
      moveJointsSmoothly,
    ],
  );

  // ─── Pick & Place Endurance Test ──────────────────────────────────────────
  const runPickPlaceTest = useCallback(
    async (waypointFileContent: string, maxIterations: number = 50) => {
      clearPickPlaceLog();
      setPickPlaceStatus("running");
      pickPlaceStopRef.current = false;

      // Parse waypoints from the uploaded file
      let waypointData: { angles: number[]; durationMs: number; label?: string }[];
      try {
        const parsed = JSON.parse(waypointFileContent);
        if (!parsed.waypoints || !Array.isArray(parsed.waypoints)) {
          setPickPlaceStatus("error");
          setPickPlaceProgress("Invalid waypoint file: missing waypoints array");
          return;
        }
        waypointData = parsed.waypoints;
      } catch {
        setPickPlaceStatus("error");
        setPickPlaceProgress("Failed to parse JSON");
        return;
      }

      const totalWaypoints = waypointData.length;
      if (totalWaypoints === 0) {
        setPickPlaceStatus("error");
        setPickPlaceProgress("No waypoints in file");
        return;
      }

      const testStartTime = Date.now();
      const GRIP_DISTANCE_THRESHOLD = 0.05; // 5cm in meters (URDF space)
      const DROP_Z_THRESHOLD = 0.01; // 1cm in meters (URDF Z is height)

      const getBoxPosition = (): [number, number, number] => {
        const body = boxRigidBodyRef.current;
        if (!body) return [0, 0, 0];
        const t = body.translation();
        return sceneToIK(t.x, t.y, t.z);
      };

      const getGripperPosition = (): [number, number, number] => {
        const entry = robotAllLinksRef.current.find(
          (l: { linkName: string }) => l.linkName.toLowerCase() === "gripperframe",
        );
        if (!entry) return [0, 0, 0];
        const pos = new THREE.Vector3();
        entry.link.getWorldPosition(pos);
        return sceneToIK(pos.x, pos.y, pos.z);
      };

      const euclideanDist = (a: [number, number, number], b: [number, number, number]) =>
        Math.sqrt((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2);
        
      // Capture the starting location of the box before the arm touches it
      const initialBoxPos = getBoxPosition();

      // Determine phase based on waypoint label
      const getPhase = (label: string): PickPlaceIteration["phase"] => {
        const l = label.toLowerCase();
        if (l.includes("approach") || l.includes("above")) return "approach";
        if (l.includes("grab") || l.includes("lower to cube") || l.includes("slide into")) return "pick";
        if (l.includes("lift") || l.includes("rotate") || l.includes("carry")) return "carry";
        if (l.includes("place") || l.includes("release") || l.includes("lower to place")) return "place";
        if (l.includes("retract") || l.includes("home") || l.includes("return")) return "return";
        return "approach"; // Default to approach/pick rather than carry
      };

      let consecutiveSuccesses = 0;
      let totalFailures = 0;

      for (let iteration = 0; iteration < maxIterations; iteration++) {
        if (pickPlaceStopRef.current) break;

        // Reset box to origin if requested
        if (autoResetBox && setBoxConfig && setBoxKey) {
          setBoxConfig({
            position: [0.30, 0, 0.015],
            size: [0.03, 0.03, 0.03],
            color: "#6366f1",
          });
          setBoxKey((prev: number) => prev + 1);
          await new Promise((r) => setTimeout(r, 500)); // Settle physics
        }

        setPickPlaceProgress(
          `Iteration ${iteration + 1}/${maxIterations} — ` +
          `${consecutiveSuccesses} consecutive OK, ${totalFailures} fails`,
        );

        let iterationDropped = false;
        let physicalDrop = false;
        let shouldHaveBox = false; // Track if we've performed a grab and haven't released yet

        // Play through all waypoints in this iteration
        for (let wi = 0; wi < totalWaypoints; wi++) {
          if (pickPlaceStopRef.current) break;

          const wp = waypointData[wi];
          const label = wp.label || `Waypoint ${wi + 1}`;
          const l = label.toLowerCase();

          // Update our internal expectation of whether the box should be in the gripper
          if (l.includes("grab")) shouldHaveBox = true;
          if (l.includes("release") || l.includes("place")) shouldHaveBox = false;

          // Build servo updates
          const states = useRobotStateStore.getState().jointStates;
          const revoluteJoints = states.filter((j) => j.jointType === "revolute");
          const updates = revoluteJoints
            .map((joint, idx) => ({
              servoId: joint.servoId as number,
              value: wp.angles[idx],
            }))
            .filter((u) => u.servoId !== undefined);

          // Execute the waypoint movement
          await moveJointsSmoothly(updates, wp.durationMs);

          // Sample box state after each waypoint
          const boxPos = getBoxPosition();
          const gripperPos = getGripperPosition();
          const dist = euclideanDist(boxPos, gripperPos);
          const deviation = euclideanDist(boxPos, initialBoxPos);
          const boxGripped = dist < GRIP_DISTANCE_THRESHOLD;
          const boxDropped = boxPos[2] < DROP_Z_THRESHOLD; // URDF Z is up
          const phase = getPhase(label);

          let notes = "ok";
          if (boxDropped && shouldHaveBox) {
            notes = `Box dropped during ${phase} at waypoint ${wi + 1}`;
            iterationDropped = true;
            physicalDrop = true;
            shouldHaveBox = false; // It's gone now
          } else if (!boxGripped && shouldHaveBox && phase === "carry") {
            notes = `Box too far from gripper (${dist.toFixed(3)}m) during carry`;
            iterationDropped = true; 
          }

          addPickPlaceIteration({
            iteration,
            timestamp: Date.now(),
            phase,
            dataSource: "simulation",
            boxPosition: boxPos,
            gripperPosition: gripperPos,
            boxGripped,
            boxDropped,
            distanceToGripper: dist,
            boxDeviation: deviation,
            waypointIndex: wi,
            waypointLabel: label,
            elapsedMs: Date.now() - testStartTime,
            notes,
          });
        }

        // Record end-of-iteration summary
        const finalBoxPos = getBoxPosition();
        const finalDropped = finalBoxPos[2] < DROP_Z_THRESHOLD;
        const finalDeviation = euclideanDist(finalBoxPos, initialBoxPos);

        addPickPlaceIteration({
          iteration,
          timestamp: Date.now(),
          phase: "complete",
          dataSource: "simulation",
          boxPosition: finalBoxPos,
          gripperPosition: getGripperPosition(),
          boxGripped: false,
          boxDropped: finalDropped || physicalDrop,
          distanceToGripper: 0,
          boxDeviation: finalDeviation,
          waypointIndex: totalWaypoints,
          waypointLabel: `Iteration ${iteration + 1} complete`,
          elapsedMs: Date.now() - testStartTime,
          notes: physicalDrop
            ? `FAIL — box fell to floor`
            : iterationDropped
            ? `FAIL — missed grip / drifted too far`
            : `OK — iteration ${iteration + 1} completed successfully`,
        });

        if (iterationDropped || physicalDrop) {
          totalFailures++;
          consecutiveSuccesses = 0;
        } else {
          consecutiveSuccesses++;
        }

        // Short settle between iterations
        await new Promise((r) => setTimeout(r, 500));
      }

      setPickPlaceStatus("done");
      setPickPlaceProgress(
        `Done — ${maxIterations} iterations, ${consecutiveSuccesses} consecutive OK, ${totalFailures} fails`,
      );
    },
    [addPickPlaceIteration, clearPickPlaceLog, moveJointsSmoothly, autoResetBox, setBoxConfig, setBoxKey],
  );

  if (!show || !isMounted) return null;

  // ─── Render ─────────────────────────────────────────────────────────────────
  return (
    <Rnd
      default={{
        ...getDefaultPanelPosition("testRunner"),
        width: 380,
        height: 520,
      }}
      position={position}
      minWidth={340}
      minHeight={400}
      onDragStop={(_e, d) => {
        const nextPos = setPanelPosition(
          "testRunner",
          { x: d.x, y: d.y },
          "global",
        );
        setPositionState(nextPos);
      }}
      enableResizing={true}
      bounds="window"
      className="rnd-viewport-clamp z-50"
      dragHandleClassName="panel-drag-handle"
    >
      <div
        ref={ref}
        className={`w-full h-full flex flex-col overflow-y-auto text-sm select-none ${panelStyle}`}
      >
        <div className="relative z-10">
          {/* Header */}
          <div className={panelHeaderClass}>
            <div className="flex items-center gap-2">
              <GripDots />
              <FlaskConical className="w-4 h-4 text-amber-400" />
              <h3 className="font-bold text-base text-white">
                FYP Test Suite
              </h3>
            </div>
            <button
              type="button"
              onClick={onHide}
              className={panelCloseButtonClass}
              aria-label="Close test runner"
              title="Close"
            >
              x
            </button>
          </div>

          {!isConnected && (
            <div className="mb-3 px-2 py-1.5 rounded bg-amber-500/10 border border-amber-500/30 text-xs text-amber-300">
              ⚠ Connect to rosbridge first. Latency, repeatability, and
              overshoot tests require a live connection.
            </div>
          )}

          {/* ─── Latency Test ──────────────────────────────────── */}
          <TestSection
            icon={<Wifi className="w-3.5 h-3.5 text-sky-400" />}
            title="Network Latency"
            description="Probes WebSocket RTT every 500ms for 60 seconds"
            status={latencyStatus}
            progress={latencyProgress}
            sampleCount={latencyLog.length}
            onRun={() => runLatencyTest(60)}
            onStop={stopLatencyTest}
            onClear={clearLatencyLog}
            onExport={() => exportLatencyCSV(latencyLog)}
            disabled={!isConnected}
            exportDisabled={latencyLog.length === 0}
          />

          {/* ─── IK Grid Test ─────────────────────────────────── */}
          <TestSection
            icon={<Target className="w-3.5 h-3.5 text-emerald-400" />}
            title="IK Solver Comparison"
            description="25-point workspace grid × Jacobian, CCD, Hybrid"
            status={ikStatus}
            progress={ikProgress}
            sampleCount={ikComparisonLog.length}
            onRun={runIKGridTest}
            onExport={() => exportComparisonCSV(ikComparisonLog)}
            exportDisabled={ikComparisonLog.length === 0}
          />

          {/* ─── Repeatability Test ───────────────────────────── */}
          <TestSection
            icon={<Repeat className="w-3.5 h-3.5 text-violet-400" />}
            title="Repeatability (10 trials)"
            description="Home → target → read feedback, 10×"
            status={repeatStatus}
            progress={repeatProgress}
            sampleCount={repeatabilityLog.length}
            onRun={() => runRepeatabilityTest(10)}
            onStop={() => { repeatStopRef.current = true; }}
            onClear={clearRepeatabilityLog}
            onExport={() => exportRepeatabilityCSV(repeatabilityLog)}
            disabled={!isConnected}
            exportDisabled={repeatabilityLog.length === 0}
          />

          {/* ─── Overshoot Test ────────────────────────────────── */}
          <TestSection
            icon={<Target className="w-3.5 h-3.5 text-rose-400" />}
            title="Step Response / Overshoot"
            description="90° step per joint, sample feedback at 50ms for 3s"
            status={overshootStatus}
            progress={overshootProgress}
            sampleCount={overshootLog.length}
            onRun={runOvershootTest}
            onStop={() => { overshootStopRef.current = true; }}
            onClear={clearOvershootLog}
            onExport={() => exportOvershootCSV(overshootLog)}
            disabled={!isConnected}
            exportDisabled={overshootLog.length === 0}
          />

          {/* ─── Pick & Place Endurance Test ──────────────────── */}
          <div className="mb-3 bg-white/[0.03] border border-white/10 rounded-lg p-3">
            <div className="flex items-center gap-2 mb-1">
              <Box className="w-3.5 h-3.5 text-orange-400" />
              <span className="text-sm font-semibold text-white">Pick & Place Endurance</span>
              <span className={`ml-auto text-[10px] font-medium ${
                pickPlaceStatus === "running" ? "text-sky-400" :
                pickPlaceStatus === "done" ? "text-emerald-400" :
                pickPlaceStatus === "error" ? "text-red-400" : "text-zinc-500"
              }`}>
                ● {pickPlaceStatus === "running" ? "Running" :
                   pickPlaceStatus === "done" ? "Complete" :
                   pickPlaceStatus === "error" ? "Error" : "Ready"}
              </span>
            </div>
            <p className="text-[10px] text-zinc-400 mb-2">
              Load waypoint JSON, loop N iterations, track box grip/drop per waypoint
            </p>

            <div className="flex items-center gap-2 mb-3 px-1">
              <input
                type="checkbox"
                id="auto-reset-box"
                checked={autoResetBox}
                onChange={(e) => setAutoResetBox(e.target.checked)}
                className="w-3 h-3 rounded border-white/20 bg-black/50 text-sky-500 focus:ring-0"
              />
              <label htmlFor="auto-reset-box" className="text-[10px] text-zinc-300 cursor-pointer select-none">
                Auto-Reset Box per Iteration (Ideal testing)
              </label>
            </div>

            {pickPlaceProgress && (
              <div className="text-[10px] text-zinc-300 bg-black/30 rounded px-2 py-1 mb-2 font-mono">
                {pickPlaceProgress} · {pickPlaceLog.length} entries
              </div>
            )}

            <div className="flex gap-1.5 flex-wrap">
              {pickPlaceStatus === "running" ? (
                <button
                  type="button"
                  onClick={() => { pickPlaceStopRef.current = true; }}
                  className={`flex-1 flex items-center justify-center gap-1 ${panelButtonClass} text-red-300 hover:text-red-200`}
                >
                  <Square className="w-3 h-3" /> Stop
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => pickPlaceFileRef.current?.click()}
                  className={`flex-1 flex items-center justify-center gap-1 ${panelPrimaryButtonClass}`}
                >
                  <Play className="w-3 h-3" /> Load & Run
                </button>
              )}

              <button
                type="button"
                onClick={() => exportPickPlaceCSV(pickPlaceLog)}
                disabled={pickPlaceLog.length === 0}
                className={`flex items-center gap-1 ${panelButtonClass} disabled:opacity-30`}
                title="Export CSV"
              >
                <Download className="w-3 h-3" /> CSV
              </button>

              <button
                type="button"
                onClick={clearPickPlaceLog}
                className={`${panelIconButtonClass} h-8 w-8 text-zinc-400 hover:text-red-300`}
                title="Clear data"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </div>

            {/* Hidden file input */}
            <input
              ref={pickPlaceFileRef}
              type="file"
              accept=".json"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                const reader = new FileReader();
                reader.onload = () => {
                  runPickPlaceTest(reader.result as string, 50);
                };
                reader.readAsText(file);
                e.target.value = "";
              }}
            />
          </div>
        </div>
      </div>
    </Rnd>
  );
});

// ─── Reusable test section component ────────────────────────────────────────────

function TestSection({
  icon,
  title,
  description,
  status,
  progress,
  sampleCount,
  onRun,
  onStop,
  onClear,
  onExport,
  disabled,
  exportDisabled,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  status: TestStatus;
  progress: string;
  sampleCount: number;
  onRun: () => void;
  onStop?: () => void;
  onClear?: () => void;
  onExport: () => void;
  disabled?: boolean;
  exportDisabled?: boolean;
}) {
  const statusColor =
    status === "running"
      ? "text-sky-400"
      : status === "done"
        ? "text-emerald-400"
        : status === "error"
          ? "text-red-400"
          : "text-zinc-500";

  const statusLabel =
    status === "running"
      ? "Running"
      : status === "done"
        ? "Complete"
        : status === "error"
          ? "Error"
          : "Ready";

  return (
    <div className="mb-3 bg-white/[0.03] border border-white/10 rounded-lg p-3">
      <div className="flex items-center gap-2 mb-1">
        {icon}
        <span className="text-sm font-semibold text-white">{title}</span>
        <span className={`ml-auto text-[10px] font-medium ${statusColor}`}>
          ● {statusLabel}
        </span>
      </div>
      <p className="text-[10px] text-zinc-400 mb-2">{description}</p>

      {progress && (
        <div className="text-[10px] text-zinc-300 bg-black/30 rounded px-2 py-1 mb-2 font-mono">
          {progress} · {sampleCount} entries
        </div>
      )}

      <div className="flex gap-1.5">
        {status === "running" && onStop ? (
          <button
            type="button"
            onClick={onStop}
            className={`flex-1 flex items-center justify-center gap-1 ${panelButtonClass} text-red-300 hover:text-red-200`}
          >
            <Square className="w-3 h-3" /> Stop
          </button>
        ) : (
          <button
            type="button"
            onClick={onRun}
            disabled={disabled || status === "running"}
            className={`flex-1 flex items-center justify-center gap-1 ${panelPrimaryButtonClass} disabled:opacity-40`}
          >
            <Play className="w-3 h-3" /> Run
          </button>
        )}

        <button
          type="button"
          onClick={onExport}
          disabled={exportDisabled}
          className={`flex items-center gap-1 ${panelButtonClass} disabled:opacity-30`}
          title="Export CSV"
        >
          <Download className="w-3 h-3" /> CSV
        </button>

        {onClear && (
          <button
            type="button"
            onClick={onClear}
            className={`${panelIconButtonClass} h-8 w-8 text-zinc-400 hover:text-red-300`}
            title="Clear data"
          >
            <Trash2 className="w-3 h-3" />
          </button>
        )}
      </div>
    </div>
  );
}
