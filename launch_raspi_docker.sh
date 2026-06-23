#!/bin/bash
# ============================================================================
# SO-ARM101 — Raspberry Pi Full Docker Launch Script
#
# Starts:
#   1. Docker stack: Dashboard + ROSBridge (pre-baked image) + micro-ROS Agent
#   2. Cam 1 — USB webcam          → MJPEG on port 8554  (OpenCV)
#   3. Cam 2 — Pi Camera Module v2 → MJPEG on port 8555  (rpicam-vid --pipe)
#
# Usage: ./launch_raspi_docker.sh
# Stop:  Ctrl+C (stops everything cleanly)
#
# WHY pre-baked rosbridge image?
#   The old setup ran `apt-get install ros-humble-rosbridge-server` on every
#   container restart (30-120s). This caused intermittent connection failures
#   because the launch script declared success before rosbridge was ready.
#   Dockerfile.rosbridge pre-bakes the package so startup takes ~2 seconds.
#
# Camera ports:
#   USB webcam:      http://<PI_IP>:8554
#   Pi Camera Mod:   http://<PI_IP>:8555
# ============================================================================

set -e

# ─── Configuration ──────────────────────────────────────────────────────────
TEENSY_DEV="/dev/ttyACM0"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RASPI_DIR="$SCRIPT_DIR/raspi"

CAM1_PORT=8554   # USB webcam
CAM2_PORT=8555   # Pi Camera Module

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'
BOLD='\033[1m'

CAM1_PID=""
CAM2_PID=""

cleanup() {
    echo -e "\n${YELLOW}🛑 Shutting down services...${NC}"

    # Stop camera streams
    if [ -n "$CAM1_PID" ] && kill -0 "$CAM1_PID" 2>/dev/null; then
        kill "$CAM1_PID" 2>/dev/null || true
        echo -e "${GREEN}  ✓ Cam 1 (USB) stream stopped${NC}"
    fi
    if [ -n "$CAM2_PID" ] && kill -0 "$CAM2_PID" 2>/dev/null; then
        kill "$CAM2_PID" 2>/dev/null || true
        echo -e "${GREEN}  ✓ Cam 2 (Pi Cam) stream stopped${NC}"
    fi

    # Stop Docker services
    cd "$SCRIPT_DIR"
    docker compose down
    echo -e "${GREEN}✅ All services stopped.${NC}"
    exit 0
}

trap cleanup SIGINT SIGTERM

# ─── Banner ─────────────────────────────────────────────────────────────────
echo -e "${BOLD}${CYAN}"
echo "╔══════════════════════════════════════════════════════╗"
echo "║    SO-ARM101 — Full Docker Pi Launcher 🐳🤖         ║"
echo "╚══════════════════════════════════════════════════════╝"
echo -e "${NC}"

# ─── Check Teensy USB ──────────────────────────────────────────────────────
if [ ! -e "$TEENSY_DEV" ]; then
    echo -e "${YELLOW}⚠ Teensy not found at $TEENSY_DEV${NC}"
    FOUND_DEV=$(ls /dev/ttyACM* 2>/dev/null | head -1)
    if [ -n "$FOUND_DEV" ]; then
        echo -e "${GREEN}  → Found device at $FOUND_DEV, using that${NC}"
        TEENSY_DEV="$FOUND_DEV"
    else
        echo -e "${RED}✗ No Teensy detected. Plug in the USB cable and try again.${NC}"
        exit 1
    fi
fi
echo -e "${GREEN}✓${NC} Teensy detected at ${CYAN}$TEENSY_DEV${NC}"

# ─── 0. Clean Up Stale Processes ─────────────────────────────────────────────
echo -e "${YELLOW}Cleaning up stale processes...${NC}"

kill_port() {
    local port="$1"
    if command -v lsof &> /dev/null; then
        local pid
        pid=$(lsof -t -i:"$port" 2>/dev/null || true)
        if [ -n "$pid" ]; then
            echo -e "${YELLOW}  → Killing stale PID $pid on port $port...${NC}"
            kill -9 "$pid" 2>/dev/null || true
            sleep 1
        fi
    fi
}

kill_port 9090
kill_port "$CAM1_PORT"
kill_port "$CAM2_PORT"

# Stop any dangling docker containers
cd "$SCRIPT_DIR"
docker compose down > /dev/null 2>&1 || true

# ─── 1. Start Docker Compose (Dashboard, ROSBridge, micro-ROS) ──────────────
echo ""
echo -e "${CYAN}[1/3]${NC} Starting Full Docker Stack..."

cd "$SCRIPT_DIR"

# Build the rosbridge image if it doesn't exist yet (first run or after Dockerfile.rosbridge changes).
# This pre-bakes ros-humble-rosbridge-server so container startup is ~2s, not 30-120s.
if ! docker image inspect soarm101-rosbridge:latest &>/dev/null; then
    echo -e "${YELLOW}  → Building rosbridge image for the first time (this takes a few minutes)...${NC}"
    docker compose build rosbridge
    echo -e "${GREEN}  ✓ rosbridge image built and cached${NC}"
fi

docker compose pull microros-agent > /dev/null 2>&1 || true
docker compose up -d

# ── Wait for ROSBridge to actually accept connections (port 9090) ──────────
# The old blind `sleep 5` fired before rosbridge had even started.
# We now poll until the WebSocket port responds (up to 90 seconds).
ROSBRIDGE_TIMEOUT=90
ROSBRIDGE_WAIT=0
echo -e "${YELLOW}  → Waiting for ROSBridge on port 9090...${NC}"
while ! nc -z localhost 9090 2>/dev/null; do
    if [ "$ROSBRIDGE_WAIT" -ge "$ROSBRIDGE_TIMEOUT" ]; then
        echo -e "${RED}  ✗ ROSBridge did not become ready within ${ROSBRIDGE_TIMEOUT}s${NC}"
        echo -e "${RED}    Check logs: docker compose logs rosbridge${NC}"
        exit 1
    fi
    sleep 2
    ROSBRIDGE_WAIT=$((ROSBRIDGE_WAIT + 2))
done
echo -e "${GREEN}  ✓ ROSBridge is ready on port 9090 (${ROSBRIDGE_WAIT}s)${NC}"

if docker compose ps --format '{{.Name}}' | grep -q "soarm101"; then
    echo -e "${GREEN}  ✓ Docker stack is running${NC}"
else
    echo -e "${RED}  ✗ Services failed to start. Check: docker compose logs${NC}"
    exit 1
fi

# ─── 2. Start Cam 1 — USB Webcam (OpenCV → port 8554) ────────────────────
echo ""
echo -e "${CYAN}[2/3]${NC} Starting Cam 1 — USB Webcam (port $CAM1_PORT)..."

pip3 install -q opencv-python-headless 2>/dev/null || true

CAM1_DEV=""
if command -v v4l2-ctl &> /dev/null; then
    CAM1_DEV=$(v4l2-ctl --list-devices 2>/dev/null | grep -A1 "usb" | grep -oP '/dev/video\K\d+' | head -1)
fi

if [ -n "$CAM1_DEV" ]; then
    echo -e "${GREEN}  → USB webcam found at /dev/video${CAM1_DEV}${NC}"
    python3 "$RASPI_DIR/camera_stream.py" --opencv --device "$CAM1_DEV" --port "$CAM1_PORT" &
    CAM1_PID=$!
    sleep 2
    if kill -0 "$CAM1_PID" 2>/dev/null; then
        echo -e "${GREEN}  ✓ Cam 1 stream running on port $CAM1_PORT${NC}"
    else
        echo -e "${YELLOW}  ⚠ Cam 1 stream failed to start (non-critical)${NC}"
        CAM1_PID=""
    fi
else
    echo -e "${YELLOW}  ⚠ No USB webcam detected — Cam 1 disabled${NC}"
    echo -e "${YELLOW}    Install v4l-utils: sudo apt install v4l-utils${NC}"
fi

# ─── 3. Start Cam 2 — Pi Camera Module (rpicam-vid --pipe → port 8555) ─────
echo ""
echo -e "${CYAN}[3/3]${NC} Starting Cam 2 — Pi Camera Module v2 (port $CAM2_PORT)..."

if command -v rpicam-vid &> /dev/null; then
    # rpicam-vid pipes raw MJPEG frames to stdout; camera_stream.py reads stdin
    rpicam-vid \
        -t 0 \
        --width 640 --height 480 \
        --framerate 15 \
        --codec mjpeg \
        --inline \
        --nopreview \
        -o - 2>/dev/null \
    | python3 "$RASPI_DIR/camera_stream.py" --pipe --port "$CAM2_PORT" &
    CAM2_PID=$!
    sleep 3
    if kill -0 "$CAM2_PID" 2>/dev/null; then
        echo -e "${GREEN}  ✓ Cam 2 stream running on port $CAM2_PORT${NC}"
    else
        echo -e "${YELLOW}  ⚠ Cam 2 (Pi Cam) stream failed to start (non-critical)${NC}"
        echo -e "${YELLOW}    Check that the Pi Camera is enabled: sudo raspi-config${NC}"
        CAM2_PID=""
    fi
else
    echo -e "${YELLOW}  ⚠ rpicam-vid not found — Pi Camera Module disabled${NC}"
    echo -e "${YELLOW}    Enable the camera stack: sudo raspi-config → Interface Options → Camera${NC}"
fi

# ─── Ready! ────────────────────────────────────────────────────────────────
TAILSCALE_IP=$(tailscale ip -4 2>/dev/null || echo "<unknown>")
LOCAL_IP=$(hostname -I | awk '{print $1}')

echo ""
echo -e "${BOLD}${GREEN}╔══════════════════════════════════════════════════════╗${NC}"
echo -e "${BOLD}${GREEN}║           🤖 SO-ARM101 Pi is FULLY DEPLOYED!        ║${NC}"
echo -e "${BOLD}${GREEN}╚══════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "  ${BOLD}Access the Web Dashboard:${NC}"
echo -e "    Local Network: ${CYAN}http://$LOCAL_IP:3000/play/so-arm101${NC}"
echo -e "    Tailscale VPN: ${CYAN}http://$TAILSCALE_IP:3000/play/so-arm101${NC}"
echo ""
echo -e "  ${BOLD}Video Stream endpoints:${NC}"
if [ -n "$CAM1_PID" ]; then
    echo -e "    Cam 1 (USB):    ${CYAN}http://$TAILSCALE_IP:$CAM1_PORT${NC}  ← NEXT_PUBLIC_CAMERA_URL"
else
    echo -e "    Cam 1 (USB):    ${YELLOW}not running${NC}"
fi
if [ -n "$CAM2_PID" ]; then
    echo -e "    Cam 2 (Pi Cam): ${CYAN}http://$TAILSCALE_IP:$CAM2_PORT${NC}  ← NEXT_PUBLIC_CAMERA_2_URL"
else
    echo -e "    Cam 2 (Pi Cam): ${YELLOW}not running${NC}"
fi
echo ""
echo -e "  ${BOLD}Logs:${NC}"
echo -e "    All Services:  ${YELLOW}docker compose logs -f${NC}"
echo -e "    Dashboard:     ${YELLOW}docker compose logs -f dashboard${NC}"
echo -e "    micro-ROS:     ${YELLOW}docker compose logs -f microros-agent${NC}"
echo ""
echo -e "  ${BOLD}Press Ctrl+C to stop everything${NC}"
echo ""

# Follow Docker logs (keeps script running for cleanup trap)
docker compose logs -f --tail=0
