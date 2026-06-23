# FYP-SOARM101 Launch Runbook

This is the step-by-step startup order for a normal hardware session.

## 0. One-time setup

1. Install dependencies for the web dashboard:
```bash
cd src/web_dashboard
npm install
```
2. Build/upload firmware once (or whenever firmware changes):
```bash
cd firmware_fyp-teensy41
pio run -e teensy41 -t upload
```

## 1. Start order (manual, recommended)

Use **4 terminals**. The order matters.

```mermaid
%%{init: {'theme': 'neutral', 'themeVariables': { 'fontFamily': 'Inter, sans-serif'}}}%%
graph TD
    Step0[🔌 Step 0: Connect Hardware<br/><i>Teensy 4.1 USB to Host PC</i>] --> Step1[💻 Step 1: Terminal B<br/><i>Start micro-ROS Agent</i>]
    Step1 --> Step1Check{Agent Node<br/>Discovered?}
    
    Step1Check -- ❌ No --> FixSerial[Check USB Port & Baudrate 921600 / 6000000]
    FixSerial --> Step1
    
    Step1Check --  Yes --> Step2[🛰️ Step 2: Terminal C<br/><i>Launch ROSBridge Suite</i>]
    Step2 --> Step3[🖥️ Step 3: Terminal D<br/><i>Start Next.js App (npm run dev)</i>]
    
    Step3 --> Step4[🌐 Step 4: Web Browser<br/><i>Open http://localhost:3000/play/so-arm101</i>]
    Step4 --> Step5[🔧 Step 5: Web UI<br/><i>1. Check Actuators in Assemble<br/>2. Press 'Connect via ROSBridge'</i>]
    
    Step5 --> Step6[📊 Step 6: Verify Health<br/><i>Check config_status is 'ok'</i>]

    classDef stage fill:#ffffff,stroke:#4b5563,stroke-width:1.5px,color:#1f2937,rx:5px,ry:5px;
    classDef decision fill:#ffffff,stroke:#2563eb,stroke-width:1.5px,color:#1e40af;
    classDef errorAction fill:#fef2f2,stroke:#dc2626,stroke-width:1.5px,color:#991b1b;
    
    class Step0,Step1,Step2,Step3,Step4,Step5,Step6 stage;
    class Step1Check decision;
    class FixSerial errorAction;
```

### Terminal A: ROS environment
```bash
source /opt/ros/humble/setup.bash
source ~/isaac_ws/install/setup.bash
```

### Terminal B: micro-ROS Agent (Teensy link)
```bash
source /opt/ros/humble/setup.bash
source ~/isaac_ws/install/setup.bash
ros2 run micro_ros_agent micro_ros_agent serial --dev /dev/ttyACM0 -b 921600
```

If your Teensy is on a different device, replace `/dev/ttyACM0`.

### Terminal C: Rosbridge WebSocket
```bash
source /opt/ros/humble/setup.bash
source ~/isaac_ws/install/setup.bash
ros2 launch rosbridge_server rosbridge_websocket_launch.xml
```

### Terminal D: Web dashboard
```bash
cd src/web_dashboard
npm run dev
```

Open:
- `http://localhost:3000/play/so-arm101`

Then in UI:
1. Go to **Assemble** and confirm actuator/tool profile.
2. Go to **Playground**.
3. Press **Connect via ROSbridge**.

## 2. Quick health checks

Run these in any ROS-sourced terminal:

```bash
ros2 topic list
```

You should see at least:
- `/joint_commands`
- `/servo_feedback`
- `/fyp2/hardware_config`
- `/fyp2/config_status`

Optional checks:
```bash
ros2 topic echo /fyp2/config_status
ros2 topic hz /servo_feedback
```

## 3. Optional launch script (Linux)

You can use the all-in-one launcher:
```bash
./launch_robot.sh
```

It starts:
1. `micro_ros_agent`
2. `rosbridge_websocket`
3. `npm run dev`

## 4. When to run `src/bridge.py`

`bridge.py` mirrors `/joint_states` to `/joint_commands`. Use it for ROS/MoveIt-driven control pipelines.

For normal dashboard teleoperation, keep `bridge.py` **off** to avoid multiple command publishers on `/joint_commands`.

Run only when needed:
```bash
source /opt/ros/humble/setup.bash
source ~/isaac_ws/install/setup.bash
python3 src/bridge.py
```

## 5. Shutdown order

Stop in reverse order:
1. Dashboard (`Ctrl+C`)
2. Rosbridge (`Ctrl+C`)
3. micro-ROS Agent (`Ctrl+C`)

If you used `launch_robot.sh`, press `Ctrl+C` once in that terminal.

## 6. Common issues

1. **Cannot connect from dashboard**  
Check rosbridge is running on `ws://localhost:9090`.

2. **No firmware feedback**  
Check Teensy port and `micro_ros_agent` serial baud `921600`.

3. **Connect button works but no movement**  
Confirm `/fyp2/config_status` reports `ok: hardware configuration applied`.

4. **Port 3000 or 9090 already in use**  
Kill old processes, then restart in the same order above.
