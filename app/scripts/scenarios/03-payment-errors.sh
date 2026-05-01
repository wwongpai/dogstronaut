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
echo "   CosmoCab 🚀  Payment Errors Demo"
echo "   Demonstrates error rate injection"
echo "  ═══════════════════════════════════════════"
echo -e "${NC}"

future_date() {
  local days="$1"
  if date -v+${days}d +%Y-%m-%d 2>/dev/null; then return; fi
  date -d "+${days} days" +%Y-%m-%d
}

reset_chaos() {
  curl -sf -X POST "${PAYMENT_URL}/admin/chaos" \
    -H "Content-Type: application/json" \
    -d '{"mode": "normal"}' > /dev/null 2>&1 || true
  echo -e "${GREEN}  ✓ Payment service chaos reset to normal${NC}"
}

trap reset_chaos EXIT

# Set payment service to error chaos
echo -e "${YELLOW}▶ Setting payment-service chaos mode → error (40% failure rate)...${NC}"
curl -sf -X POST "${PAYMENT_URL}/admin/chaos" \
  -H "Content-Type: application/json" \
  -d '{"mode": "error"}' > /dev/null && \
  echo -e "${GREEN}  ✓ Chaos mode set${NC}" || \
  echo -e "${YELLOW}  ⚠ Could not set chaos directly — using X-Chaos-Mode header instead${NC}"

echo ""
echo -e "${YELLOW}Making 10 booking + payment attempts...${NC}\n"

SUCCESS=0
FAILED=0

for i in $(seq 1 10); do
  # Create booking first
  booking_response=$(curl -sf -X POST "${BASE_URL}/api/bookings" \
    -H "Content-Type: application/json" \
    -d "{
      \"destination_id\": \"mars\",
      \"passenger_name\": \"Test Passenger $i\",
      \"passenger_email\": \"test${i}@cosmocab.space\",
      \"departure_date\": \"$(future_date 60)\",
      \"rocket_class\": \"economy\",
      \"pilot_name\": \"aria_v2\"
    }" 2>&1) || { echo -e "${RED}  ✗ [$i/10] Booking creation failed${NC}"; FAILED=$((FAILED+1)); continue; }

  booking_id=$(echo "$booking_response" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4 || echo "")
  price=$(echo "$booking_response" | grep -o '"total_price_usd":"[^"]*"' | head -1 | cut -d'"' -f4 || echo "2500000")

  if [ -z "$booking_id" ]; then
    echo -e "${RED}  ✗ [$i/10] No booking ID returned${NC}"
    FAILED=$((FAILED+1))
    continue
  fi

  # Attempt payment
  payment_result=$(curl -sf -o /dev/null -w "%{http_code}" -X POST "${BASE_URL}/api/payments/process" \
    -H "Content-Type: application/json" \
    -H "X-Chaos-Mode: error" \
    -d "{
      \"booking_id\": \"${booking_id}\",
      \"amount_usd\": ${price:-2500000},
      \"card_last_four\": \"$(printf '%04d' $((RANDOM % 10000)))\"
    }" 2>&1) || payment_result="500"

  if [ "$payment_result" = "200" ]; then
    SUCCESS=$((SUCCESS+1))
    echo -e "${GREEN}  ✅ [$i/10] Payment SUCCEEDED (HTTP 200) — Ref: ${booking_id:0:8}${NC}"
  else
    FAILED=$((FAILED+1))
    echo -e "${RED}  💳 [$i/10] Payment FAILED (HTTP ${payment_result}) — ${booking_id:0:8}${NC}"
  fi

  sleep 0.8
done

echo ""
echo -e "${BOLD}${RED}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BOLD}  💥 PAYMENT ERRORS SPIKING!${NC}"
echo -e "  Successful payments: ${SUCCESS}/10"
echo -e "  Failed payments:     ${FAILED}/10"
echo -e "  Error rate:          $((FAILED * 100 / 10))%"
echo -e "${BOLD}${RED}  👉 Check Datadog APM Error Tracking!${NC}"
echo -e "${BOLD}${RED}  👉 Look for 4xx/5xx spike in dogstronaut-payment${NC}"
echo -e "${BOLD}${RED}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

echo -e "${YELLOW}⏳ Keeping error chaos active for 30 seconds...${NC}"
echo -e "${CYAN}   (Check Datadog APM → Error Tracking now!)${NC}"
sleep 30

echo -e "\n${GREEN}⏰ Resetting payment chaos mode...${NC}"
# trap will call reset_chaos on exit
