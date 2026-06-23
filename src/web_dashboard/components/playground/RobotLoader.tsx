"use client";

import {
  useEffect,
  useState,
  Suspense,
  useCallback,
  useMemo,
  useRef,
  startTransition,
} from "react";
import dynamic from "next/dynamic";
import { robotConfigMap } from "@/config/robotConfig";
import * as THREE from "three";
import { Html } from "@react-three/drei";
import { ControlPanel } from "./keyboardControl/KeyboardControl";
import { useRobotControl } from "@/hooks/useRobotControl";
import { Canvas } from "@react-three/fiber";
import { RobotScene, type JointDetails } from "./RobotScene";
import KeyboardControlButton from "../playground/controlButtons/KeyboardControlButton";
import ChatControlButton from "../playground/controlButtons/ChatControlButton";
import RecordButton from "./controlButtons/RecordButton";
import RecordControl from "./recordControl/RecordControl";
import { PhysicsControl, BoxConfig } from "./physicsControl/PhysicsControl";
import PhysicsControlButton from "./controlButtons/PhysicsControlButton";
import {
  getPanelStateFromLocalStorage,
  setPanelStateToLocalStorage,
  resetPanelLayout,
} from "@/lib/panelSettings";
import { useDisplayStore, type DisplayState } from "@/store/useDisplayStore";
import {
  useRobotProfileStore,
  type RobotProfileState,
} from "@/store/useRobotProfileStore";
import { useShallow } from "zustand/react/shallow";

import { DisplayControl } from "./displayControl/DisplayControl";
import DisplayControlButton from "./controlButtons/DisplayControlButton";
import MetricsControlButton from "./controlButtons/MetricsControlButton";
import { PidControlButton } from "./controlButtons/PidControlButton";
import ResetLayoutButton from "./controlButtons/ResetLayoutButton";
import TuningControlButton from "./controlButtons/TuningControlButton";
import CollisionControlButton from "./controlButtons/CollisionControlButton";
import ArmTestButton from "./controlButtons/ArmTestButton";

import CameraButton from "./controlButtons/CameraButton";
import TestRunnerButton from "./controlButtons/TestRunnerButton";

const CameraFeed = dynamic(
  () => import("./CameraFeed").then((mod) => mod.CameraFeed),
  { ssr: false },
);

const ChatControl = dynamic(
  () => import("./chatControl/ChatControl").then((mod) => mod.ChatControl),
  { ssr: false },
);
const MetricsPanel = dynamic(
  () => import("./metricsControl/MetricsPanel").then((mod) => mod.MetricsPanel),
  { ssr: false },
);
const PidResponsePanel = dynamic(
  () =>
    import("./metricsControl/PidResponsePanel").then(
      (mod) => mod.PidResponsePanel,
    ),
  { ssr: false },
);
const GripperTuningPanel = dynamic(
  () => import("./GripperTuningPanel").then((mod) => mod.GripperTuningPanel),
  { ssr: false },
);
const CollisionEditorPanel = dynamic(
  () =>
    import("./CollisionEditorPanel").then((mod) => mod.CollisionEditorPanel),
  { ssr: false },
);
const WaypointPanel = dynamic(
  () => import("./WaypointPanel").then((mod) => mod.WaypointPanel),
  { ssr: false },
);
const TestRunnerPanel = dynamic(
  () =>
    import("./testRunner/TestRunnerPanel").then((mod) => mod.TestRunnerPanel),
  { ssr: false },
);
const DigitalTwinOffsetPanel = dynamic(
  () =>
    import("./DigitalTwinOffsetPanel").then((mod) => mod.DigitalTwinOffsetPanel),
  { ssr: false },
);
import DigitalTwinOffsetButton from "./controlButtons/DigitalTwinOffsetButton";

// Pre-load all lazy panel chunks during idle time so first-open is instant
if (typeof window !== "undefined") {
  const preload = () => {
    import("./chatControl/ChatControl");
    import("./metricsControl/MetricsPanel");
    import("./metricsControl/PidResponsePanel");
    import("./GripperTuningPanel");
    import("./CollisionEditorPanel");
    import("./WaypointPanel");
    import("./CameraFeed");
    import("./testRunner/TestRunnerPanel");
  };
  if ("requestIdleCallback" in window) {
    (
      window as unknown as { requestIdleCallback: (cb: () => void) => void }
    ).requestIdleCallback(preload);
  } else {
    setTimeout(preload, 2000);
  }
}

import { useWebSerialControl } from "@/hooks/useWebSerialControl";

type RobotLoaderProps = {
  robotName: string;
  transportMode?: "ros" | "usb";
};

const PANEL_NAMES = [
  "keyboardControl",
  "chatControl",
  "recordControl",
  "physicsControl",
  "displayControl",
  "metricsControl",
  "pidPanel",
  "tuningPanel",
  "collisionPanel",
  "armTestPanel",
  "cameraFeed",
  "testRunner",
  "digitalTwinOffsetPanel",
] as const;

type PanelName = (typeof PANEL_NAMES)[number];
type PanelVisibilityState = Record<PanelName, boolean>;

const LAZY_PANEL_NAMES = [
  "chatControl",
  "metricsControl",
  "pidPanel",
  "tuningPanel",
  "collisionPanel",
  "armTestPanel",
  "cameraFeed",
  "testRunner",
  "digitalTwinOffsetPanel",
] as const;
type LazyPanelName = (typeof LAZY_PANEL_NAMES)[number];
type LazyPanelState = Record<LazyPanelName, boolean>;

function loadPanelVisibility(robotName: string): PanelVisibilityState {
  const state = {} as PanelVisibilityState;
  PANEL_NAMES.forEach((panelName) => {
    state[panelName] =
      getPanelStateFromLocalStorage(panelName, robotName) ?? false;
  });
  return state;
}

function loadLazyPanels(visibility: PanelVisibilityState): LazyPanelState {
  const state = {} as LazyPanelState;
  LAZY_PANEL_NAMES.forEach((panelName) => {
    state[panelName] = visibility[panelName];
  });
  return state;
}

function createHiddenPanelVisibility(): PanelVisibilityState {
  const state = {} as PanelVisibilityState;
  PANEL_NAMES.forEach((panelName) => {
    state[panelName] = false;
  });
  return state;
}

function createHiddenLazyPanels(): LazyPanelState {
  const state = {} as LazyPanelState;
  LAZY_PANEL_NAMES.forEach((panelName) => {
    state[panelName] = false;
  });
  return state;
}

function Loader() {
  return (
    <Html center>
      <div className="flex flex-col items-center justify-center pointer-events-none">
        <div className="w-8 h-8 rounded-full border-4 border-slate-700 border-t-indigo-500 animate-spin mb-2"></div>
        <div className="text-xs text-slate-400 font-mono bg-black/50 px-2 py-1 rounded backdrop-blur-sm">
          Loading...
        </div>
      </div>
    </Html>
  );
}

export default function RobotLoader({ robotName, transportMode = "ros" }: RobotLoaderProps) {
  const [jointDetails, setJointDetails] = useState<JointDetails[]>([]);
  const [panelLayoutVersion, setPanelLayoutVersion] = useState(0);
  const [panelVisibility, setPanelVisibility] = useState<PanelVisibilityState>(
    createHiddenPanelVisibility,
  );
  const [lazyPanelsLoaded, setLazyPanelsLoaded] = useState<LazyPanelState>(
    createHiddenLazyPanels,
  );
  const [boxConfig, setBoxConfig] = useState<BoxConfig>({
    position: [0.30, 0, 0.015], // URDF Coordinates (X=0.30m forward, Y=0m, Z=0.015m — cube sits on ground)
    size: [0.03, 0.03, 0.03], // 3cm physical cube
    color: "#6366f1",
  });
  const [boxKey, setBoxKey] = useState(0);

  const { showShadows, renderQuality } = useDisplayStore(
    useShallow((state: DisplayState) => ({
      showShadows: state.showShadows,
      renderQuality: state.renderQuality,
    })),
  );
  const { baseUrdfContent, profileName } = useRobotProfileStore(
    useShallow((state: RobotProfileState) => ({
      baseUrdfContent: state.baseUrdfContent,
      profileName: state.profileName,
    })),
  );
  const [customUrdfUrl, setCustomUrdfUrl] = useState<string | null>(null);
  const customUrdfUrlRef = useRef<string | null>(null);
  const [canvasContextLost, setCanvasContextLost] = useState(false);
  const [canvasVersion, setCanvasVersion] = useState(0);
  const canvasEventCleanupRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    const visibility = loadPanelVisibility(robotName);
    setPanelVisibility(visibility);
    setLazyPanelsLoaded(loadLazyPanels(visibility));
  }, [robotName]);

  useEffect(() => {
    setLazyPanelsLoaded((previous) => {
      let changed = false;
      const next = { ...previous };
      LAZY_PANEL_NAMES.forEach((panelName) => {
        if (panelVisibility[panelName] && !next[panelName]) {
          next[panelName] = true;
          changed = true;
        }
      });
      return changed ? next : previous;
    });
  }, [panelVisibility]);

  useEffect(() => {
    if (customUrdfUrlRef.current) {
      URL.revokeObjectURL(customUrdfUrlRef.current);
      customUrdfUrlRef.current = null;
    }

    if (robotName !== "custom" || !baseUrdfContent?.trim()) {
      setCustomUrdfUrl(null);
      return;
    }

    const url = URL.createObjectURL(
      new Blob([baseUrdfContent], { type: "text/xml" }),
    );
    customUrdfUrlRef.current = url;
    setCustomUrdfUrl(url);

    return () => {
      if (customUrdfUrlRef.current === url) {
        URL.revokeObjectURL(url);
        customUrdfUrlRef.current = null;
      }
    };
  }, [robotName, baseUrdfContent]);

  useEffect(() => {
    return () => {
      if (customUrdfUrlRef.current) {
        URL.revokeObjectURL(customUrdfUrlRef.current);
        customUrdfUrlRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    return () => {
      if (canvasEventCleanupRef.current) {
        canvasEventCleanupRef.current();
        canvasEventCleanupRef.current = null;
      }
    };
  }, []);

  const config = useMemo(() => {
    if (robotName === "custom") {
      return {
        ...robotConfigMap["so-arm101"], // Fallback config defaults
        name: profileName || "Custom Robot",
        urdfUrl: customUrdfUrl ?? robotConfigMap["so-arm101"].urdfUrl,
      };
    }
    return robotConfigMap[robotName];
  }, [robotName, customUrdfUrl, profileName]);

  if (!config) {
    throw new Error(`Robot configuration for "${robotName}" not found.`);
  }

  const {
    urdfUrl,
    orbitTarget,
    camera,
    keyboardControlMap,
    compoundMovements,
    systemPrompt,
    urdfInitJointAngles,
  } = config;

  const rosControl = useRobotControl(jointDetails, urdfInitJointAngles);
  const usbControl = useWebSerialControl(jointDetails, urdfInitJointAngles);
  
  const activeControl = transportMode === "usb" ? usbControl : rosControl;

  const {
    isConnected,
    connectionMessage,
    firmwareConfigStatus,
    bridgeHealth,
    profileValidationErrors,
    profileValidationWarnings,
    connectRobot,
    disconnectRobot,
    subscribePidResponse,
    getJointStates,
    updateJointSpeed,
    setJointDetails: updateJointDetails,
    updateJointDegrees,
    updateJointsDegrees,
    updateJointsSpeed,
    moveJointsSmoothly,
    isRecording,
    recordData,
    startRecording,
    stopRecording,
    clearRecordData,
    setRecordData,
  } = activeControl;

  useEffect(() => {
    updateJointDetails(jointDetails);
  }, [jointDetails, updateJointDetails]);

  const handleResetPanelLayout = useCallback(() => {
    resetPanelLayout("global");
    setPanelLayoutVersion((prev) => prev + 1);
  }, []);

  const panelHandlers = useMemo(
    () =>
      PANEL_NAMES.reduce(
        (acc, panelName) => {
          acc[panelName] = {
            toggle: () => {
              startTransition(() => {
                setPanelVisibility((prev) => {
                  const nextVisible = !prev[panelName];
                  setPanelStateToLocalStorage(
                    panelName,
                    nextVisible,
                    robotName,
                  );
                  return { ...prev, [panelName]: nextVisible };
                });
              });
            },
            hide: () => {
              startTransition(() => {
                setPanelVisibility((prev) => {
                  if (!prev[panelName]) return prev;
                  return { ...prev, [panelName]: false };
                });
                setPanelStateToLocalStorage(panelName, false, robotName);
              });
            },
          };
          return acc;
        },
        {} as Record<PanelName, { toggle: () => void; hide: () => void }>,
      ),
    [robotName],
  );

  const canvasCamera = useMemo(
    () => ({
      position: camera.position,
      fov: camera.fov,
    }),
    [camera.position, camera.fov],
  );
  const shouldPreserveDrawingBuffer =
    robotName === "custom" && profileName !== "SO-ARM101 (Default)";

  const handleCanvasCreated = useCallback(
    ({ scene, gl }: { scene: THREE.Scene; gl: THREE.WebGLRenderer }) => {
      scene.background = new THREE.Color(0x1e2530);
      setCanvasContextLost(false);

      if (canvasEventCleanupRef.current) {
        canvasEventCleanupRef.current();
      }

      const canvas = gl.domElement;
      const onContextLost = (event: Event) => {
        event.preventDefault();
        setCanvasContextLost(true);
      };
      const onContextRestored = () => {
        setCanvasContextLost(false);
      };

      canvas.addEventListener("webglcontextlost", onContextLost, false);
      canvas.addEventListener("webglcontextrestored", onContextRestored, false);
      canvasEventCleanupRef.current = () => {
        canvas.removeEventListener("webglcontextlost", onContextLost, false);
        canvas.removeEventListener(
          "webglcontextrestored",
          onContextRestored,
          false,
        );
      };
    },
    [],
  );


  return (
    <>
      <Canvas
        key={`canvas-${canvasVersion}-${renderQuality}`}
        shadows={showShadows}
        camera={canvasCamera}
        frameloop="always"
        dpr={renderQuality === "high" ? [1, 2] : [0.75, 1.25]}
        performance={{ min: 0.6 }}
        gl={{
          antialias: renderQuality === "high",
          powerPreference: "high-performance",
          // Keep off for normal rendering to avoid a large GPU/throughput penalty.
          preserveDrawingBuffer: shouldPreserveDrawingBuffer,
          // Be lenient on weak GPUs (mobile/tablet users) — don't reject
          // the context just because of a performance caveat.
          failIfMajorPerformanceCaveat: false,
        }}
        onCreated={handleCanvasCreated}
      >
        <Suspense fallback={<Loader />}>
          <RobotScene
            robotName={robotName}
            urdfUrl={urdfUrl}
            orbitTarget={orbitTarget}
            isConnected={isConnected}
            setJointDetails={setJointDetails}
            boxConfig={boxConfig}
            boxKey={boxKey}

          />
        </Suspense>
      </Canvas>

      {canvasContextLost && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-40">
          <div className="rounded-lg border border-red-400/60 bg-black/80 backdrop-blur px-3 py-2 text-xs text-red-100 flex items-center gap-3">
            <span>WebGL context lost. Reload 3D view to recover.</span>
            <button
              type="button"
              onClick={() => {
                setCanvasContextLost(false);
                setCanvasVersion((prev) => prev + 1);
              }}
              className="rounded bg-red-500/80 hover:bg-red-400 px-2 py-1 font-semibold text-white"
            >
              Reload
            </button>
          </div>
        </div>
      )}

      {panelVisibility.keyboardControl && (
        <ControlPanel
          key={`keyboard-${panelLayoutVersion}`}
          robotName={robotName}
          transportMode={transportMode}
          show={true}
          onHide={panelHandlers.keyboardControl.hide}
          updateJointsSpeed={updateJointsSpeed}
          updateJointDegrees={updateJointDegrees}
          updateJointsDegrees={updateJointsDegrees}
          updateJointSpeed={updateJointSpeed}
          moveJointsSmoothly={moveJointsSmoothly}
          isConnected={isConnected}
          connectionMessage={connectionMessage}
          firmwareConfigStatus={firmwareConfigStatus}
          bridgeHealth={bridgeHealth ?? undefined}
          profileValidationErrors={profileValidationErrors}
          profileValidationWarnings={profileValidationWarnings}
          connectRobot={connectRobot}
          disconnectRobot={disconnectRobot}
          keyboardControlMap={keyboardControlMap}
          compoundMovements={compoundMovements}
        />
      )}
      {(panelVisibility.chatControl || lazyPanelsLoaded.chatControl) && (
        <ChatControl
          key={`chat-${panelLayoutVersion}`}
          show={panelVisibility.chatControl}
          onHide={panelHandlers.chatControl.hide}
          robotName={robotName}
          systemPrompt={systemPrompt}
          getJointStates={getJointStates}
          moveJointsSmoothly={moveJointsSmoothly}
        />
      )}
      {/* Record Control overlay */}
      <RecordControl
        key={`record-${panelLayoutVersion}`}
        show={panelVisibility.recordControl}
        onHide={panelHandlers.recordControl.hide}
        isRecording={isRecording}
        recordData={recordData}
        startRecording={startRecording}
        stopRecording={stopRecording}
        clearRecordData={clearRecordData}
        updateJointsDegrees={updateJointsDegrees}
        updateJointsSpeed={updateJointsSpeed}
        jointDetails={jointDetails}
        setRecordData={setRecordData}
      />
      <PhysicsControl
        key={`physics-${panelLayoutVersion}`}
        show={panelVisibility.physicsControl}
        onHide={panelHandlers.physicsControl.hide}
        config={boxConfig}
        setConfig={setBoxConfig}
        onRespawn={() => setBoxKey((k) => k + 1)}
      />
      <DisplayControl
        key={`display-${panelLayoutVersion}`}
        show={panelVisibility.displayControl}
        onHide={panelHandlers.displayControl.hide}
        onResetLayout={handleResetPanelLayout}
      />

      {/* IK Analyser Panel */}
      {(panelVisibility.metricsControl || lazyPanelsLoaded.metricsControl) && (
        <MetricsPanel
          key={`metrics-${panelLayoutVersion}`}
          show={panelVisibility.metricsControl}
          onHide={panelHandlers.metricsControl.hide}
        />
      )}

      {/* PID Step Response Panel */}
      {(panelVisibility.pidPanel || lazyPanelsLoaded.pidPanel) && (
        <PidResponsePanel
          key={`pid-${panelLayoutVersion}`}
          show={panelVisibility.pidPanel}
          onHide={panelHandlers.pidPanel.hide}
          rosConnected={isConnected}
          subscribePidResponse={subscribePidResponse}
        />
      )}

      {(panelVisibility.tuningPanel || lazyPanelsLoaded.tuningPanel) && (
        <GripperTuningPanel
          key={`tuning-${panelLayoutVersion}`}
          show={panelVisibility.tuningPanel}
          onHide={panelHandlers.tuningPanel.hide}
        />
      )}
      {(panelVisibility.collisionPanel || lazyPanelsLoaded.collisionPanel) && (
        <CollisionEditorPanel
          key={`collision-${panelLayoutVersion}`}
          show={panelVisibility.collisionPanel}
          onHide={panelHandlers.collisionPanel.hide}
        />
      )}
      {(panelVisibility.armTestPanel || lazyPanelsLoaded.armTestPanel) && (
        <WaypointPanel
          key={`waypoint-${panelLayoutVersion}`}
          show={panelVisibility.armTestPanel}
          onHide={panelHandlers.armTestPanel.hide}
          robotName={robotName}
          moveJointsSmoothly={moveJointsSmoothly}
        />
      )}
      {(panelVisibility.cameraFeed || lazyPanelsLoaded.cameraFeed) && (
        <CameraFeed
          key={`camera-${panelLayoutVersion}`}
          show={panelVisibility.cameraFeed}
          onHide={panelHandlers.cameraFeed.hide}
          robotName={robotName}
        />
      )}
      {(panelVisibility.testRunner || lazyPanelsLoaded.testRunner) && (
        <TestRunnerPanel
          key={`testrunner-${panelLayoutVersion}`}
          show={panelVisibility.testRunner}
          onHide={panelHandlers.testRunner.hide}
          isConnected={isConnected}
          moveJointsSmoothly={moveJointsSmoothly}
          setBoxConfig={setBoxConfig}
          setBoxKey={setBoxKey}
        />
      )}
      {(panelVisibility.digitalTwinOffsetPanel || lazyPanelsLoaded.digitalTwinOffsetPanel) && (
        <DigitalTwinOffsetPanel
          key={`digitaltwinoffset-${panelLayoutVersion}`}
          show={panelVisibility.digitalTwinOffsetPanel}
          onHide={panelHandlers.digitalTwinOffsetPanel.hide}
          robotName={robotName}
        />
      )}

      <div className="absolute bottom-3 left-0 right-0 z-30 px-2 md:px-4">
        <div className="mx-auto w-full overflow-x-auto no-scrollbar pointer-events-auto">
          <div className="mx-auto flex w-max gap-2 min-w-full justify-center">
            <KeyboardControlButton
              showControlPanel={panelVisibility.keyboardControl}
              onToggleControlPanel={panelHandlers.keyboardControl.toggle}
            />
            <ArmTestButton
              showControlPanel={panelVisibility.armTestPanel}
              onToggleControlPanel={panelHandlers.armTestPanel.toggle}
            />
            <ChatControlButton
              showControlPanel={panelVisibility.chatControl}
              onToggleControlPanel={panelHandlers.chatControl.toggle}
            />
            <RecordButton
              showControlPanel={panelVisibility.recordControl}
              onToggleControlPanel={panelHandlers.recordControl.toggle}
            />
            <PhysicsControlButton
              showControlPanel={panelVisibility.physicsControl}
              onToggleControlPanel={panelHandlers.physicsControl.toggle}
            />

            <DisplayControlButton
              showControlPanel={panelVisibility.displayControl}
              onToggleControlPanel={panelHandlers.displayControl.toggle}
            />
            <MetricsControlButton
              showControlPanel={panelVisibility.metricsControl}
              onToggleControlPanel={panelHandlers.metricsControl.toggle}
            />
            <PidControlButton
              showControlPanel={panelVisibility.pidPanel}
              onToggleControlPanel={panelHandlers.pidPanel.toggle}
            />
            <TuningControlButton
              showControlPanel={panelVisibility.tuningPanel}
              onToggleControlPanel={panelHandlers.tuningPanel.toggle}
            />
            <CollisionControlButton
              showControlPanel={panelVisibility.collisionPanel}
              onToggleControlPanel={panelHandlers.collisionPanel.toggle}
            />
            <CameraButton
              showControlPanel={panelVisibility.cameraFeed}
              onToggleControlPanel={panelHandlers.cameraFeed.toggle}
            />
            <TestRunnerButton
              showControlPanel={panelVisibility.testRunner}
              onToggleControlPanel={panelHandlers.testRunner.toggle}
            />
            <DigitalTwinOffsetButton
              isOpen={panelVisibility.digitalTwinOffsetPanel}
              onClick={panelHandlers.digitalTwinOffsetPanel.toggle}
            />
            <ResetLayoutButton robotName={robotName} />
          </div>
        </div>
      </div>
    </>
  );
}
