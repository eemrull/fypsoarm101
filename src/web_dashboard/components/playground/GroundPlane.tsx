"use client";
import React from "react";
import { RigidBody } from "@react-three/rapier";
import { Grid, Text } from "@react-three/drei";
import { useDisplayStore, type DisplayState } from "@/store/useDisplayStore";
import { SCENE_SCALE } from "@/config/robotConstants";

export function GroundPlane() {
  const showGrid = useDisplayStore((state: DisplayState) => state.showGrid);
  return (
    <>
      <RigidBody type="fixed" restitution={0.2} friction={1}>
        {/* Ground surface — subtle sheen for light reflections */}
        <mesh
          rotation={[-Math.PI / 2, 0, 0]}
          receiveShadow
          position={[0, -0.02, 0]}
        >
          <planeGeometry args={[50, 50]} />
          <meshStandardMaterial
            color="#252a35"
            roughness={0.85}
            metalness={0.05}
            polygonOffset
            polygonOffsetFactor={1}
            polygonOffsetUnits={1}
          />
        </mesh>
      </RigidBody>

      {/* Grid — clean bounded grid representing Real-World Metrics */}
      {showGrid && (
        <Grid
          position={[0, 0.005, 0]}
          args={[50, 50]}
          cellSize={0.02 * SCENE_SCALE} // 2 cm grid lines (5 squares per 10cm section)
          cellThickness={1.2}
          cellColor="#334155" // Subtle slate cell lines
          sectionSize={0.1 * SCENE_SCALE} // 10 cm major lines
          sectionThickness={2.5}
          sectionColor="#6366f1" // Indigo accent on major grid lines
          fadeDistance={120}
          fadeStrength={2.5} // Smoother edge falloff
        />
      )}

      {/* Axis measurement labels (In Real Meters) */}
      {showGrid && (
        <group position={[0, 0.02, 0]}>
          {Array.from({ length: 21 }, (_, i) => i - 10)
            .filter((x) => x !== 0)
            .map((virtualX) => {
              const physicalX = virtualX * 0.1; // every 10cm labeled
              const label = physicalX.toFixed(1);

              return (
                <Text
                  key={`x-${virtualX}`}
                  position={[physicalX * SCENE_SCALE, 0, 0]}
                  rotation={[-Math.PI / 2, 0, 0]}
                  fontSize={0.6}
                  fillOpacity={0.8}
                  color="#FF746C"
                >
                  {label}
                </Text>
              );
            })}
          {Array.from({ length: 21 }, (_, i) => i - 10)
            .filter((z) => z !== 0)
            .map((virtualZ) => {
              const physicalZ = virtualZ * 0.1; // every 10cm labeled
              const label = (-physicalZ).toFixed(1);

              return (
                <Text
                  key={`z-${virtualZ}`}
                  position={[0, 0, physicalZ * SCENE_SCALE]}
                  rotation={[-Math.PI / 2, 0, 0]}
                  fontSize={0.6}
                  fillOpacity={0.8}
                  color="#FF746C"
                >
                  {label}
                </Text>
              );
            })}
        </group>
      )}
    </>
  );
}
