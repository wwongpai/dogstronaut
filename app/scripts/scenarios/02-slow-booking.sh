#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:4001}"
PAYMENT_URL="${PAYMENT_URL:-http://localhost:4002}"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

echo -e "${BOLD}${CYAN}"
echo "  ═══════════════════════════════════════════"
echo "   CosmoCab 🚀  Slow Booking Demo"
echo "   Demonstrates latency injection via chaos"
echo "  ═══════════════════════════════════════════"
echo -e "${NC}"

future_date() {
  local days="$1"
  if date -v+${days}d +%Y-%m-%d 2>/dev/null; then return; fi
  date -d "+${days} days" +%Y-%m-%d
}

make_booking_timed() {
  local name="$1"
  local chaos="${2:-normal}"

  local headers=()
  if [ "$chaos" != "normal" ]; then
    headers+=(-H "X-Chaos-Mode: $chaos")
  fi

  local start
  start=$(date +%s%3N 2>/dev/null || date +%s)

  local result
  result=$(curl -sf -w "\n%{http_code}" -X POST "${BASE_URL}/api/bookings" \
    "${headers[@]}" \
    -H "Content-Type: application/json" \
    -d "{
      \"destination_id\": \"moon\",
      \"passenger_name\": \"${name}\",
      \"passenger_email\": \"test@cosmocab.space\",
      \"departure_date\": \"$(future_date 30)\",
      \"rocket_class\": \"economy\",
      \"pilot_name\": \"captain_buzz\"
    }" 2>&1) || { echo -e "${RED}  ✗ Request failed${NC}"; return; }

  local http_code
  http_code=$(echo "$result" | tail -1)

  local end
  end=$(date +%s%3N 2>/dev/null || date +%s)
  local duration=$((end - start))

  echo "$duration $http_code"
}

set_chaos_mode() {
  local service_url="$1"
  local mode="$2"
  local service_name="$3"

  response=$(curl -sf -X POST "${service_url}/admin/chaos" \
    -H "Content-Type: application/json" \
    -d "{\"mode\": \"${mode}\"}" 2>&1) || { echo -e "${YELLOW}  ⚠ Could not set chaos on ${service_name}${NC}"; return; }

  echo -e "${CYAN}  ⚙ ${service_name} chaos mode → ${mode}${NC}"
}

reset_chaos() {
  set_chaos_mode "$BASE_URL" "normal" "booking-service"
  set_chaos_mode "$PAYMENT_URL" "normal" "payment-service"
  echo -e "${GREEN}  ✓ Chaos mode reset to normal${NC}"
}

# Trap to reset on exit
trap reset_chaos EXIT

# ─────────────────────────────────────────────
# Phase 1: Normal bookings (fast)
# ─────────────────────────────────────────────
echo -e "${BOLD}Phase 1: Normal bookings (no chaos)${NC}"
echo -e "${YELLOW}Making 5 bookings...${NC}\n"

NORMAL_TIMES=()
for i in $(seq 1 5); do
  result=$(make_booking_timed "Normal User $i" "normal")
  dur=$(echo "$result" | awk '{print $1}')
  code=$(echo "$result" | awk '{print $2}')
  NORMAL_TIMES+=("$dur")
  echo -e "${GREEN}  ✅ Booking $i: ${dur}ms (HTTP ${code:-200})${NC}"
  sleep 1
done

avg_normal=0
for t in "${NORMAL_TIMES[@]}"; do avg_normal=$((avg_normal + t)); done
avg_normal=$((avg_normal / ${#NORMAL_TIMES[@]}))
echo -e "\n${BOLD}  Average normal latency: ${avg_normal}ms${NC}"

# ─────────────────────────────────────────────
# Phase 2: Slow chaos injected
# ─────────────────────────────────────────────
echo -e "\n${BOLD}${YELLOW}Phase 2: Injecting latency chaos...${NC}"
sleep 1

set_chaos_mode "$BASE_URL" "slow" "booking-service"
set_chaos_mode "$PAYMENT_URL" "slow" "payment-service"

echo -e "\n${YELLOW}Making 5 bookings with slow chaos...${NC}\n"

SLOW_TIMES=()
for i in $(seq 1 5); do
  echo -e "${YELLOW}  Booking $i (slow mode)...${NC}"
  result=$(make_booking_timed "Slow User $i" "slow")
  dur=$(echo "$result" | awk '{print $1}')
  code=$(echo "$result" | awk '{print $2}')
  SLOW_TIMES+=("$dur")
  echo -e "${RED}  🐌 Booking $i: ${dur}ms (HTTP ${code:-200}) ← SLOW!${NC}"
  sleep 0.5
done

avg_slow=0
for t in "${SLOW_TIMES[@]}"; do avg_slow=$((avg_slow + t)); done
avg_slow=$((avg_slow / ${#SLOW_TIMES[@]}))
echo -e "\n${BOLD}  Average SLOW latency: ${avg_slow}ms${NC}"

echo ""
echo -e "${BOLD}${RED}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BOLD}  🐌 NOTICE THE LATENCY SPIKE?${NC}"
echo -e "  Normal avg: ${avg_normal}ms"
echo -e "  Slow avg:   ${avg_slow}ms"
echo -e "  Increase:   ~$((avg_slow / (avg_normal + 1)))x slower"
echo -e "${BOLD}${RED}  👉 Check Datadog APM → Traces!${NC}"
echo -e "${BOLD}${RED}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

echo -e "${YELLOW}⏳ Keeping chaos active for 60 seconds for demo observation...${NC}"
echo -e "${CYAN}   (Open Datadog APM now to see latency spike in Service Map)${NC}"
sleep 60

echo -e "\n${GREEN}⏰ Resetting chaos mode...${NC}"
# trap will call reset_chaos on exit
