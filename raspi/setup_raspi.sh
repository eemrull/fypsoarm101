#!/bin/bash
# ============================================================================
# SO-ARM101 — Raspberry Pi 5 One-Time Setup (Bookworm)
# Run this ONCE on a fresh Raspberry Pi OS Bookworm (64-bit).
#
# What it installs:
#   1. System updates + essential build tools
#   2. Tailscale (mesh VPN for laptop <-> Pi connectivity)
#   3. Docker Engine (for ROSBridge container)
#   4. ROS 2 Humble (from source, minimal build)
#   5. micro-ROS Agent (native, from source)
#   6. USB/serial permissions for Teensy
#
# Usage:  chmod +x setup_raspi.sh && ./setup_raspi.sh
# Time:   ~45-90 minutes (mostly ROS 2 + micro-ROS compilation)
# ============================================================================

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

ROS_WS="$HOME/ros2_ws"
MICRO_ROS_WS="$HOME/microros_ws"

log()  { echo -e "${GREEN}[✓]${NC} $*"; }
warn() { echo -e "${YELLOW}[!]${NC} $*"; }
err()  { echo -e "${RED}[✗]${NC} $*"; exit 1; }
step() { echo -e "\n${BOLD}${CYAN}═══ $* ═══${NC}\n"; }

# ─── 0. Pre-checks ─────────────────────────────────────────────────────────
if [ "$(uname -m)" != "aarch64" ]; then
    err "This script is designed for 64-bit ARM (aarch64). Detected: $(uname -m)"
fi

echo -e "${BOLD}${CYAN}"
echo "╔══════════════════════════════════════════════════════╗"
echo "║   SO-ARM101 — Raspberry Pi 5 Setup (Bookworm)       ║"
echo "║   This will take 45-90 minutes. Grab a coffee! ☕    ║"
echo "╚══════════════════════════════════════════════════════╝"
echo -e "${NC}"

# ─── 1. System Update ──────────────────────────────────────────────────────
step "1/6  System Update & Build Tools"
sudo apt-get update && sudo apt-get upgrade -y
sudo apt-get install -y \
    build-essential cmake git wget curl gnupg lsb-release \
    python3-pip python3-venv python3-dev python3-setuptools \
    libbullet-dev libboost-all-dev libcurl4-openssl-dev \
    libasio-dev libtinyxml2-dev libcunit1-dev \
    liblog4cxx-dev libspdlog-dev libssl-dev \
    libeigen3-dev libopencv-dev \
    libxml2-dev libxslt1-dev \
    screen tmux htop
log "System updated and build tools installed"

# ─── 1.5 ROS 2 Python Tools (Bookworm fix) ────────────────────────────────
step "1.5  ROS 2 Python Tools"
# These are often missing in Bookworm apt repos, so we install via pip
sudo pip3 install --break-system-packages -U \
    rosdep colcon-common-extensions vcstool \
    flake8 pytest numpy
log "ROS 2 Python tools installed via pip"

# ─── 2. Tailscale ──────────────────────────────────────────────────────────
step "2/6  Tailscale VPN"
if command -v tailscale &>/dev/null; then
    warn "Tailscale already installed, skipping"
else
    curl -fsSL https://tailscale.com/install.sh | sh
    log "Tailscale installed"
fi
echo -e "${YELLOW}  → Run 'sudo tailscale up' after setup to authenticate${NC}"

# ─── 3. Docker Engine ─────────────────────────────────────────────────────
step "3/6  Docker Engine (for ROSBridge container)"
if command -v docker &>/dev/null; then
    warn "Docker already installed, skipping"
else
    curl -fsSL https://get.docker.com | sh
    sudo usermod -aG docker "$USER"
    log "Docker installed. Group change takes effect after re-login."
fi

# Install docker-compose plugin
if ! docker compose version &>/dev/null 2>&1; then
    sudo apt-get install -y docker-compose-plugin 2>/dev/null || true
fi
log "Docker ready"

# ─── 4. ROS 2 Humble (from source, minimal) ───────────────────────────────
step "4/6  ROS 2 Humble (source build — this takes ~30-60 min)"

if [ -f "$ROS_WS/install/setup.bash" ]; then
    warn "ROS 2 workspace already exists at $ROS_WS, skipping build"
else
    # Initialize rosdep
    if [ ! -f /etc/ros/rosdep/sources.list.d/20-default.list ]; then
        sudo rosdep init || true
    fi
    rosdep update

    # Create workspace
    mkdir -p "$ROS_WS/src"
    cd "$ROS_WS"

    # Download ROS 2 Humble source (base + required packages only)
    wget -q https://raw.githubusercontent.com/ros2/ros2/humble/ros2.repos
    vcs import --input ros2.repos src

    # Install dependencies via rosdep
    rosdep install --from-paths src --ignore-src -y --skip-keys \
        "fastcdr rti-connext-dds-6.0.1 urdfdom_headers" \
        --os=debian:bookworm 2>/dev/null || \
    rosdep install --from-paths src --ignore-src -y --skip-keys \
        "fastcdr rti-connext-dds-6.0.1 urdfdom_headers" || true

    # Build (using all cores on Pi 5)
    echo -e "${YELLOW}  → Building ROS 2 from source... this takes a while on Pi 5${NC}"
    colcon build --symlink-install \
        --cmake-args -DCMAKE_BUILD_TYPE=Release \
        --parallel-workers "$(nproc)" \
        --packages-skip ros1_bridge 2>&1 | tail -5

    log "ROS 2 Humble built at $ROS_WS"
fi

# Add to bashrc
if ! grep -q "ros2_ws/install/setup.bash" ~/.bashrc; then
    echo "" >> ~/.bashrc
    echo "# ROS 2 Humble (source build)" >> ~/.bashrc
    echo "source $ROS_WS/install/setup.bash" >> ~/.bashrc
    log "Added ROS 2 source to ~/.bashrc"
fi

# Source ROS 2 for the rest of this script
source "$ROS_WS/install/setup.bash"

# ─── 5. micro-ROS Agent (from source) ─────────────────────────────────────
step "5/6  micro-ROS Agent (source build)"

if [ -f "$MICRO_ROS_WS/install/setup.bash" ]; then
    warn "micro-ROS workspace already exists at $MICRO_ROS_WS, skipping"
else
    mkdir -p "$MICRO_ROS_WS/src"
    cd "$MICRO_ROS_WS/src"

    # Clone micro-ROS agent and dependencies
    git clone -b humble https://github.com/micro-ROS/micro-ROS-Agent.git
    git clone -b humble https://github.com/micro-ROS/micro_ros_msgs.git

    cd "$MICRO_ROS_WS"

    # Install dependencies
    rosdep install --from-paths src --ignore-src -y || true

    # Build
    echo -e "${YELLOW}  → Building micro-ROS Agent...${NC}"
    colcon build --symlink-install \
        --cmake-args -DCMAKE_BUILD_TYPE=Release \
        --parallel-workers "$(nproc)" 2>&1 | tail -5

    log "micro-ROS Agent built at $MICRO_ROS_WS"
fi

# Add to bashrc
if ! grep -q "microros_ws/install/setup.bash" ~/.bashrc; then
    echo "source $MICRO_ROS_WS/install/setup.bash" >> ~/.bashrc
    log "Added micro-ROS source to ~/.bashrc"
fi

source "$MICRO_ROS_WS/install/setup.bash"

# ─── 6. USB/Serial Permissions ────────────────────────────────────────────
step "6/6  USB Permissions for Teensy"

# Create udev rule for Teensy 4.1
UDEV_RULE='ATTRS{idVendor}=="16c0", ATTRS{idProduct}=="0483", MODE="0666", GROUP="dialout", SYMLINK+="teensy"'
if [ ! -f /etc/udev/rules.d/49-teensy.rules ]; then
    echo "$UDEV_RULE" | sudo tee /etc/udev/rules.d/49-teensy.rules > /dev/null
    sudo udevadm control --reload-rules
    sudo udevadm trigger
    log "Teensy udev rule created"
else
    warn "Teensy udev rule already exists"
fi

# Add user to dialout group (for serial access)
sudo usermod -aG dialout "$USER"
log "User added to dialout group"

# ─── Done! ──────────────────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}${GREEN}╔══════════════════════════════════════════════════════╗${NC}"
echo -e "${BOLD}${GREEN}║         ✅ Setup Complete!                           ║${NC}"
echo -e "${BOLD}${GREEN}╚══════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "  ${BOLD}Next steps:${NC}"
echo -e "  1. ${CYAN}Reboot${NC} (or log out and back in for group changes)"
echo -e "  2. ${CYAN}sudo tailscale up${NC} — authenticate Tailscale"
echo -e "  3. ${CYAN}tailscale ip -4${NC} — note down your Pi's Tailscale IP"
echo -e "  4. ${CYAN}Plug in the Teensy via USB${NC}"
echo -e "  5. ${CYAN}cd $(dirname "$(realpath "$0")") && docker compose up -d${NC} — start ROSBridge"
echo -e "  6. ${CYAN}./raspi_launch.sh${NC} — start all services"
echo ""
echo -e "  ${YELLOW}⚠ You MUST reboot before running the launch script!${NC}"
echo ""
