/**
 * Diagnostic: Compare what the FK model thinks the gripper position is
 * vs what the URDF renderer in Three.js actually produces.
 * 
 * The URDF has a fixed joint "world_to_base" that offsets the entire robot.
 * The FK model starts from the Rotation joint (which already accounts for
 * the world_to_base offset in its trans). But the Three.js URDF renderer
 * starts from the world link and includes world_to_base.
 * 
 * The marker reads gripperframe's WORLD position from Three.js — which
 * includes the world_to_base offset. But sceneToIK divides by SCENE_SCALE
 * and assumes the result maps directly to the FK model's coordinate system.
 * If the FK model's origin is at the Rotation joint (not at the world link),
 * then sceneToIK needs to subtract the world_to_base offset!
 */
import {
  computeForwardKinematics,
  SO101_URDF_PARAMETERS,
} from "../lib/kinematics/IKSolver";

const deg2rad = (deg: number) => (deg * Math.PI) / 180;
const SCENE_SCALE = 15;

// FK model's home position end-effector (IK space)
const homeAnglesRad = [180, 180, 180, 180, 180].map(deg2rad);
const transforms = computeForwardKinematics(
  homeAnglesRad,
  SO101_URDF_PARAMETERS,
  [0, 0, -0.087],
);
const fkEE = transforms[transforms.length - 1];
const fkIK = [fkEE[0][3], fkEE[1][3], fkEE[2][3]];
console.log("FK model home EE (IK space):", fkIK.map(v => v.toFixed(6)));

// FK model's EE in scene space: ikToScene(x,y,z) = (x*S, z*S, -y*S)
const fkScene = [fkIK[0] * SCENE_SCALE, fkIK[2] * SCENE_SCALE, -fkIK[1] * SCENE_SCALE];
console.log("FK model home EE (scene space):", fkScene.map(v => v.toFixed(4)));

// Now simulate what Three.js scene would have:
// The URDF loads with world_to_base at xyz="0.163038 0.168068 -0.0300817"
// BUT the RobotScene likely scales the robot by SCENE_SCALE and rotates it.

// The FK model starts accumulating from identity matrix.
// The FK's first node trans = [0.038836, 0.0, 0.0648]
// This is the Rotation joint position relative to world origin.

// In the URDF:
// world -> base: xyz="0.163038 0.168068 -0.0300817" rpy="0 0 0"
// base -> Rotation: xyz="-0.124202 -0.168068 0.0948817" rpy="3.14159 0 0"
// So Rotation position from world = (0.163038 + (-0.124202), 0.168068 + (-0.168068), -0.0300817 + 0.0948817)
//                                 = (0.038836, 0.0, 0.0648)
// This matches FK node 0 trans! ✓

// BUT: when Three.js urdf-loader loads the URDF, it creates a scene graph:
// world (Object3D) -> base (Object3D) -> shoulder (via Rotation joint) -> ...
// The robot model's root position in Three.js scene depends on where it's placed.
// The robot is likely placed at the scene origin (0,0,0) or with some offset.

// Let me check: if the robot is placed at origin, the gripperframe's world position
// in Three.js would include the world_to_base offset.

// The FK model doesn't use world_to_base at all — it starts from identity.
// That means FK and Three.js would disagree UNLESS the scene compensates.

// Let me compute what Three.js would produce:
// In Three.js, the URDF's "world" link is at position (0,0,0) in the robot group.
// The robot group is then scaled by SCENE_SCALE and rotated -90° around X.

// world_to_base: xyz="0.163038 0.168068 -0.0300817"
// This means the base link is offset from world by this much (in URDF space)
// Then Rotation joint is offset from base by xyz="-0.124202 -0.168068 0.0948817"
// Net Rotation position from world = (0.038836, 0, 0.0648) (matches FK) ✓

// So the FK's origin IS the world link origin. Good.

// But wait - where is the robot group placed in the Three.js scene?
// If the robot group is at (0,0,0), then:
//   Three.js gripperframe world pos = Rotation_to_gripper (from FK) with world_to_base applied
// 
// Actually NO. The FK already accounts for the world_to_base implicitly through its node transforms.
// The FK node 0 trans [0.038836, 0, 0.0648] IS the Rotation joint position from the world origin.
// So the FK chain from identity IS the chain from world link to end-effector.
// The gripperframe in Three.js would be at the same position (times SCENE_SCALE, rotated).

// Let me verify by computing what sceneToIK would give for the FK-expected scene position:
const sceneToIK = (sx: number, sy: number, sz: number): [number, number, number] => {
  return [sx / SCENE_SCALE, -sz / SCENE_SCALE, sy / SCENE_SCALE];
};

console.log("\n=== Verification ===");
console.log("FK scene EE:", fkScene.map(v => v.toFixed(4)));
const roundTrip = sceneToIK(fkScene[0], fkScene[1], fkScene[2]);
console.log("sceneToIK(FK scene EE):", roundTrip.map(v => v.toFixed(6)));
console.log("FK IK EE:              ", fkIK.map(v => v.toFixed(6)));
console.log("Match:", roundTrip.every((v, i) => Math.abs(v - fkIK[i]) < 0.0001));

// Now check: what if the robot is NOT at (0,0,0) in the scene?
// RobotScene.tsx likely places the robot at some position/rotation.
// Let me check the robot loading code for any position/rotation offset...
console.log("\n=== Scene placement check ===");
console.log("If robot group is at scene origin and properly scaled/rotated:");
console.log("  FK EE (IK): ", fkIK.map(v => v.toFixed(6)));
console.log("  FK EE (scene): ", fkScene.map(v => v.toFixed(4)));
console.log("  sceneToIK should give back FK IK — and it does!");

console.log("\n=== The jump angles mystery ===");
// The user's jump angles produce EE at IK (0.408416, 0.120608, 0.059147)
// Which means sceneToIK is receiving a scene position that maps to this...
// The scene position that maps to this: ikToScene(0.408416, 0.120608, 0.059147) = (6.1262, 0.8872, -1.8091)
// But the FK expects the home EE at scene (5.7007, 3.5590, 0.0027)
// 
// DELTA: (6.1262-5.7007, 0.8872-3.559, -1.8091-0.0027) = (0.4255, -2.6718, -1.8118)
// This is in scene units. In IK units: (0.0284, -0.1209, -0.1781)
// 
// This is a HUGE offset. Something is very wrong.
// 
// The most likely cause: the robot model in Three.js is at a different position
// than the FK model assumes. The FK assumes the robot starts at identity (world origin),
// but in the Three.js scene, the robot group might be placed at a non-zero position.

console.log("HYPOTHESIS: The Three.js robot model is NOT at scene origin.");
console.log("The scene has the robot group at some position/rotation that");
console.log("is NOT accounted for in sceneToIK.");
console.log("Need to check RobotScene.tsx for robot placement.");
