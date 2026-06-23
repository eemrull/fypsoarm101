"use client";

import React, { useEffect, useRef, useState, useMemo } from "react";
import * as THREE from "three";
import { useFrame, useThree } from "@react-three/fiber";
import URDFLoader, { URDFRobot, URDFJoint } from "urdf-loader";
import {
  OrbitControls,
  Environment,
  GizmoHelper,
  GizmoViewcube,
  Sphere,
  ContactShadows,
} from "@react-three/drei";

import { LinkLabels, GripperCoordinateDisplay } from "./LinkLabels";
import { Perf } from "r3f-perf";
import {
  SCENE_SCALE,
  MAX_REACH_SCENE,
  ikToScene,
  sceneToIK,
} from "@/config/robotConstants";
import { parseURDF } from "@/lib/URDFParser";
import { GroundPlane } from "./GroundPlane";
import { robotConfigMap } from "@/config/robotConfig";
import { JointState } from "@/hooks/useRobotControl";
import {
  useRobotProfileStore,
  type RobotProfileState,
} from "@/store/useRobotProfileStore";
import { useDisplayStore, type DisplayState } from "@/store/useDisplayStore";
import { degreesToRadians } from "@/lib/utils";
import {
  useRobotStateStore,
  type RobotState,
} from "@/store/useRobotStateStore";
import { useGripperTuningStore } from "@/store/useGripperTuningStore";
import { useShallow } from "zustand/react/shallow";

import {
  Physics,
  RigidBody,
  CuboidCollider,
  RapierRigidBody,
} from "@react-three/rapier";

// Gripper link names
const GRIPPER_COLLIDER_LINK_NAMES = ["gripper", "moving_jaw_so101_v1"];
const GRIPPER_VISUAL_LINK_NAMES = [
  "gripper",
  "moving_jaw_so101_v1",
  "gripperframe",
] as const;
const GRIPPER_VISUAL_MESH_HINTS = [
  "gripper",
  "jaw",
  "moving_jaw",
  "wrist_roll_follower",
] as const;

/**
 * Module-level ref exposing the live Three.js link objects for auto-generation.
 * Updated by RobotScene when a URDF is loaded, consumed by CollisionEditorPanel.
 */
export const robotAllLinksRef: {
  current: { link: THREE.Object3D; linkName: string }[];
} = { current: [] };

/**
 * Module-level ref exposing the physics box RigidBody for pick-and-place tracking.
 * The test runner reads this to determine box position and detect drops.
 */
export const boxRigidBodyRef: {
  current: RapierRigidBody | null;
} = { current: null };

function disposeObject3D(root: THREE.Object3D) {
  root.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    child.geometry?.dispose();
    if (Array.isArray(child.material)) {
      child.material.forEach((mat) => mat.dispose());
    } else {
      child.material?.dispose();
    }
  });
}
/**
 * GripperColliders: Tracks known URDF link objects and creates
 * CuboidColliders with hardcoded dimensions derived from the URDF geometry.
 */
function GripperColliders({
  gripperLinks,
}: {
  gripperLinks: {
    link: THREE.Object3D;
    linkName: string;
  }[];
}) {
  const refs = useRef<(RapierRigidBody | null)[]>([]);

  // The values here can be wired to the tuning panel state if lifted to the parent
  // However, since we bypassed Leva by mutating state directly in the Panel,
  // we will accept the f1 and m1 state as props or extract them to a global store

  // For the sake of fixing the immediate compile error, we will establish the base physics shapes
  // that can be customized via the panel. Ideally, f1 and m1 are passed down.

  const { f1, m1 } = useGripperTuningStore();

  const dynamicConfig = [
    {
      linkName: "gripper",
      shapes: [
        {
          halfExtents: [f1.fw1, f1.fh1, f1.fd1] as [number, number, number],
          offset: [f1.fx1, f1.fy1, f1.fz1] as [number, number, number],
        },
        {
          halfExtents: [f1.fw2, f1.fh2, f1.fd2] as [number, number, number],
          offset: [f1.fx2, f1.fy2, f1.fz2] as [number, number, number],
        },
        {
          halfExtents: [f1.fw3, f1.fh3, f1.fd3] as [number, number, number],
          offset: [f1.fx3, f1.fy3, f1.fz3] as [number, number, number],
        },
        {
          halfExtents: [f1.fw4, f1.fh4, f1.fd4] as [number, number, number],
          offset: [f1.fx4, f1.fy4, f1.fz4] as [number, number, number],
        },
        {
          halfExtents: [f1.fw5, f1.fh5, f1.fd5] as [number, number, number],
          offset: [f1.fx5, f1.fy5, f1.fz5] as [number, number, number],
        },
      ],
    },
    {
      linkName: "moving_jaw_so101_v1",
      shapes: [
        {
          halfExtents: [m1.mw1, m1.mh1, m1.md1] as [number, number, number],
          offset: [m1.mx1, m1.my1, m1.mz1] as [number, number, number],
        },
        {
          halfExtents: [m1.mw2, m1.mh2, m1.md2] as [number, number, number],
          offset: [m1.mx2, m1.my2, m1.mz2] as [number, number, number],
        },
        {
          halfExtents: [m1.mw3, m1.mh3, m1.md3] as [number, number, number],
          offset: [m1.mx3, m1.my3, m1.mz3] as [number, number, number],
        },
      ],
    },
  ];

  const tempPos = useRef(new THREE.Vector3());
  const tempQuat = useRef(new THREE.Quaternion());

  useFrame(() => {
    gripperLinks.forEach(({ link }, i) => {
      const body = refs.current[i];
      if (body && link) {
        link.getWorldPosition(tempPos.current);
        link.getWorldQuaternion(tempQuat.current);

        body.setNextKinematicTranslation(tempPos.current);
        body.setNextKinematicRotation(tempQuat.current);
      }
    });
  });

  return (
    <>
      {gripperLinks.map(({ linkName }, i) => (
        <RigidBody
          key={i}
          ref={(el) => {
            refs.current[i] = el;
          }}
          type="kinematicPosition"
          colliders={false}
        >
          {dynamicConfig
            .find((d) => d.linkName === linkName)
            ?.shapes.map((shape, j) => (
              <CuboidCollider
                key={j}
                args={shape.halfExtents}
                position={shape.offset}
                friction={5} // Very high friction to grip objects firmly with contact forces
                restitution={0} // No bounciness to prevent slipping out
              />
            ))}
        </RigidBody>
      ))}
    </>
  );
}

function SceneCapture() {
  const { gl, scene, camera } = useThree();
  const profileName = useRobotProfileStore(
    (state: RobotProfileState) => state.profileName,
  );
  const thumbnailUrl = useRobotProfileStore(
    (state: RobotProfileState) => state.thumbnailUrl,
  );
  const setThumbnailUrl = useRobotProfileStore(
    (state: RobotProfileState) => state.setThumbnailUrl,
  );

  useEffect(() => {
    // Only capture if this is a custom robot and we don't already have a thumbnail
    if (profileName !== "SO-ARM101 (Default)" && !thumbnailUrl) {
      const timer = setTimeout(() => {
        try {
          // Check if the context is still valid before attempting capture
          const ctx = gl.getContext();
          if (!ctx || (ctx as WebGL2RenderingContext).isContextLost?.()) return;

          // Force a fresh frame so the canvas buffer is populated.
          // Note: toDataURL only works when preserveDrawingBuffer is true
          // on the Canvas (set in RobotLoader for custom robots).
          gl.render(scene, camera);
          const dataUrl = gl.domElement.toDataURL("image/png", 0.5);
          if (dataUrl && dataUrl.length > 100) {
            setThumbnailUrl(dataUrl);
          }
        } catch (err) {
          console.error("Failed to capture WebGL canvas thumbnail", err);
        }
      }, 2000); // Wait 2 seconds for physics/materials to settle
      return () => clearTimeout(timer);
    }
  }, [gl, scene, camera, profileName, thumbnailUrl, setThumbnailUrl]);

  return null;
}

function GhostArm({ urdfUrl }: { urdfUrl: string }) {
  const { scene } = useThree();
  const previewAngles = useRobotStateStore((state) => state.previewAngles);
  const { ikJointOrder, actuators } = useRobotProfileStore(
    useShallow((state: RobotProfileState) => ({
      ikJointOrder: state.ikJointOrder,
      actuators: state.actuators,
    })),
  );
  const profileJointNames = useRobotProfileStore(
    (state: RobotProfileState) => state.joints,
  );
  type UrdfJointMap = Record<string, URDFJoint>;

  // Animated ghost refs
  const ghostRef = useRef<THREE.Object3D | null>(null);
  const ghostLoadedRef = useRef(false);
  const ghostJointsRef = useRef<UrdfJointMap>({});

  // Static target ghost refs
  const staticRef = useRef<THREE.Object3D | null>(null);
  const staticLoadedRef = useRef(false);
  const staticJointsRef = useRef<UrdfJointMap>({});

  // Animation state
  const animT = useRef(0);
  const animDir = useRef(1);
  const ANIM_SPEED = 0.8;

  const previewJointNames = useMemo(
    () => (ikJointOrder.length > 0 ? ikJointOrder : profileJointNames),
    [ikJointOrder, profileJointNames],
  );

  // Animated ghost material (translucent amber)
  const animGhostMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: 0xffaa00,
        emissive: 0x664400,
        emissiveIntensity: 0.6,
        transparent: true,
        opacity: 0.3,
        depthWrite: false,
        roughness: 0.3,
        metalness: 0.1,
        side: THREE.DoubleSide,
      }),
    [],
  );

  // Static target ghost material (brighter, more opaque amber-orange)
  const staticGhostMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: 0xff8800,
        emissive: 0x884400,
        emissiveIntensity: 0.8,
        transparent: true,
        opacity: 0.55,
        depthWrite: false,
        roughness: 0.2,
        metalness: 0.15,
        side: THREE.DoubleSide,
      }),
    [],
  );

  useEffect(() => {
    return () => {
      animGhostMat.dispose();
      staticGhostMat.dispose();
    };
  }, [animGhostMat, staticGhostMat]);

  // Helper to load a ghost URDF
  const loadGhostUrdf = (
    url: string,
    onLoaded: (robot: URDFRobot, joints: UrdfJointMap) => void,
  ) => {
    const loader = new URDFLoader();
    loader.load(url, (robot) => {
      robot.rotateOnAxis(new THREE.Vector3(1, 0, 0), Math.PI / -2);
      robot.scale.set(SCENE_SCALE, SCENE_SCALE, SCENE_SCALE);
      robot.updateMatrixWorld(true);
      robot.visible = false;
      const joints = (robot.joints || {}) as UrdfJointMap;
      onLoaded(robot, joints);
    });
  };

  // Load animated ghost URDF
  useEffect(() => {
    if (!urdfUrl || ghostLoadedRef.current) return;
    // Abort if WebGL context is already lost to avoid wasting GPU resources
    const canvas = document.querySelector('canvas');
    const ctx = canvas?.getContext('webgl2') ?? canvas?.getContext('webgl');
    if (ctx && (ctx as WebGL2RenderingContext).isContextLost?.()) return;
    let isMounted = true;
    loadGhostUrdf(urdfUrl, (robot, joints) => {
      if (!isMounted) {
        disposeObject3D(robot);
        return;
      }
      scene.add(robot);
      ghostRef.current = robot;
      ghostJointsRef.current = joints;
      ghostLoadedRef.current = true;
    });
    return () => {
      isMounted = false;
      const ghost = ghostRef.current;
      if (ghost) {
        scene.remove(ghost);
        disposeObject3D(ghost);
        ghostRef.current = null;
      }
      ghostJointsRef.current = {};
      ghostLoadedRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urdfUrl, scene]);

  // Load static target ghost URDF
  useEffect(() => {
    if (!urdfUrl || staticLoadedRef.current) return;
    // Abort if WebGL context is already lost to avoid wasting GPU resources
    const canvas = document.querySelector('canvas');
    const ctx = canvas?.getContext('webgl2') ?? canvas?.getContext('webgl');
    if (ctx && (ctx as WebGL2RenderingContext).isContextLost?.()) return;
    let isMounted = true;
    loadGhostUrdf(urdfUrl, (robot, joints) => {
      if (!isMounted) {
        disposeObject3D(robot);
        return;
      }
      scene.add(robot);
      staticRef.current = robot;
      staticJointsRef.current = joints;
      staticLoadedRef.current = true;
    });
    return () => {
      isMounted = false;
      const staticGhost = staticRef.current;
      if (staticGhost) {
        scene.remove(staticGhost);
        disposeObject3D(staticGhost);
        staticRef.current = null;
      }
      staticJointsRef.current = {};
      staticLoadedRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urdfUrl, scene]);

  // Helper to lazily ghostify meshes
  const ghostifyMeshes = (
    root: THREE.Object3D,
    mat: THREE.Material,
    tag: string,
  ) => {
    root.traverse((child) => {
      if (child instanceof THREE.Mesh && !child.userData[tag]) {
        const previousMaterial = child.material;
        if (Array.isArray(previousMaterial)) {
          previousMaterial.forEach((existing) => {
            if (existing !== mat) existing.dispose();
          });
        } else if (previousMaterial && previousMaterial !== mat) {
          previousMaterial.dispose();
        }

        child.castShadow = false;
        child.receiveShadow = false;
        child.renderOrder = 999;
        child.material = mat;
        child.userData[tag] = true;
      }
    });
  };

  // Main animation loop
  useFrame((_state, delta) => {
    const ghost = ghostRef.current;
    const staticGhost = staticRef.current;
    const joints = ghostJointsRef.current;
    const staticJoints = staticJointsRef.current;

    // Hide everything if no preview
    if (!previewAngles) {
      if (ghost) ghost.visible = false;
      if (staticGhost) staticGhost.visible = false;
      animT.current = 0;
      animDir.current = 1;
      return;
    }

    // --- Static target ghost: always at the target pose ---
    if (staticGhost && staticJoints) {
      staticGhost.visible = true;
      ghostifyMeshes(staticGhost, staticGhostMat, "__staticGhostified");
      previewJointNames.forEach((jointName, i) => {
        if (staticJoints[jointName] && typeof previewAngles[i] === "number") {
          const offset = actuators[jointName]?.digitalTwinOffsetDeg ?? 0;
          staticJoints[jointName].setJointValue(
            (previewAngles[i] + offset) * (Math.PI / 180),
          );
        }
      });
      // Sync jaw
      const realStatesS = useRobotStateStore.getState().jointStates;
      const jawS = realStatesS.find((s) => s.name === "Jaw");
      if (staticJoints["Jaw"] && jawS && typeof jawS.degrees === "number") {
        const offset = actuators["Jaw"]?.digitalTwinOffsetDeg ?? 0;
        staticJoints["Jaw"].setJointValue((jawS.degrees + offset) * (Math.PI / 180));
      }
    }

    // --- Animated ghost: ping-pong interpolation current → target ---
    if (!ghost || !joints) return;
    ghost.visible = true;
    ghostifyMeshes(ghost, animGhostMat, "__animGhostified");

    const realStates = useRobotStateStore.getState().jointStates;
    const realDegrees: number[] = previewJointNames.map((name) => {
      const js = realStates.find((s) => s.name === name);
      if (js && typeof js.degrees === "number") return js.degrees;
      return 0;
    });

    animT.current += delta * ANIM_SPEED * animDir.current;
    if (animT.current >= 1) {
      animT.current = 1;
      animDir.current = -1;
    }
    if (animT.current <= 0) {
      animT.current = 0;
      animDir.current = 1;
    }

    const t = animT.current;
    const eased = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;

    previewJointNames.forEach((jointName, i) => {
      if (joints[jointName] && typeof previewAngles[i] === "number") {
        const offset = actuators[jointName]?.digitalTwinOffsetDeg ?? 0;
        const fromDeg = realDegrees[i];
        const toDeg = previewAngles[i];
        const interpDeg = fromDeg + (toDeg - fromDeg) * eased;
        joints[jointName].setJointValue((interpDeg + offset) * (Math.PI / 180));
      }
    });

    // Sync jaw
    if (joints["Jaw"]) {
      const jawState = realStates.find((s) => s.name === "Jaw");
      if (jawState && typeof jawState.degrees === "number") {
        const offset = actuators["Jaw"]?.digitalTwinOffsetDeg ?? 0;
        joints["Jaw"].setJointValue((jawState.degrees + offset) * (Math.PI / 180));
      }
    }
  });

  return null;
}

function CustomColliders({
  allLinks,
}: {
  allLinks: {
    link: THREE.Object3D;
    linkName: string;
  }[];
}) {
  type ColliderBox = {
    size: [number, number, number];
    offset: [number, number, number];
  };

  const linkBoundingBoxes = useRobotProfileStore(
    (state: RobotProfileState) => state.linkBoundingBoxes,
  );
  const refs = useRef<Record<string, RapierRigidBody | null>>({});
  const tempPos = useRef(new THREE.Vector3());
  const tempQuat = useRef(new THREE.Quaternion());

  // Exclude links already handled by GripperColliders to avoid duplicate RigidBodies
  const gripperSet = new Set(GRIPPER_COLLIDER_LINK_NAMES);
  const stableLinks = allLinks.filter((l) => !gripperSet.has(l.linkName));

  useFrame(() => {
    stableLinks.forEach(({ link, linkName }) => {
      const body = refs.current[linkName];
      if (body && link) {
        try {
          link.getWorldPosition(tempPos.current);
          link.getWorldQuaternion(tempQuat.current);
          body.setNextKinematicTranslation(tempPos.current);
          body.setNextKinematicRotation(tempQuat.current);
        } catch {
          // Body may have been destroyed during a React re-render transition
        }
      }
    });
  });

  return (
    <>
      {stableLinks.map(({ linkName }) => {
        let boxes: ColliderBox[] = linkBoundingBoxes[linkName] ?? [];
        if (!Array.isArray(boxes)) boxes = [boxes];

        return (
          <RigidBody
            key={linkName}
            ref={(el) => {
              refs.current[linkName] = el;
            }}
            type="kinematicPosition"
            colliders={false}
          >
            {boxes.map((box: ColliderBox, boxIdx: number) => (
              <CuboidCollider
                key={`${linkName}-${boxIdx}`}
                args={[
                  (box.size[0] / 2) * SCENE_SCALE,
                  (box.size[1] / 2) * SCENE_SCALE,
                  (box.size[2] / 2) * SCENE_SCALE,
                ]}
                position={[
                  box.offset[0] * SCENE_SCALE,
                  box.offset[1] * SCENE_SCALE,
                  box.offset[2] * SCENE_SCALE,
                ]}
                friction={1}
                restitution={0}
              />
            ))}
          </RigidBody>
        );
      })}
    </>
  );
}

function SkeletonOverlay({
  robotOpacity,
}: {
  robotOpacity: number;
  isConnected?: boolean;
}) {
  // Read joint positions directly from the Three.js scene graph.
  // This ensures the skeleton always matches the actual rendered URDF links,
  // eliminating drift between mathematical FK and visual rendering.
  const SKELETON_LINK_NAMES = [
    "baseframe",
    "shoulder",
    "upper_arm",
    "lower_arm",
    "wrist",
    "gripper",
  ];

  const groupRef = useRef<THREE.Group>(null!);
  const positionsRef = useRef<THREE.Vector3[]>(
    SKELETON_LINK_NAMES.map(() => new THREE.Vector3()),
  );
  // Use a ref instead of useState to track whether links are available.
  // Calling setState inside useFrame causes infinite re-render loops (React Error #185)
  // because each render triggers a new frame which triggers another setState.
  const hasLinksRef = useRef(false);
  const [, forceRender] = React.useState(0);
  const lastLinksStateRef = useRef(false);

  useFrame(() => {
    if (robotOpacity >= 0.99) return;
    const links = robotAllLinksRef.current;
    const linksAvailable = links.length > 0;

    // Only trigger a single React re-render when the links state *transitions*
    if (linksAvailable !== lastLinksStateRef.current) {
      lastLinksStateRef.current = linksAvailable;
      hasLinksRef.current = linksAvailable;
      // Debounce the re-render to avoid storms — schedule outside the frame
      Promise.resolve().then(() => forceRender((v) => v + 1));
    }

    if (!linksAvailable) return;

    SKELETON_LINK_NAMES.forEach((name, i) => {
      const entry = links.find(
        (l) => l.linkName.toLowerCase() === name.toLowerCase(),
      );
      if (entry) {
        entry.link.getWorldPosition(positionsRef.current[i]);
      }
    });

    // Update child meshes directly (avoid React re-renders)
    if (!groupRef.current) return;
    const children = groupRef.current.children;
    // First child: mathematical origin sphere (positioned at base)
    if (children[0]) children[0].position.copy(positionsRef.current[0]);
    // Note: children[1] is the reach sphere, which has a static elevated position,
    // so we do NOT override its position here.

    // Line geometry: update positions
    const lineChild = children[2] as THREE.Line;
    if (lineChild?.geometry) {
      const positions = new Float32Array(SKELETON_LINK_NAMES.length * 3);
      positionsRef.current.forEach((p, i) => {
        positions[i * 3] = p.x;
        positions[i * 3 + 1] = p.y;
        positions[i * 3 + 2] = p.z;
      });
      lineChild.geometry.setAttribute(
        "position",
        new THREE.BufferAttribute(positions, 3),
      );
      lineChild.geometry.attributes.position.needsUpdate = true;
    }
    // Joint spheres: positioned after line
    for (let i = 0; i < SKELETON_LINK_NAMES.length; i++) {
      const sphere = children[3 + i];
      if (sphere) sphere.position.copy(positionsRef.current[i]);
    }
  });

  if (robotOpacity >= 0.99 || !hasLinksRef.current) return null;

  // Initial positions — will be updated by useFrame immediately
  const initPos: [number, number, number] = [0, 0, 0];

  return (
    <group ref={groupRef}>
      {/* Mathematical Origin (Base Pivot) */}
      <Sphere args={[0.015 * SCENE_SCALE]} position={initPos}>
        <meshBasicMaterial color="#ef4444" transparent opacity={0.8} />
      </Sphere>

      {/* Maximum Physical Reach boundary sphere 
          Centered at the conceptual height of the shoulder pitch joint (Z=0.119m in URDF), 
          not the base table, so it properly envelops the arm even when pointing straight up.
      */}
      <Sphere
        args={[MAX_REACH_SCENE, 32, 32]}
        position={ikToScene(0, 0, 0.119)}
      >
        <meshBasicMaterial
          color="#3b82f6"
          wireframe
          transparent
          opacity={0.06}
          side={THREE.DoubleSide}
        />
      </Sphere>

      <line>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            args={[new Float32Array(SKELETON_LINK_NAMES.length * 3), 3]}
          />
        </bufferGeometry>
        <lineBasicMaterial color="#10b981" linewidth={1} />
      </line>

      {SKELETON_LINK_NAMES.map((_, i) => (
        <Sphere key={i} args={[0.01 * SCENE_SCALE]} position={initPos}>
          <meshBasicMaterial color="#10b981" transparent opacity={0.9} />
        </Sphere>
      ))}
    </group>
  );
}

export type JointDetails = {
  name: string;
  servoId: number;
  limit: {
    lower?: number;
    upper?: number;
  };
  jointType: "revolute" | "continuous";
};

type RobotSceneProps = {
  robotName: string;
  urdfUrl: string;
  orbitTarget?: [number, number, number];
  isConnected?: boolean;
  setJointDetails: (details: JointDetails[]) => void;
  boxConfig?: {
    position: [number, number, number];
    size: [number, number, number];
    color: string;
  };
  boxKey?: number;
  overrideJointStates?: JointState[];

};

/**
 * Isolated IK target visualizer — prevents ikTargetPose changes from
 * triggering a full RobotScene re-render.
 */
function IKTargetVisualizer({ showIKTarget }: { showIKTarget: boolean }) {
  const groupRef = useRef<THREE.Group>(null!);
  const _worldPos = useRef(new THREE.Vector3());

  // Read directly from the gripper link's world position each frame.
  // This bypasses the throttled endEffectorPosition store and always reflects
  // the live Three.js transform — no lag, no floating.
  useFrame(() => {
    if (!showIKTarget || !groupRef.current) return;
    const gripperEntry = robotAllLinksRef.current.find(
      (l) => l.linkName.toLowerCase() === "gripperframe",
    );
    if (!gripperEntry) return;
    gripperEntry.link.getWorldPosition(_worldPos.current);
    groupRef.current.position.copy(_worldPos.current);
  });

  if (!showIKTarget) return null;

  return (
    <group ref={groupRef}>
      {/* The physical tracking point sphere */}
      <Sphere args={[0.012 * SCENE_SCALE, 16, 16]}>
        <meshBasicMaterial color="#ef4444" transparent opacity={0.9} />
      </Sphere>
    </group>
  );
}


export const RobotScene = React.memo(function RobotScene({
  robotName,
  urdfUrl,
  orbitTarget,
  isConnected,
  setJointDetails,
  boxConfig = {
    position: [0.30, 0, 0.015], // URDF: X=0.30, Y=0, Z=0.015 (cube sits on ground)
    size: [0.03, 0.03, 0.03], // 3cm physical cube
    color: "#6366f1",
  },
  boxKey = 0,
  overrideJointStates,

}: RobotSceneProps) {
  const { scene } = useThree();
  const robotRef = useRef<URDFRobot | null>(null);
  const drillMeshRef = useRef<THREE.Mesh | null>(null);
  const { activeTool, fakeGraspSettings } = useRobotProfileStore(
    useShallow((state: RobotProfileState) => ({
      activeTool: state.activeTool,
      fakeGraspSettings: state.fakeGraspSettings,
    })),
  );
  const profileActuators = useRobotProfileStore(
    (state: RobotProfileState) => state.actuators,
  );
  const [baseJointDetails, setBaseJointDetails] = useState<JointDetails[]>([]);
  const [gripperLinks, setGripperLinks] = useState<
    { link: THREE.Object3D; linkName: string }[]
  >([]);
  const [allLinks, setAllLinks] = useState<
    { link: THREE.Object3D; linkName: string }[]
  >([]);
  const [isRobotLoaded, setIsRobotLoaded] = useState(false);

  const boxRef = useRef<RapierRigidBody>(null);
  // Bundle all display store reads into a single useShallow selector
  // to prevent multiple independent re-renders when multiple values change.
  const {
    physicsDebug,
    showShadows,
    environment,
    robotOpacity,
    showPerf,
    showIKTarget,

    showLinkLabels,
    showGripperCoords,
  } = useDisplayStore(
    useShallow((state: DisplayState) => ({
      physicsDebug: state.physicsDebug,
      showShadows: state.showShadows,
      environment: state.environment,
      robotOpacity: state.robotOpacity,
      showPerf: state.showPerf,
      showIKTarget: state.showIKTarget,

      showLinkLabels: state.showLinkLabels,
      showGripperCoords: state.showGripperCoords,
    })),
  );
  const setEndEffectorPosition = useRobotStateStore(
    (state: RobotState) => state.setEndEffectorPosition,
  );
  const activeToolName =
    typeof activeTool?.name === "string" ? activeTool.name : "";
  const isDrillTool =
    activeTool.type === "drill" ||
    activeToolName.toLowerCase().includes("drill");

  // Throttler for store updates to prevent React state trashing
  const lastStoreUpdateRef = useRef<number>(0);

  // Pre-allocate objects for end-effector tracking
  const eePosRef = useRef(new THREE.Vector3());
  const lastIkPosRef = useRef<[number, number, number] | null>(null);
  const lastToolVisibilityEnforceMsRef = useRef(0);
  
  // Fake Grasping state
  const isBoxAttachedRef = useRef(false);
  const boxAttachOffsetPosRef = useRef(new THREE.Vector3());
  const boxMeshRef = useRef<THREE.Mesh>(null);
  const detectionZoneRef = useRef<THREE.Mesh>(null);

  useEffect(() => {
    const manager = new THREE.LoadingManager();
    const loader = new URDFLoader(manager);
    let isMounted = true;
    let loadedRobot: URDFRobot | null = null;

    loader.load(
      urdfUrl,
      (robot) => {
        if (!isMounted) {
          disposeObject3D(robot);
          return;
        }

        // Auto-extract semantics to the global profile store
        fetch(urdfUrl)
          .then((res) => res.text())
          .then((text) => {
            if (!isMounted) return;
            const parsed = parseURDF(text);
            useRobotProfileStore.getState().setKinematics(
              parsed.joints,
              parsed.links,
              parsed.linkLengths,
              parsed.ikJointOrder,
              parsed.ikNodes,
              parsed.jointLimits,
            );
          })
          .catch((err) => console.error("Failed to fetch/parse URDF XML", err));

        loadedRobot = robot;
        robotRef.current = robot;

        const details: JointDetails[] = robot.joints
          ? Object.values(robot.joints)
              .filter(
                (
                  joint,
                ): joint is URDFJoint & {
                  jointType: "revolute" | "continuous";
                } =>
                  joint.jointType === "revolute" ||
                  joint.jointType === "continuous",
              )
              .map((joint) => ({
                name: joint.name,
                servoId:
                  robotConfigMap[robotName]?.jointNameIdMap?.[joint.name] ?? -1,
                limit: {
                  lower:
                    joint.limit.lower === undefined
                      ? undefined
                      : Number(joint.limit.lower),
                  upper:
                    joint.limit.upper === undefined
                      ? undefined
                      : Number(joint.limit.upper),
                },
                jointType: joint.jointType,
              }))
          : [];
        setBaseJointDetails(details);

        robot.rotateOnAxis(new THREE.Vector3(1, 0, 0), Math.PI / -2);
        robot.updateMatrixWorld(true);
        robot.scale.set(SCENE_SCALE, SCENE_SCALE, SCENE_SCALE);
        robot.updateMatrixWorld(true);

        // Find gripper links by name
        const foundLinks: {
          link: THREE.Object3D;
          linkName: string;
        }[] = [];
        GRIPPER_COLLIDER_LINK_NAMES.forEach((linkName) => {
          robot.traverse((c) => {
            if (c.name === linkName) {
              foundLinks.push({ link: c, linkName });
            }
          });
        });
        setGripperLinks(foundLinks);

        const allFoundLinks: { link: THREE.Object3D; linkName: string }[] = [];
        robot.traverse((c) => {
          const maybeUrdfLink = c as THREE.Object3D & { isURDFLink?: boolean };
          if (c.type === "URDFLink" || maybeUrdfLink.isURDFLink) {
            allFoundLinks.push({
              link: c,
              linkName: typeof c.name === "string" ? c.name : "",
            });
          }
        });
        setAllLinks(allFoundLinks);
        robotAllLinksRef.current = allFoundLinks;

        // Enable shadows on all meshes immediately at load time
        const currentShadows = useDisplayStore.getState().showShadows;
        robot.traverse((child) => {
          if (child instanceof THREE.Mesh) {
            child.castShadow = currentShadows;
            child.receiveShadow = currentShadows;
          }
        });

        scene.add(robot);
        setIsRobotLoaded(true);
      },
      undefined,
      (error) => console.error("Error loading URDF:", error),
    );

    return () => {
      isMounted = false;
      robotAllLinksRef.current = [];
      if (loadedRobot) {
        scene.remove(loadedRobot);
        loadedRobot.traverse((child) => {
          if (!(child instanceof THREE.Mesh)) return;
          if (child.geometry) {
            child.geometry.dispose();
          }
          if (Array.isArray(child.material)) {
            child.material.forEach((mat: THREE.Material) => mat.dispose());
          } else if (child.material) {
            (child.material as THREE.Material).dispose();
          }
        });
      }

      if (drillMeshRef.current) {
        drillMeshRef.current.geometry.dispose();
        (drillMeshRef.current.material as THREE.Material).dispose();
        drillMeshRef.current = null;
      }
    };
  }, [robotName, urdfUrl, scene]); // Removed setJointDetails from deps to avoid loop if it changes

  // Apply display toggles (Shadows, Opacity) to the loaded URDF meshes.
  useEffect(() => {
    if (!isRobotLoaded || !robotRef.current) return;

    robotRef.current.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.castShadow = showShadows;
        child.receiveShadow = showShadows;

        if (child.material) {
          const materials = Array.isArray(child.material)
            ? child.material
            : [child.material];
          materials.forEach((mat: THREE.Material) => {
            mat.transparent = true;
            mat.opacity = robotOpacity;
            mat.depthWrite = robotOpacity >= 0.99;
            mat.needsUpdate = true;
          });
        }
      }
    });
    if (drillMeshRef.current) {
      drillMeshRef.current.castShadow = showShadows;
      drillMeshRef.current.receiveShadow = showShadows;
    }
  }, [showShadows, robotOpacity, isRobotLoaded]);

  // Toggle tool-head visuals and drill mesh.
  useEffect(() => {
    if (!isRobotLoaded || !robotRef.current) return;

    const setMeshVisibilityRecursively = (
      root: THREE.Object3D | null | undefined,
      visible: boolean,
      skipMesh?: THREE.Mesh | null,
    ) => {
      if (!root) return;
      root.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          if (skipMesh && obj === skipMesh) {
            return;
          }
          obj.visible = visible;
        }
      });
    };

    const setGripperVisibility = (visible: boolean) => {
      const drillMesh = drillMeshRef.current;
      GRIPPER_VISUAL_LINK_NAMES.forEach((linkName) => {
        const link = robotRef.current?.getObjectByName(linkName);
        setMeshVisibilityRecursively(link, visible, drillMesh);
      });

      // Fallback for URDFs where gripper/jaw meshes are not grouped as expected.
      robotRef.current?.traverse((child) => {
        if (!(child instanceof THREE.Mesh)) return;
        if (drillMesh && child === drillMesh) return;
        const lowerName =
          typeof child.name === "string" ? child.name.toLowerCase() : "";
        if (
          GRIPPER_VISUAL_MESH_HINTS.some((hint) => lowerName.includes(hint))
        ) {
          child.visible = visible;
        }
      });
    };

    const removeDrillMesh = () => {
      if (!drillMeshRef.current) return;
      if (drillMeshRef.current.parent) {
        drillMeshRef.current.parent.remove(drillMeshRef.current);
      }
      drillMeshRef.current.geometry.dispose();
      (drillMeshRef.current.material as THREE.Material).dispose();
      drillMeshRef.current = null;
    };

    if (isDrillTool) {
      if (!drillMeshRef.current) {
        const geometry = new THREE.CylinderGeometry(0.015, 0.015, 0.1, 32);
        geometry.rotateX(Math.PI / 2);
        geometry.translate(0, 0, -0.05);

        const material = new THREE.MeshStandardMaterial({
          color: "#22c55e",
          metalness: 0.2,
          roughness: 0.1,
          transparent: false,
          opacity: 1,
          depthWrite: true,
          side: THREE.FrontSide,
        });
        const drill = new THREE.Mesh(geometry, material);
        drill.castShadow = showShadows;
        drill.receiveShadow = showShadows;

        drillMeshRef.current = drill;
      }
      drillMeshRef.current.visible = true;

      const attachPoint = robotRef.current.getObjectByName("gripper");
      if (attachPoint && drillMeshRef.current.parent !== attachPoint) {
        attachPoint.add(drillMeshRef.current);
      }
      setGripperVisibility(false);
    } else {
      setGripperVisibility(true);
      removeDrillMesh();
    }
  }, [isDrillTool, isRobotLoaded, showShadows]);

  // Re-calculate the published joint details dynamically depending on the active tool
  useEffect(() => {
    let finalDetails = baseJointDetails.map((joint, index) => {
      const configuredHardwareId = profileActuators[joint.name]?.hardwareId;
      const parsedConfiguredId =
        typeof configuredHardwareId === "number" ||
        typeof configuredHardwareId === "string"
          ? Number(configuredHardwareId)
          : NaN;
      const fallbackServoId =
        robotConfigMap[robotName]?.jointNameIdMap?.[joint.name] ??
        joint.servoId ??
        index + 1;

      return {
        ...joint,
        servoId:
          Number.isFinite(parsedConfiguredId) && parsedConfiguredId > 0
            ? parsedConfiguredId
            : fallbackServoId,
      };
    });

    // If we have a drill, the default Gripper/Jaw joint is hidden, so we can replace it with the Drill
    if (isDrillTool) {
      finalDetails = finalDetails.filter((j) => j.name !== "Jaw"); // Remove default gripper UI
      finalDetails.push({
        name: "drill_spin",
        servoId: Number(activeTool.hardwareId),
        limit: {}, // drill spins infinitely
        jointType: "continuous",
      });
    }

    // Delay the parent state update to the end of the event loop
    // to prevent "Cannot update a component (`Loader`) while rendering a different component (`EnvironmentCube`)"
    const t = setTimeout(() => {
      setJointDetails(finalDetails);
    }, 0);

    return () => clearTimeout(t);
  }, [
    activeTool.hardwareId,
    baseJointDetails,
    isDrillTool,
    profileActuators,
    robotName,
    setJointDetails,
  ]);

  useFrame((_, delta) => {
    if (robotRef.current && robotRef.current.joints) {
      const storeState = useRobotStateStore.getState();
      const hasFeedback = storeState.feedbackStates.length > 0;
      const activeStates: JointState[] =
        overrideJointStates ||
        (hasFeedback ? storeState.feedbackStates : storeState.jointStates);

      let drillSpinSpeed = 0;

      // When driven by real servo feedback, snap directly to the reported
      // position so overshoot, oscillation, and wobble are faithfully
      // reproduced. When driven by UI slider commands only (no feedback),
      // use smooth lerp for fluid animation during manual dragging.
      const useLerp = !hasFeedback && !overrideJointStates;
      const lerpFactor = useLerp ? Math.min(1, 12 * delta) : 1;

      // Use indexed for-loop instead of forEach to avoid closure allocation per frame
      const joints = robotRef.current!.joints;
      for (let i = 0; i < activeStates.length; i++) {
        const js = activeStates[i];
        if (js.name === "drill_spin" && typeof js.speed === "number") {
          drillSpinSpeed = js.speed;
        }

        const jointObj = joints[js.name];
        if (jointObj) {
          if (
            js.degrees !== undefined &&
            typeof js.degrees === "number" &&
            jointObj.jointType !== "continuous"
          ) {
            const visualOffset = profileActuators[js.name]?.digitalTwinOffsetDeg ?? 0;
            const targetRad = degreesToRadians(js.degrees + visualOffset);
            if (lerpFactor >= 1) {
              jointObj.setJointValue(targetRad);
            } else {
              const currentRad = Number(jointObj.angle) || 0;
              const newRad = currentRad + (targetRad - currentRad) * lerpFactor;
              jointObj.setJointValue(newRad);
            }
          } else if (
            js.speed !== undefined &&
            typeof js.speed === "number" &&
            jointObj.jointType === "continuous"
          ) {
            const currentAngle = Number(jointObj.angle) || 0;
            jointObj.setJointValue(currentAngle + (js.speed * delta) / 500);
          }
        }
      }

      if (isDrillTool && drillMeshRef.current && drillSpinSpeed !== 0) {
        // Drive the synthetic drill mesh from drill_spin speed command.
        drillMeshRef.current.rotateZ(drillSpinSpeed * delta * 0.01);
      }

      if (isDrillTool) {
        // URDF sub-meshes can stream in after first render on refresh; enforce hiding repeatedly.
        const now = performance.now();
        if (now - lastToolVisibilityEnforceMsRef.current > 250) {
          lastToolVisibilityEnforceMsRef.current = now;
          const drillMesh = drillMeshRef.current;

          GRIPPER_VISUAL_LINK_NAMES.forEach((linkName) => {
            const link = robotRef.current?.getObjectByName(linkName);
            if (!link) return;
            link.traverse((obj) => {
              if (!(obj instanceof THREE.Mesh)) return;
              if (drillMesh && obj === drillMesh) return;
              obj.visible = false;
            });
          });

          robotRef.current.traverse((obj) => {
            if (!(obj instanceof THREE.Mesh)) return;
            if (drillMesh && obj === drillMesh) return;
            const lowerName =
              typeof obj.name === "string" ? obj.name.toLowerCase() : "";
            if (
              GRIPPER_VISUAL_MESH_HINTS.some((hint) => lowerName.includes(hint))
            ) {
              obj.visible = false;
            }
          });
        }
      }

      // --- END-EFFECTOR POSITION TRACKING ---
      // Read gripperframe link position directly from the live scene-graph ref.
      // Uses robotAllLinksRef (always fresh) rather than allLinks (React state,
      // which can be stale during animation frames).
      const gripperFrameEntry = robotAllLinksRef.current.find(
        (l) => l.linkName.toLowerCase() === "gripperframe",
      );
      if (gripperFrameEntry) {
        const now = performance.now();
        if (now - lastStoreUpdateRef.current > 100) {
          gripperFrameEntry.link.getWorldPosition(eePosRef.current);

          const ikPos = sceneToIK(
            eePosRef.current.x,
            eePosRef.current.y,
            eePosRef.current.z,
          );

          const newPos: [number, number, number] = [
            Number(ikPos[0].toFixed(3)),
            Number(ikPos[1].toFixed(3)),
            Number(ikPos[2].toFixed(3)),
          ];

          const lastPos = lastIkPosRef.current;
          if (
            !lastPos ||
            Math.abs(lastPos[0] - newPos[0]) > 0.001 ||
            Math.abs(lastPos[1] - newPos[1]) > 0.001 ||
            Math.abs(lastPos[2] - newPos[2]) > 0.001
          ) {
            setEndEffectorPosition(newPos);
            lastIkPosRef.current = newPos;
          }

          lastStoreUpdateRef.current = now;
        }

        // --- FAKE GRASPING (KINEMATIC ATTACHMENT) ---
        if (boxRigidBodyRef.current && fakeGraspSettings.enabled) {
          const jawState = useRobotStateStore.getState().jointStates.find((s) => s.name === "Jaw");
          const jawDeg = jawState && typeof jawState.degrees === "number" ? jawState.degrees : 180;
          
          // Use the raw joint angle for the threshold check.
          // This ensures the attachment triggers based on the waypoint values (raw commands).
          const isGripperClosed = jawDeg < fakeGraspSettings.thresholdAngle;

          const gripperPos = new THREE.Vector3();
          const gripperQuat = new THREE.Quaternion();
          gripperFrameEntry.link.getWorldPosition(gripperPos);
          gripperFrameEntry.link.getWorldQuaternion(gripperQuat);

          // Apply user nudge to the trigger point (the blue sphere center)
          const calibOffset = new THREE.Vector3(...fakeGraspSettings.attachOffset);
          const nudgedGripperPos = gripperPos.clone().add(calibOffset.clone().applyQuaternion(gripperQuat));

          const boxPosRaw = boxRigidBodyRef.current.translation();
          const boxPos = new THREE.Vector3(boxPosRaw.x, boxPosRaw.y, boxPosRaw.z);

          if (isGripperClosed && !isBoxAttachedRef.current) {
            const dist = nudgedGripperPos.distanceTo(boxPos);
            if (dist < fakeGraspSettings.distanceThreshold) { 
              isBoxAttachedRef.current = true;
              boxRigidBodyRef.current.setBodyType(2, true); // KinematicPositionBased
              
              // Capture the relative offset in the gripper's LOCAL space
              const worldToLocal = new THREE.Matrix4().copy(gripperFrameEntry.link.matrixWorld).invert();
              boxAttachOffsetPosRef.current.copy(boxPos).applyMatrix4(worldToLocal);
            }
          } else if (!isGripperClosed && isBoxAttachedRef.current) {
            isBoxAttachedRef.current = false;
            boxRigidBodyRef.current.setBodyType(0, true); // Dynamic
          }

          if (isBoxAttachedRef.current) {
            // Apply the captured local offset back to world space
            const nextPos = boxAttachOffsetPosRef.current.clone()
              .applyMatrix4(gripperFrameEntry.link.matrixWorld);
              
            boxRigidBodyRef.current.setNextKinematicTranslation(nextPos);
            boxRigidBodyRef.current.setNextKinematicRotation(gripperQuat);
            
            // Visual feedback: Pulsing RED when attached
            if (boxMeshRef.current && boxMeshRef.current.material) {
              const mat = boxMeshRef.current.material as THREE.MeshStandardMaterial;
              mat.emissive.set(0xff0000);
              mat.emissiveIntensity = 0.5 + Math.sin(Date.now() * 0.01) * 0.5;
            }
          } else {
            // Check for POTENTIAL grab (Yellow glow)
            const dist = nudgedGripperPos.distanceTo(boxPos);
            const inRange = dist < fakeGraspSettings.distanceThreshold;

            if (boxMeshRef.current && boxMeshRef.current.material) {
              const mat = boxMeshRef.current.material as THREE.MeshStandardMaterial;
              if (inRange) {
                mat.emissive.set(0xffff00); // Yellow
                mat.emissiveIntensity = 0.4 + Math.sin(Date.now() * 0.01) * 0.2;
              } else {
                mat.emissive.set(0x000000);
                mat.emissiveIntensity = 0;
              }
            }
          }
        }

        // --- DETECTION ZONE VISUALIZER ---
        if (detectionZoneRef.current) {
          const jawState = useRobotStateStore.getState().jointStates.find((s) => s.name === "Jaw");
          const jawDeg = jawState && typeof jawState.degrees === "number" ? jawState.degrees : 180;
          const isThresholdMet = jawDeg < fakeGraspSettings.thresholdAngle;
          
          // Only show when gripper is "ready to grab" but NOT yet attached
          detectionZoneRef.current.visible = isThresholdMet && fakeGraspSettings.enabled && !isBoxAttachedRef.current;
          
          if (detectionZoneRef.current.visible) {
            const pos = new THREE.Vector3();
            const quat = new THREE.Quaternion();
            gripperFrameEntry.link.getWorldPosition(pos);
            gripperFrameEntry.link.getWorldQuaternion(quat);

            // Center the blue sphere on the NUDGED position (the actual grab trigger)
            const nudge = new THREE.Vector3(...fakeGraspSettings.attachOffset);
            const nudgedPos = pos.clone().add(nudge.applyQuaternion(quat));
            
            detectionZoneRef.current.position.copy(nudgedPos);
            detectionZoneRef.current.scale.setScalar(fakeGraspSettings.distanceThreshold);
          }
        }
      }
    }
  });

  return (
    <>
      {showPerf && <Perf position="bottom-left" className="!z-50" />}
      <OrbitControls
        makeDefault
        target={orbitTarget || [0, 0.1, 0.1]}
        enableDamping
        dampingFactor={0.08}
      />
      <GizmoHelper alignment="bottom-right" margin={[80, 80]}>
        <GizmoViewcube />
      </GizmoHelper>

      <SkeletonOverlay robotOpacity={robotOpacity} isConnected={isConnected} />

      <Physics debug={physicsDebug}>
        <GroundPlane />
        {showShadows && (
          <ContactShadows
            position={[0, 0.001, 0]}
            opacity={0.4}
            scale={15}
            blur={2.5}
            far={4}
            resolution={256}
            color="#1e1b4b"
          />
        )}
        {environment && <Environment preset={environment} />}
        {physicsDebug && <axesHelper args={[20]} />}

        {!isDrillTool && gripperLinks.length > 0 && (
          <GripperColliders gripperLinks={gripperLinks} />
        )}

        {allLinks.length > 0 && <CustomColliders allLinks={allLinks} />}

        {isRobotLoaded && <GhostArm urdfUrl={urdfUrl} />}
        <SceneCapture />

        {/* â”€â”€ 3-Point Studio Lighting â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}

        {/* Key light (warm, slightly right & front) */}
        <directionalLight
          castShadow
          intensity={1.8}
          position={[5, 12, 8]}
          color="#fef3c7"
          shadow-mapSize-width={1024}
          shadow-mapSize-height={1024}
          shadow-camera-far={50}
          shadow-camera-left={-10}
          shadow-camera-right={10}
          shadow-camera-top={10}
          shadow-camera-bottom={-10}
          shadow-bias={-0.0005}
        />

        {/* Fill light (cool, left side, no shadows) */}
        <directionalLight
          intensity={0.6}
          position={[-8, 8, -4]}
          color="#bfdbfe"
        />

        {/* Rim / back light (subtle, behind) */}
        <directionalLight
          intensity={0.4}
          position={[0, 6, -10]}
          color="#e0e7ff"
        />

        {/* Soft ambient fill */}
        <ambientLight intensity={0.35} color="#f8fafc" />

        {/* Hemisphere: sky/ground color gradient for natural feel */}
        <hemisphereLight
          intensity={0.3}
          color="#cbd5e1"
          groundColor="#1e293b"
        />

        {/* Thick invisible floor barrier to prevent box from falling below ground */}
        <RigidBody type="fixed" position={[0, -5, 0]} colliders={false}>
          <CuboidCollider args={[50, 5, 50]} />
        </RigidBody>

        {/* End-Effector Traveled Target Visualizer (isolated component) */}
        <IKTargetVisualizer showIKTarget={showIKTarget} />


        {/* Floating link name labels */}
        {showLinkLabels && allLinks.length > 0 && (
          <LinkLabels links={allLinks} />
        )}

        {/* Gripper coordinate display (separate toggle) */}
        {showGripperCoords && allLinks.length > 0 && (
          <GripperCoordinateDisplay
            gripperLink={
              allLinks.find((l) => l.linkName.toLowerCase() === "gripperframe")
                ?.link ?? null
            }
          />
        )}
        {/* Latency HUD badge (only visible when connected) */}

        {/* Physics Box */}
        <RigidBody
          ref={(el) => {
            boxRef.current = el;
            boxRigidBodyRef.current = el;
          }}
          key={`box-${boxKey}-${boxConfig.position.join(",")}-${boxConfig.size.join(",")}`}
          position={ikToScene(
            boxConfig.position[0],
            boxConfig.position[1],
            boxConfig.position[2],
          )}
          colliders="cuboid"
          restitution={0} // Stop the box from bouncing out of the grip
          friction={5} // Very high friction to match jaw colliders for solid grip
          mass={0.5} // Heavier mass for more stable contact forces
          ccd={true} // Continuous Collision Detection prevents the box tunneling through fast kinematic fingers
          linearDamping={8} // High damping prevents the box from shooting out between jaws
          angularDamping={8} // Prevents the box from spinning out of control
        >
          <mesh ref={boxMeshRef} castShadow receiveShadow>
            <boxGeometry
              args={[
                boxConfig.size[0] * SCENE_SCALE,
                boxConfig.size[2] * SCENE_SCALE, // Z in URDF is Y (height) in Scene
                boxConfig.size[1] * SCENE_SCALE, // Y in URDF is Z (depth) in Scene
              ]}
            />
            <meshStandardMaterial color={boxConfig.color} />
          </mesh>
        </RigidBody>
        {/* Detection zone visualizer (radius of distanceThreshold) */}
        <mesh ref={detectionZoneRef} visible={false}>
          <sphereGeometry args={[1, 32, 32]} />
          <meshBasicMaterial color="#3b82f6" wireframe transparent opacity={0.2} />
          {/* Core dot for precise alignment */}
          <mesh>
            <sphereGeometry args={[0.15, 8, 8]} />
            <meshBasicMaterial color="#60a5fa" transparent opacity={0.8} />
          </mesh>
        </mesh>
      </Physics>
    </>
  );
});
