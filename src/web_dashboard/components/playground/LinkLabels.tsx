"use client";

import React, { useMemo, useRef } from "react";
import * as THREE from "three";
import { Html } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { sceneToIK } from "@/config/robotConstants";

function findControllingJointName(link: THREE.Object3D): string | null {
  let current: THREE.Object3D | null = link.parent;

  while (current) {
    const maybeJoint = current as THREE.Object3D & {
      isURDFJoint?: boolean;
      jointType?: string;
      type?: string;
      name?: string;
    };

    if (
      maybeJoint.isURDFJoint ||
      maybeJoint.type === "URDFJoint" ||
      typeof maybeJoint.jointType === "string"
    ) {
      const name = current.name?.trim();
      return name && name.length > 0 ? name : null;
    }

    current = current.parent;
  }

  return null;
}

/**
 * Floating HUD labels for each robot link/joint.
 * Shows both the URDF link name and the joint that controls this link.
 */
export function LinkLabels({
  links,
}: {
  links: { link: THREE.Object3D; linkName: string }[];
}) {
  const positionsRef = useRef<Map<string, THREE.Vector3>>(new Map());
  const jointNamesByLink = useMemo(
    () =>
      new Map(
        links.map(({ link, linkName }) => [
          linkName,
          findControllingJointName(link),
        ]),
      ),
    [links],
  );

  useFrame(() => {
    for (const { link, linkName } of links) {
      if (!positionsRef.current.has(linkName)) {
        positionsRef.current.set(linkName, new THREE.Vector3());
      }
      link.getWorldPosition(positionsRef.current.get(linkName)!);
    }
  });

  const visibleLinks = links.filter(
    (l) =>
      l.linkName &&
      l.linkName !== "base_link" &&
      l.linkName !== "base" &&
      !l.linkName.startsWith("__"),
  );

  return (
    <>
      {visibleLinks.map(({ linkName }) => (
        <LinkLabel
          key={linkName}
          linkName={linkName}
          jointName={jointNamesByLink.get(linkName) ?? null}
          positionsRef={positionsRef}
        />
      ))}
    </>
  );
}

/** Individual label — reads world position from shared ref each frame. */
function LinkLabel({
  linkName,
  jointName,
  positionsRef,
}: {
  linkName: string;
  jointName: string | null;
  positionsRef: React.RefObject<Map<string, THREE.Vector3>>;
}) {
  const groupRef = useRef<THREE.Group>(null!);

  useFrame(() => {
    if (!groupRef.current || !positionsRef.current) return;
    const pos = positionsRef.current.get(linkName);
    if (pos) {
      groupRef.current.position.copy(pos);
    }
  });

  const displayName = linkName
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());

  return (
    <group ref={groupRef}>
      <Html center distanceFactor={8} style={{ pointerEvents: "none" }}>
        <div
          style={{
            fontSize: 11,
            fontWeight: 600,
            fontFamily: "monospace",
            color: "#a5b4fc",
            background: "rgba(0,0,0,0.65)",
            borderRadius: 4,
            padding: "2px 6px",
            whiteSpace: "nowrap",
            userSelect: "none",
            border: "1px solid rgba(165,180,252,0.3)",
            textAlign: "center",
          }}
        >
          {displayName}
          {jointName && (
            <span style={{ color: "#94a3b8", fontSize: 9 }}>
              {" "}
              → {jointName}
            </span>
          )}
        </div>
      </Html>
    </group>
  );
}

/**
 * Gripperframe coordinate indicator — shows live XYZ coordinates
 * with a dashed drop line and crosshair on the ground plane.
 */
export function GripperCoordinateDisplay({
  gripperLink,
}: {
  gripperLink: THREE.Object3D | null;
}) {
  const groupRef = useRef<THREE.Group>(null!);
  const _worldPos = useRef(new THREE.Vector3());
  const coordRef = useRef<HTMLDivElement>(null);
  const dropLineRef = useRef<THREE.Group>(null!);
  const dropGeomRef = useRef<THREE.BufferGeometry>(null!);

  useFrame(() => {
    if (!gripperLink || !groupRef.current) return;
    gripperLink.getWorldPosition(_worldPos.current);
    groupRef.current.position.copy(_worldPos.current);

    // Update drop line from gripper to floor
    if (dropGeomRef.current) {
      const attr = dropGeomRef.current.getAttribute(
        "position",
      ) as THREE.BufferAttribute | null;
      if (attr) {
        attr.setXYZ(
          0,
          _worldPos.current.x,
          _worldPos.current.y,
          _worldPos.current.z,
        );
        attr.setXYZ(1, _worldPos.current.x, 0, _worldPos.current.z);
        attr.needsUpdate = true;
      }
    }

    // Update crosshair position on floor
    if (dropLineRef.current) {
      dropLineRef.current.position.set(
        _worldPos.current.x,
        0,
        _worldPos.current.z,
      );
    }

    // Update coordinate text
    if (coordRef.current) {
      const [ikX, ikY, ikZ] = sceneToIK(
        _worldPos.current.x,
        _worldPos.current.y,
        _worldPos.current.z,
      );
      coordRef.current.textContent = `X: ${ikX.toFixed(3)}  Y: ${ikY.toFixed(3)}  Z: ${ikZ.toFixed(3)}`;
    }
  });

  if (!gripperLink) return null;

  return (
    <>
      {/* Coordinate label at gripper tip */}
      <group ref={groupRef}>
        <Html
          center
          distanceFactor={8}
          position={[0, 0.6, 0]}
          style={{ pointerEvents: "none" }}
        >
          <div
            ref={coordRef}
            style={{
              fontSize: 10,
              fontWeight: 700,
              fontFamily: "monospace",
              color: "#fbbf24",
              background: "rgba(0,0,0,0.7)",
              borderRadius: 4,
              padding: "2px 8px",
              whiteSpace: "nowrap",
              userSelect: "none",
              border: "1px solid rgba(251,191,36,0.4)",
            }}
          />
        </Html>
      </group>

      {/* Dashed drop line from gripper tip to ground */}
      <line>
        <bufferGeometry ref={dropGeomRef}>
          <bufferAttribute
            attach="attributes-position"
            args={[new Float32Array(6), 3]}
          />
        </bufferGeometry>
        <lineDashedMaterial
          color="#fbbf24"
          dashSize={0.15}
          gapSize={0.1}
          transparent
          opacity={0.5}
        />
      </line>

      {/* Small crosshair on the ground directly below */}
      <group ref={dropLineRef}>
        <line>
          <bufferGeometry>
            <bufferAttribute
              attach="attributes-position"
              args={[new Float32Array([-0.15, 0.01, 0, 0.15, 0.01, 0]), 3]}
            />
          </bufferGeometry>
          <lineBasicMaterial color="#fbbf24" transparent opacity={0.6} />
        </line>
        <line>
          <bufferGeometry>
            <bufferAttribute
              attach="attributes-position"
              args={[new Float32Array([0, 0.01, -0.15, 0, 0.01, 0.15]), 3]}
            />
          </bufferGeometry>
          <lineBasicMaterial color="#fbbf24" transparent opacity={0.6} />
        </line>
      </group>
    </>
  );
}
