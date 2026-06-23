#!/bin/bash
# ============================================================================
# SO-ARM101 — Raspberry Pi Demo Launch Script
#
# Starts:
#   1. ROSBridge WebSocket + micro-ROS Agent (Docker)
#   2. Camera MJPEG stream (native rpicam-vid + Python)
#
# Usage: ./raspi_launch.sh
# Stop:  Ctrl+C (stops everything)
# ============================================================================

set -e

# ─── Configuration ──────────────────────────────────────────────────────────
TEENSY_DEV="/dev/ttyACM0"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'
BOLD='\033[1m'

CAMERA_PID=""

cleanup() {
    echo -e "\n${YELLOW}🛑 Shutting down services...${NC}"
    # Stop camera stream
    if [ -n "$CAMERA_PID" ] && kill -0 "$CAMERA_PID" 2>/dev/null; then
        kill "$CAMERA_PID" 2>/dev/null || true
        echo -e "${GREEN}  ✓ Camera stream stopped${NC}"
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
echo "║    SO-ARM101 — Raspberry Pi Demo Launcher 🤖        ║"
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

# ─── 1. Start Docker Services (ROSBridge + micro-ROS) ─────────────────────
echo ""
echo -e "${CYAN}[1/2]${NC} Starting Docker Services (ROSBridge + micro-ROS Agent)..."

cd "$SCRIPT_DIR"
docker compose pull microros-agent > /dev/null 2>&1 || true
docker compose up -d

echo -e "${YELLOW}  → Waiting for services to initialize...${NC}"
sleep 5

if docker ps --format '{{.Names}}' | grep -q "soarm101"; then
    echo -e "${GREEN}  ✓ Docker services running${NC}"
else
    echo -e "${RED}  ✗ Services failed to start. Check: docker compose logs${NC}"
    exit 1
fi

# ─── 2. Start Camera Stream (USB webcam via OpenCV) ───────────────────────
echo ""
echo -e "${CYAN}[2/2]${NC} Starting Camera MJPEG Stream (USB webcam)..."

# Install OpenCV if needed
pip3 install -q opencv-python-headless 2>/dev/null || true

# Auto-detect USB webcam device index (skip built-in Pi Camera devices)
CAM_DEV=""
if command -v v4l2-ctl &> /dev/null; then
    # Find the first /dev/videoN from a USB device
    CAM_DEV=$(v4l2-ctl --list-devices 2>/dev/null | grep -A1 "usb" | grep -oP '/dev/video\K\d+' | head -1)
fi

if [ -n "$CAM_DEV" ]; then
    echo -e "${GREEN}  → USB webcam found at /dev/video${CAM_DEV}${NC}"
    python3 "$SCRIPT_DIR/camera_stream.py" --opencv --device "$CAM_DEV" &
    CAMERA_PID=$!
    sleep 2
    if kill -0 "$CAMERA_PID" 2>/dev/null; then
        echo -e "${GREEN}  ✓ Camera stream running on port 8554${NC}"
    else
        echo -e "${YELLOW}  ⚠ Camera stream failed to start (non-critical)${NC}"
        CAMERA_PID=""
    fi
else
    echo -e "${YELLOW}  ⚠ No USB webcam detected — camera stream disabled${NC}"
    echo -e "${YELLOW}    Install v4l-utils: sudo apt install v4l-utils${NC}"
fi

# ─── Ready! ────────────────────────────────────────────────────────────────
TAILSCALE_IP=$(tailscale ip -4 2>/dev/null || echo "<unknown>")
LOCAL_IP=$(hostname -I | awk '{print $1}')

echo ""
echo -e "${BOLD}${GREEN}╔══════════════════════════════════════════════════════╗${NC}"
echo -e "${BOLD}${GREEN}║           🤖 SO-ARM101 Pi is READY!                 ║${NC}"
echo -e "${BOLD}${GREEN}╚══════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "  ${BOLD}On your LAPTOP:${NC}"
echo -e "  ROSBridge:   ${CYAN}ws://$TAILSCALE_IP:9090${NC}"
echo -e "  Camera:      ${CYAN}http://$TAILSCALE_IP:8554${NC}"
echo ""
echo -e "  ${BOLD}PowerShell (one-liner):${NC}"
echo -e "  ${CYAN}\$env:NEXT_PUBLIC_ROSBRIDGE_URL=\"ws://$TAILSCALE_IP:9090\"; \$env:NEXT_PUBLIC_CAMERA_URL=\"http://$TAILSCALE_IP:8554\"; npm run dev${NC}"
echo ""
echo -e "  ${BOLD}Logs:${NC}"
echo -e "    micro-ROS: ${YELLOW}docker logs -f soarm101-microros${NC}"
echo -e "    ROSBridge: ${YELLOW}docker logs -f soarm101-rosbridge${NC}"
echo ""
echo -e "  ${BOLD}Press Ctrl+C to stop everything${NC}"
echo ""

# Follow Docker logs (keeps script running for cleanup trap)
docker compose logs -f --tail=0
