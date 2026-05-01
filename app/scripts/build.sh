#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

echo -e "${BOLD}${CYAN}"
echo "  ╔═══════════════════════════════════════╗"
echo "  ║   CosmoCab 🚀  Build All Images       ║"
echo "  ╚═══════════════════════════════════════╝"
echo -e "${NC}"

TAG="${1:-latest}"

# Load .env if present
if [ -f "$APP_DIR/.env" ]; then
  set -a
  source "$APP_DIR/.env"
  set +a
  echo -e "${GREEN}✓ Loaded .env${NC}"
fi

build_image() {
  local name="$1"
  local context="$2"
  local extra_args="${3:-}"

  echo -e "\n${YELLOW}▶ Building cosmocab/${name}:${TAG}...${NC}"
  local cmd="docker build -t cosmocab/${name}:${TAG} ${extra_args} ${context}"
  echo -e "  ${cmd}"
  eval "$cmd"
  echo -e "${GREEN}  ✓ cosmocab/${name}:${TAG} built${NC}"
}

# Fleet Service
build_image "fleet-service" "$APP_DIR/fleet-service"

# Payment Service
build_image "payment-service" "$APP_DIR/payment-service"

# Booking Service
build_image "booking-service" "$APP_DIR/booking-service"

# Frontend — VITE_ args are baked at build time (not available at runtime in nginx).
# Require both RUM env vars; fail if missing rather than silently use someone else's tokens.
if [ -z "${VITE_DD_RUM_APPLICATION_ID:-}" ] || [ -z "${VITE_DD_RUM_CLIENT_TOKEN:-}" ]; then
  echo "ERROR: Set VITE_DD_RUM_APPLICATION_ID and VITE_DD_RUM_CLIENT_TOKEN before building the frontend."
  echo "       Get both from: Datadog UI → UX Monitoring → RUM Applications → (your app) → Setup."
  exit 1
fi
VITE_RUM_APP_ID="${VITE_DD_RUM_APPLICATION_ID}"
VITE_RUM_CLIENT_TOKEN="${VITE_DD_RUM_CLIENT_TOKEN}"
VITE_ENV="${VITE_DD_ENV:-${DD_ENV:-demo}}"

echo -e "\n${YELLOW}▶ Building cosmocab/frontend:${TAG} (with RUM args baked in)...${NC}"
docker build \
  --build-arg VITE_DD_RUM_APPLICATION_ID="${VITE_RUM_APP_ID}" \
  --build-arg VITE_DD_RUM_CLIENT_TOKEN="${VITE_RUM_CLIENT_TOKEN}" \
  --build-arg VITE_DD_ENV="${VITE_ENV}" \
  -t cosmocab/frontend:${TAG} \
  "$APP_DIR/frontend"
echo -e "${GREEN}  ✓ cosmocab/frontend:${TAG} built${NC}"

echo -e "\n${BOLD}${GREEN}✅ All images built successfully!${NC}"
echo ""
echo "Images:"
docker images | grep cosmocab | grep "$TAG"
