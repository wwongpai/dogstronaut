#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

export BASE_URL="${BASE_URL:-http://localhost:4001}"
export PAYMENT_URL="${PAYMENT_URL:-http://localhost:4002}"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
MAGENTA='\033[0;35m'
BOLD='\033[1m'
NC='\033[0m'

reset_all_chaos() {
  echo -e "${YELLOW}  Resetting all chaos modes to normal...${NC}"
  curl -sf -X POST "${BASE_URL}/admin/chaos" \
    -H "Content-Type: application/json" \
    -d '{"mode": "normal"}' > /dev/null 2>&1 && echo -e "${GREEN}  ✓ booking-service reset${NC}" || true
  curl -sf -X POST "${PAYMENT_URL}/admin/chaos" \
    -H "Content-Type: application/json" \
    -d '{"mode": "normal"}' > /dev/null 2>&1 && echo -e "${GREEN}  ✓ payment-service reset${NC}" || true
  echo -e "${GREEN}  ✓ All services back to normal${NC}"
}

show_menu() {
  echo -e "\n${BOLD}${CYAN}"
  echo "  ╔══════════════════════════════════════════════╗"
  echo "  ║      CosmoCab 🚀  DEMO SCENARIO RUNNER       ║"
  echo "  ║   Your ride to the stars — Datadog Edition   ║"
  echo "  ╠══════════════════════════════════════════════╣"
  echo -e "  ║                                              ║${NC}${BOLD}${CYAN}"
  echo "  ║  1) 🌱 Seed Traffic (10 initial bookings)     ║"
  echo "  ║  2) 🚀 Normal Traffic (30 bookings loop)      ║"
  echo "  ║  3) 🐌 Slow Booking Demo (latency spike)      ║"
  echo "  ║  4) 💳 Payment Errors Demo (error spike)      ║"
  echo "  ║  5) ⚡ High Traffic Load Test (50 concurrent)  ║"
  echo "  ║  6) 💥 Frontend Error Scenarios               ║"
  echo "  ║  7) 🔄 Reset All Chaos Modes                  ║"
  echo "  ║  8) ❌ Exit                                    ║"
  echo "  ║                                              ║"
  echo "  ╚══════════════════════════════════════════════╝"
  echo -e "${NC}"
  echo -e "  ${BOLD}Base URL:${NC} ${BASE_URL}"
  echo -e "  ${BOLD}Payment URL:${NC} ${PAYMENT_URL}"
  echo ""
}

run_scenario() {
  local script="$1"
  local name="$2"
  local bg="${3:-false}"

  if [ ! -f "$script" ]; then
    echo -e "${RED}  ✗ Script not found: $script${NC}"
    return
  fi

  chmod +x "$script"

  echo -e "\n${BOLD}${MAGENTA}▶ Running: ${name}${NC}\n"

  if [ "$bg" = "true" ]; then
    bash "$script" &
    local pid=$!
    echo -e "${CYAN}  Running in background (PID: ${pid})${NC}"
    echo -e "${CYAN}  Press Enter to return to menu...${NC}"
    read -r
  else
    bash "$script"
  fi
}

main() {
  while true; do
    show_menu
    echo -n "  Select option [1-8]: "
    read -r choice

    case "$choice" in
      1)
        run_scenario "$SCRIPT_DIR/00-seed-traffic.sh" "Seed Traffic"
        ;;
      2)
        echo -e "${CYAN}  Running normal traffic in background...${NC}"
        run_scenario "$SCRIPT_DIR/01-normal-traffic.sh" "Normal Traffic" "true"
        ;;
      3)
        run_scenario "$SCRIPT_DIR/02-slow-booking.sh" "Slow Booking Demo"
        ;;
      4)
        run_scenario "$SCRIPT_DIR/03-payment-errors.sh" "Payment Errors Demo"
        ;;
      5)
        run_scenario "$SCRIPT_DIR/04-high-traffic.sh" "High Traffic Load Test"
        ;;
      6)
        run_scenario "$SCRIPT_DIR/05-frontend-errors.sh" "Frontend Error Scenarios"
        ;;
      7)
        echo -e "\n${BOLD}${YELLOW}Resetting all chaos modes...${NC}"
        reset_all_chaos
        ;;
      8)
        echo -e "\n${BOLD}${GREEN}Goodbye! May your deploys be green and your traces be fast. 🚀${NC}\n"
        # Reset on exit
        reset_all_chaos 2>/dev/null || true
        exit 0
        ;;
      *)
        echo -e "${RED}  Invalid option. Please select 1-8.${NC}"
        ;;
    esac

    echo -e "\n${CYAN}  Press Enter to return to menu...${NC}"
    read -r
  done
}

main
