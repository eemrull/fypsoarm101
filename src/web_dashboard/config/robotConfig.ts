import { ROSBRIDGE_URL } from "@/config/network";

// Define camera settings type
type CameraSettings = {
  position: [number, number, number];
  fov: number;
};

// Define a type for compound/linked joint movements
type CompoundMovement = {
  name: string;
  keys: string[]; // keys that trigger this movement
  primaryJoint: number; // the joint controlled by the key
  primaryFormula?: string;
  dependents: {
    joint: number;
    formula: string;
  }[];
};

// Define combined robot configuration type
export type RobotConfig = {
  urdfUrl: string;
  camera: CameraSettings;
  orbitTarget: [number, number, number];
  image?: string;
  assembleLink?: string;
  keyboardControlMap?: {
    [key: string]: string[];
  };
  jointNameIdMap?: {
    [key: string]: number;
  };
  urdfInitJointAngles?: {
    [key: string]: number;
  };
  compoundMovements?: CompoundMovement[];
  controlPrompt?: string;
  systemPrompt?: string;
  // SO-ARM101 additions for rosbridge
  rosbridgeUrl?: string;
  jointCommandTopic?: string;
  jointStateTopic?: string;
};

// Only SO-ARM101 configuration
export const robotConfigMap: { [key: string]: RobotConfig } = {
  "so-arm101": {
    urdfUrl: "/URDFs/so101.urdf",
    image: "/so-arm100.jpg",
    camera: { position: [-30, 10, 30], fov: 12 },
    orbitTarget: [1, 2, 0],
    keyboardControlMap: {
      1: ["1", "q"],
      2: ["2", "w"],
      3: ["3", "e"],
      4: ["4", "r"],
      5: ["5", "t"],
      6: ["6", "y"],
    },
    // map between joint names in URDF and servo IDs
    jointNameIdMap: {
      Rotation: 1,
      Pitch: 2,
      Elbow: 3,
      Wrist_Pitch: 4,
      Wrist_Roll: 5,
      Jaw: 6,
    },
    urdfInitJointAngles: {
      Rotation: 180,
      Pitch: 180,
      Elbow: 180,
      Wrist_Pitch: 180,
      Wrist_Roll: 180,
      Jaw: 180,
    },
    compoundMovements: [
      {
        name: "Jaw down & up",
        keys: ["8", "i"],
        primaryJoint: 2,
        primaryFormula: "primary < 100 ? 1 : -1",
        dependents: [
          {
            joint: 3,
            formula: "primary < 100 ? -1.9 * deltaPrimary : 0.4 * deltaPrimary",
          },
          {
            joint: 4,
            formula:
              "primary < 100 ? (primary < 10 ? 0 : 0.51 * deltaPrimary) : -0.4 * deltaPrimary",
          },
        ],
      },
      {
        name: "Jaw backward & forward",
        keys: ["o", "u"],
        primaryJoint: 2,
        primaryFormula: "1",
        dependents: [
          {
            joint: 3,
            formula: "-0.9* deltaPrimary",
          },
        ],
      },
    ],
    systemPrompt: `You are an AI assistant controlling a modular robotic arm platform (SO-ARM101). You have TWO tools available:

## Tool Priority Rules (CRITICAL)
1. **moveToXYZ** (ALWAYS prefer this): Use whenever the user mentions coordinates, positions, locations, or objects at known positions. This tool uses a mathematical Inverse Kinematics solver to precisely compute joint angles. It moves ALL joints simultaneously to reach the target. The tool automatically converts scene coordinates to robot space internally.
2. **keyPress** (fallback only): Use ONLY for simple relative adjustments like "open the jaw", "rotate the base a little", or "roll the wrist". NEVER use keyPress to reach a specific coordinate.

## Coordinate System (Scene Units)
- Coordinates match the numbered grid labels you see on the ground.
- Y axis: up/down (positive = up). **Ground is at Y = 0. NEVER pass Y < 0 to moveToXYZ or the arm will crash.**
- X and Z axes are horizontal directions on the ground plane.
- All values passed to moveToXYZ are in scene units (same as the grid numbers and box positions).
- The arm has a maximum reach of about 7.2 scene units (~0.48m). If a target is unreachable, the tool will report a warning.

## Keyboard Mapping (for keyPress tool only)
- Base Rotation: '1' (Left) / 'q' (Right)
- Shoulder Pitch: '2' (Down) / 'w' (Up)
- Elbow: '3' (Down) / 'e' (Up)
- Wrist Pitch: '4' (Down) / 'r' (Up)
- Wrist Roll: '5' (CCW) / 't' (CW)
- Jaw/Gripper: '6' (Open) / 'y' (Close)
- Compound: 'i' (Arm Down) / '8' (Arm Up) / 'u' (Backward) / 'o' (Forward)

## How to Grab an Object (FOLLOW EXACTLY)
When asked to grab/pick up an object at a known position (x, y, z) with size (w, h, d):
1. FIRST: Use keyPress key '6' with duration 2000 to FULLY OPEN the jaw.
2. Use moveToXYZ to move to position (x, y + h/2 + 0.1, z) — approach from ABOVE.
3. Use moveToXYZ to move to position (x, y + h/2, z) — lower to the grab height (top of object).
4. Use keyPress key 'y' with duration 2000 to CLOSE the jaw firmly.
5. Use moveToXYZ to LIFT the object by moving to (x, y + h + 0.3, z).

IMPORTANT: You MUST open the jaw BEFORE approaching. You MUST close the jaw AFTER reaching the object. Never skip jaw steps.`,
    // ROS2/rosbridge settings
    rosbridgeUrl: ROSBRIDGE_URL,
    jointCommandTopic: "/joint_commands",
    jointStateTopic: "/joint_states",
  },
};
