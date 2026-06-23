#!/bin/bash
# ============================================================================
# SO-ARM101 FYP2 — One-Command Launch Script
# Usage: ./launch_robot.sh
# Stop:  Ctrl+C (kills all background processes cleanly)
# ============================================================================

set -e

# ─── Configuration ──────────────────────────────────────────────────────────
TEENSY_DEV="/dev/ttyACM0"
TEENSY_BAUD="921600"
ROS_WS="$HOME/isaac_ws"
DASHBOARD_DIR="$ROS_WS/src/fypsoarm101/src/web_dashboard"
ROSBRIDGE_PORT=9090

# Colors for terminal output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color
BOLD='\033[1m'

# Track PIDs for cleanup
PIDS=()

cleanup() {
    echo -e "\n${YELLOW}🛑 Shutting down all services...${NC}"
    for pid in "${PIDS[@]}"; do
        if kill -0 "$pid" 2>/dev/null; then
            kill "$pid" 2>/dev/null
            wait "$pid" 2>/dev/null
        fi
    done
    echo -e "${GREEN}✅ All services stopped.${NC}"
    exit 0
}

trap cleanup SIGINT SIGTERM

# ─── Pre-flight checks ─────────────────────────────────────────────────────
echo -e "${BOLD}${CYAN}"
echo "╔══════════════════════════════════════════════════╗"
echo "║         SO-ARM101 — FYP2 Launch Script          ║"
echo "╚══════════════════════════════════════════════════╝"
echo -e "${NC}"

# Check ROS2 environment
if ! command -v ros2 &> /dev/null; then
    echo -e "${RED}❌ ROS2 not found. Source your ROS2 setup first:${NC}"
    echo "   source /opt/ros/humble/setup.bash"
    echo "   source $ROS_WS/install/setup.bash"
    exit 1
fi
echo -e "${GREEN}✓${NC} ROS2 environment detected"

# Check Teensy USB
if [ ! -e "$TEENSY_DEV" ]; then
    echo -e "${YELLOW}⚠ Teensy not found at $TEENSY_DEV${NC}"
    # Try to find it
    FOUND_DEV=$(ls /dev/ttyACM* 2>/dev/null | head -1)
    if [ -n "$FOUND_DEV" ]; then
        echo -e "${GREEN}  → Found device at $FOUND_DEV, using that instead${NC}"
        TEENSY_DEV="$FOUND_DEV"
    else
        echo -e "${RED}❌ No Teensy detected. Plug in the USB cable and try again.${NC}"
        echo "   If using wireless (ESP32), edit TEENSY_DEV in this script."
        exit 1
    fi
fi
echo -e "${GREEN}✓${NC} Teensy detected at ${CYAN}$TEENSY_DEV${NC}"

# Check dashboard directory
if [ ! -d "$DASHBOARD_DIR" ]; then
    echo -e "${RED}❌ Dashboard not found at $DASHBOARD_DIR${NC}"
    echo "   Update DASHBOARD_DIR in this script."
    exit 1
fi
echo -e "${GREEN}✓${NC} Dashboard found at ${CYAN}$DASHBOARD_DIR${NC}"

# Check if ports are already in use
if lsof -Pi :$ROSBRIDGE_PORT -sTCP:LISTEN -t >/dev/null 2>&1; then
    echo -e "${YELLOW}⚠ Port $ROSBRIDGE_PORT already in use (rosbridge may already be running)${NC}"
fi
if lsof -Pi :3000 -sTCP:LISTEN -t >/dev/null 2>&1; then
    echo -e "${YELLOW}⚠ Port 3000 already in use (dashboard may already be running)${NC}"
fi

echo ""
echo -e "${BOLD}Starting services...${NC}"
echo "─────────────────────────────────────────────────"

# ─── 1. Start micro-ROS Agent ──────────────────────────────────────────────
echo -e "${CYAN}[1/3]${NC} Starting micro-ROS Agent on ${CYAN}$TEENSY_DEV${NC} @ ${CYAN}$TEENSY_BAUD${NC} baud..."
ros2 run micro_ros_agent micro_ros_agent serial \
    --dev "$TEENSY_DEV" -b "$TEENSY_BAUD" \
    > /tmp/microros_agent.log 2>&1 &
PIDS+=($!)
sleep 2

# Verify it started
if kill -0 "${PIDS[-1]}" 2>/dev/null; then
    echo -e "${GREEN}  ✓ micro-ROS Agent running (PID: ${PIDS[-1]})${NC}"
else
    echo -e "${RED}  ✗ micro-ROS Agent failed to start. Check /tmp/microros_agent.log${NC}"
    cleanup
fi

# ─── 2. Start Rosbridge WebSocket ──────────────────────────────────────────
echo -e "${CYAN}[2/3]${NC} Starting Rosbridge WebSocket on port ${CYAN}$ROSBRIDGE_PORT${NC}..."
ros2 launch rosbridge_server rosbridge_websocket_launch.xml \
    > /tmp/rosbridge.log 2>&1 &
PIDS+=($!)
sleep 3

if kill -0 "${PIDS[-1]}" 2>/dev/null; then
    echo -e "${GREEN}  ✓ Rosbridge running (PID: ${PIDS[-1]})${NC}"
else
    echo -e "${RED}  ✗ Rosbridge failed. Check /tmp/rosbridge.log${NC}"
    cleanup
fi

# ─── 3. Start Web Dashboard ───────────────────────────────────────────────
echo -e "${CYAN}[3/3]${NC} Starting Web Dashboard..."
cd "$DASHBOARD_DIR"
npm run dev > /tmp/dashboard.log 2>&1 &
PIDS+=($!)
sleep 4

if kill -0 "${PIDS[-1]}" 2>/dev/null; then
    echo -e "${GREEN}  ✓ Web Dashboard running (PID: ${PIDS[-1]})${NC}"
else
    echo -e "${RED}  ✗ Dashboard failed. Check /tmp/dashboard.log${NC}"
    cleanup
fi

# ─── Ready! ────────────────────────────────────────────────────────────────
LOCAL_IP=$(hostname -I | awk '{print $1}')
echo ""
echo -e "${BOLD}${GREEN}╔══════════════════════════════════════════════════╗${NC}"
echo -e "${BOLD}${GREEN}║           🤖 SO-ARM101 is READY!                ║${NC}"
echo -e "${BOLD}${GREEN}╚══════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "  Dashboard:   ${CYAN}http://localhost:3000/play/so-arm101${NC}"
echo -e "  Network:     ${CYAN}http://$LOCAL_IP:3000/play/so-arm101${NC}"
echo -e "  Rosbridge:   ${CYAN}ws://localhost:$ROSBRIDGE_PORT${NC}"
echo -e "  Teensy:      ${CYAN}$TEENSY_DEV @ $TEENSY_BAUD baud${NC}"
echo ""
echo -e "  Logs: ${YELLOW}/tmp/microros_agent.log${NC}"
echo -e "        ${YELLOW}/tmp/rosbridge.log${NC}"
echo -e "        ${YELLOW}/tmp/dashboard.log${NC}"
echo ""
echo -e "  ${BOLD}Press Ctrl+C to stop all services${NC}"
echo ""

# Wait for all background processes
wait
