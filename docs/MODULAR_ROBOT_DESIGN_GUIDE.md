# Modular Robot Design Guide

This guide defines the minimum rules a user should follow when designing a new
robot arm profile for the SO-ARM101 modular platform. The goal is to let a
custom robot work with the dashboard, IK solver, and Teensy firmware without
editing source code.

## 1. Start with the task, not the URDF

Decide these first:

- How many active joints the robot needs
- Whether the task is position-only or full-pose control
- Expected reach, payload, and speed
- Which joints belong to the arm and which belong only to the tool

The platform is designed for modular serial chains from 3 joints up to 10+
joints. Keep the main control chain ordered from base to tool.

## 2. Name joints and links clearly

Use stable, readable names because the dashboard treats URDF joint names as the
runtime identifiers for sliders, actuator mapping, telemetry, and IK ordering.

Good examples:

```text
BaseYaw
ShoulderPitch
ElbowPitch
WristRoll
ToolGripper
```

Avoid:

```text
joint_1
link_new
temp_axis
copy_of_rotation
```

## 3. URDF requirements

For each moving joint:

- Set a unique `name`
- Use a valid `type`, usually `revolute` or `continuous`
- Define `origin xyz` and `origin rpy`
- Define `axis xyz`
- Add `limit lower` and `limit upper` for revolute joints

Fixed joints can stay in the model, but they do not become live joint controls.

Example:

```xml
<joint name="ShoulderPitch" type="revolute">
  <parent link="base_link" />
  <child link="upper_arm" />
  <origin xyz="0 0 0.115" rpy="0 0 0" />
  <axis xyz="0 0 1" />
  <limit lower="-1.57" upper="1.57" effort="10" velocity="2" />
</joint>
```

## 4. Build the chain in physical order

Order the active chain from the first moving joint near the base to the last
moving joint near the tool:

1. Base joint
2. Shoulder and arm joints
3. Elbow
4. Wrist joints
5. Tool joints

If a revolute tool joint should not participate in Cartesian IK, note that in
your profile design. The clean long-term approach is an explicit per-joint IK
enable flag.

## 5. Define real geometry and TCP

Use metric dimensions in the URDF. Put real link offsets in joint origins, and
put the tool tip offset in `tcpOffset` instead of hiding it in solver code.

Example:

```json
{
  "activeTool": {
    "type": "gripper",
    "name": "Parallel Gripper",
    "hardwareType": "sts3215",
    "hardwareId": 9,
    "tcpOffset": [0, 0, -0.095]
  }
}
```

## 6. Map hardware per joint

Each joint must map cleanly to one actuator entry in the exported profile.

Example:

```json
{
  "jointOrder": ["BaseYaw", "ShoulderPitch", "ElbowPitch", "WristPitch"],
  "tcpOffset": [0, 0, -0.09],
  "actuators": {
    "BaseYaw": {
      "hardwareType": "nema23",
      "hardwareId": 1,
      "stepsPerRev": 200,
      "microsteps": 16,
      "gearRatio": 6,
      "stepPin": 2,
      "dirPin": 3
    },
    "ShoulderPitch": {
      "hardwareType": "nema23",
      "hardwareId": 2,
      "stepsPerRev": 200,
      "microsteps": 16,
      "gearRatio": 6,
      "stepPin": 4,
      "dirPin": 5,
      "commandBiasDeg": 1
    },
    "ElbowPitch": {
      "hardwareType": "sts3215",
      "hardwareId": 3,
      "commandBiasDeg": 1
    },
    "WristPitch": {
      "hardwareType": "sts3215",
      "hardwareId": 4
    }
  }
}
```

Rules:

- `jointOrder` must match the physical base-to-tool chain
- Each hardware ID must be valid for its actuator family
- Only the first two stepper joints can rely on firmware default pins
- Use `commandBiasDeg` for trim or gravity compensation, not hardcoded logic

## 7. Validate in the dashboard

After importing the URDF:

1. Confirm the detected joint list matches the intended chain
2. Set the active TCP offset
3. Configure actuators in the assembly view
4. Auto-generate collision boxes and trim them
5. Jog each joint and verify axis direction
6. Test home pose and IK targets
7. Save and re-import the profile to confirm it is stable

## 8. Real-motion checklist

Before powering the full robot:

- Joint names are unique and readable
- Joint limits exist for every revolute arm joint
- Joint order matches the real mechanism
- TCP offset matches the mounted tool
- Hardware IDs and pins are correct
- Stepper joints beyond slot 2 have explicit `stepPin` and `dirPin`
- Collision boxes do not block normal motion
- The firmware returns `ok:` on `/fyp2/config_status`

## 9. Recommended first prototype

Start with a simple 4-DOF or 5-DOF arm and one tool. Once the base chain,
limits, TCP, and hardware mappings are verified, expand to extra wrist joints,
redundant chains, or alternate end-effectors.
