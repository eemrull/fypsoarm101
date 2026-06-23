"use client";

import { Canvas } from "@react-three/fiber";
import { robotConfigMap } from "@/config/robotConfig";
import { RobotScene, JointDetails } from "@/components/playground/RobotScene";
import { useState, useEffect } from "react";
import { JointState } from "@/hooks/useRobotControl";
import {
  useRobotProfileStore,
  type RobotProfileState,
} from "@/store/useRobotProfileStore";

export default function RobotPreview({
  robotName = "so-arm101",
}: {
  robotName?: string;
}) {
  const baseUrdfContent = useRobotProfileStore(
    (s: RobotProfileState) => s.baseUrdfContent,
  );
  const [dynamicUrl, setDynamicUrl] = useState("");

  useEffect(() => {
    if (robotName === "custom" && baseUrdfContent) {
      const url = URL.createObjectURL(
        new Blob([baseUrdfContent], { type: "text/xml" }),
      );
      setDynamicUrl(url);
      return () => URL.revokeObjectURL(url);
    }
  }, [robotName, baseUrdfContent]);

  const robotConfig =
    robotName === "custom"
      ? { ...robotConfigMap["so-arm101"], urdfUrl: dynamicUrl }
      : robotConfigMap[robotName];

  const [jointDetails, setJointDetails] = useState<JointDetails[]>([]);
  const [jointStates, setJointStates] = useState<JointState[]>([]);

  useEffect(() => {
    if (jointDetails.length > 0) {
      const initialJointStates = jointDetails.map((detail) => {
        const initialAngle =
          robotConfig.urdfInitJointAngles?.[detail.name] ?? 0;
        return {
          name: detail.name,
          servoId: detail.servoId,
          degrees: initialAngle,
          jointType: detail.jointType,
        };
      });
      setJointStates(initialJointStates);
    }
  }, [jointDetails, robotConfig.urdfInitJointAngles]);

  if (robotName === "custom" && !dynamicUrl) {
    return (
      <div className="w-full h-96 rounded-lg border border-zinc-600 flex items-center justify-center bg-zinc-900/50">
        <span className="text-zinc-500 animate-pulse">
          Loading Custom URDF...
        </span>
      </div>
    );
  }

  return (
    <div className="w-full h-96 rounded-lg overflow-hidden border border-zinc-600">
      <Canvas
        shadows
        camera={{
          position: robotConfig.camera.position as [number, number, number],
          fov: robotConfig.camera.fov,
        }}
      >
        <RobotScene
          robotName={robotName}
          urdfUrl={robotConfig.urdfUrl}
          orbitTarget={robotConfig.orbitTarget}
          setJointDetails={setJointDetails}
          overrideJointStates={jointStates}
        />
      </Canvas>
    </div>
  );
}
