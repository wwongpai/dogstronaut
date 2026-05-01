#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

echo -e "${BOLD}${CYAN}"
echo "  ╔════════════════════════════════════════════╗"
echo "  ║   CosmoCab 🚀  Starting Local Environment  ║"
echo "  ╚════════════════════════════════════════════╝"
echo -e "${NC}"

# Check .env
if [ ! -f "$APP_DIR/.env" ]; then
  echo -e "${YELLOW}⚠  No .env file found. Copying from .env.example...${NC}"
  cp "$APP_DIR/.env.example" "$APP_DIR/.env"
  echo -e "${RED}   Please edit $APP_DIR/.env and add your DD_API_KEY, then re-run.${NC}"
  exit 1
fi

# Check docker / docker-compose
if ! command -v docker &>/dev/null; then
  echo -e "${RED}✗ Docker not found. Install Docker Desktop.${NC}"
  exit 1
fi

# Start services
echo -e "\n${YELLOW}▶ Starting all services with docker-compose...${NC}"
cd "$APP_DIR"
docker-compose up -d --build

echo -e "\n${YELLOW}⏳ Waiting for services to become healthy...${NC}"

wait_for_health() {
  local url="$1"
  local name="$2"
  local max_attempts=30
  local attempt=0

  while [ $attempt -lt $max_attempts ]; do
    if curl -sf "$url" > /dev/null 2>&1; then
      echo -e "${GREEN}  ✓ ${name} is healthy${NC}"
      return 0
    fi
    attempt=$((attempt + 1))
    sleep 2
  done

  echo -e "${YELLOW}  ⚠ ${name} did not become healthy in time (may still be starting)${NC}"
  return 0
}

wait_for_health "http://localhost:4003/health" "Fleet Service (4003)"
wait_for_health "http://localhost:4002/health" "Payment Service (4002)"
wait_for_health "http://localhost:4001/health" "Booking Service (4001)"
wait_for_health "http://localhost:3000" "Frontend (3000)"

echo -e "\n${BOLD}${GREEN}🚀 CosmoCab is ready!${NC}"
echo ""
echo -e "  ${BOLD}Frontend:${NC}         http://localhost:3000"
echo -e "  ${BOLD}Booking API:${NC}      http://localhost:4001/api"
echo -e "  ${BOLD}Payment API:${NC}      http://localhost:4002"
echo -e "  ${BOLD}Fleet API:${NC}        http://localhost:4003"
echo -e "  ${BOLD}Health checks:${NC}"
echo -e "    http://localhost:4001/health"
echo -e "    http://localhost:4002/health"
echo -e "    http://localhost:4003/health"
echo ""
echo -e "  ${BOLD}Datadog Agent APM:${NC} localhost:8126"
echo -e "  ${BOLD}Datadog Agent StatsD:${NC} localhost:8125"
echo ""
echo -e "${CYAN}Run scenario scripts from: $SCRIPT_DIR/scenarios/${NC}"
echo -e "${CYAN}View logs: $SCRIPT_DIR/local-logs.sh${NC}"
