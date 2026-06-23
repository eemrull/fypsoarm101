#!/bin/bash
# ============================================================================
# SO-ARM101 — Rapid Deployment Script
# Usage: ./sync_and_run.sh
# This script automates the tedious pull -> build -> launch workflow.
# ============================================================================

# Colors
GREEN='\033[0;32m'
CYAN='\033[0;36m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${CYAN}🚀 Starting Rapid Deployment...${NC}"

# 1. Pull latest changes
echo -e "${YELLOW}📥 Pulling latest code from Git...${NC}"
git pull || { echo -e "${RED}❌ Git pull failed${NC}"; exit 1; }

# 2. Make launch scripts executable
echo -e "${YELLOW}🔐 Ensuring launch scripts are executable...${NC}"
chmod +x launch_robot.sh
chmod +x launch_raspi_docker.sh

# 3. Rebuild and restart Docker services
# We use --build to ensure code changes in the dashboard are baked in.
# We use --remove-orphans to keep the environment clean.
echo -e "${YELLOW}🛠 Rebuilding and starting Docker services...${NC}"
docker compose up -d --build --remove-orphans

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ Deployment successful!${NC}"
    echo -e "🔗 Dashboard: ${CYAN}http://localhost:3000/play/so-arm101${NC}"
    echo -e "📜 View logs: ${YELLOW}docker compose logs -f${NC}"
else
    echo -e "${RED}❌ Deployment failed. Check the error messages above.${NC}"
    exit 1
fi
