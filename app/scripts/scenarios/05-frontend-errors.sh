#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:4001}"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

echo -e "${BOLD}${CYAN}"
echo "  ═══════════════════════════════════════════"
echo "   CosmoCab 🚀  Frontend Error Scenarios"
echo "   Trigger API errors visible in RUM + APM"
echo "  ═══════════════════════════════════════════"
echo -e "${NC}"

echo -e "${BOLD}Available error scenarios:${NC}"
echo ""
echo -e "  ${YELLOW}1. Invalid booking payload${NC} — triggers 400 from booking-service"
echo -e "  ${YELLOW}2. Non-existent destination${NC} — triggers 404"
echo -e "  ${YELLOW}3. Non-existent booking lookup${NC} — triggers 404"
echo -e "  ${YELLOW}4. Payment with no booking${NC} — triggers 400 from payment-service"
echo -e "  ${YELLOW}5. Inject booking-service chaos: error mode${NC} — 30% 500 errors"
echo -e "  ${YELLOW}6. Reset all chaos modes${NC}"
echo ""

# Scenario 1: Bad booking payload
echo -e "${BOLD}═══ Scenario 1: Invalid booking payload (400) ═══${NC}"
for i in 1 2 3; do
  result=$(curl -sf -o /dev/null -w "%{http_code}" -X POST "${BASE_URL}/api/bookings" \
    -H "Content-Type: application/json" \
    -d '{"destination_id": "moon"}' 2>&1) || result="000"
  echo -e "  Request $i: HTTP ${result} (expected 400)"
  sleep 0.3
done

echo ""

# Scenario 2: Non-existent destination
echo -e "${BOLD}═══ Scenario 2: Invalid destination (404) ═══${NC}"
for dest in "pluto" "sun" "uranus-69"; do
  result=$(curl -sf -o /dev/null -w "%{http_code}" "${BASE_URL}/api/destinations/${dest}" 2>&1) || result="000"
  echo -e "  GET /api/destinations/${dest}: HTTP ${result} (expected 404)"
  sleep 0.3
done

echo ""

# Scenario 3: Non-existent booking
echo -e "${BOLD}═══ Scenario 3: Non-existent booking (404) ═══${NC}"
for uuid in "00000000-0000-0000-0000-000000000001" "non-existent-booking-id" "ffffffff-ffff-ffff-ffff-ffffffffffff"; do
  result=$(curl -sf -o /dev/null -w "%{http_code}" "${BASE_URL}/api/bookings/${uuid}" 2>&1) || result="000"
  echo -e "  GET /api/bookings/${uuid:0:20}...: HTTP ${result}"
  sleep 0.3
done

echo ""

# Scenario 4: Payment with no booking ID
echo -e "${BOLD}═══ Scenario 4: Payment with missing fields (400) ═══${NC}"
for i in 1 2 3; do
  result=$(curl -sf -o /dev/null -w "%{http_code}" -X POST "${BASE_URL}/api/payments/process" \
    -H "Content-Type: application/json" \
    -d "{\"card_last_four\": \"1234\"}" 2>&1) || result="000"
  echo -e "  Request $i: HTTP ${result} (expected 400)"
  sleep 0.3
done

echo ""

# Scenario 5: Inject error chaos
echo -e "${BOLD}═══ Scenario 5: Error chaos (30% 500s on booking-service) ═══${NC}"
curl -sf -X POST "${BASE_URL}/admin/chaos" \
  -H "Content-Type: application/json" \
  -d '{"mode": "error"}' > /dev/null && \
  echo -e "${RED}  ✓ Booking-service chaos → error mode${NC}" || \
  echo -e "${YELLOW}  ⚠ Could not set chaos mode${NC}"

echo -e "  Making 10 requests (expect ~30% failures)..."
for i in $(seq 1 10); do
  result=$(curl -sf -o /dev/null -w "%{http_code}" -X POST "${BASE_URL}/api/bookings" \
    -H "Content-Type: application/json" \
    -d '{
      "destination_id": "moon",
      "passenger_name": "Error Test",
      "passenger_email": "error@test.space",
      "departure_date": "2027-06-01",
      "rocket_class": "economy",
      "pilot_name": "aria_v2"
    }' 2>&1) || result="000"

  if [ "$result" = "201" ] || [ "$result" = "200" ]; then
    echo -e "${GREEN}  ✅ Request $i: HTTP ${result}${NC}"
  else
    echo -e "${RED}  💥 Request $i: HTTP ${result}${NC}"
  fi
  sleep 0.4
done

echo ""
echo -e "${BOLD}${RED}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BOLD}  💥 Check Datadog for:${NC}"
echo -e "  👉 APM → Error Tracking → dogstronaut-booking"
echo -e "  👉 RUM → Errors (if triggered from browser)"
echo -e "  👉 Logs → Filter by level:error"
echo -e "${BOLD}${RED}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# Scenario 6: Reset
echo -e "${BOLD}═══ Resetting chaos modes ═══${NC}"
curl -sf -X POST "${BASE_URL}/admin/chaos" \
  -H "Content-Type: application/json" \
  -d '{"mode": "normal"}' > /dev/null && \
  echo -e "${GREEN}  ✓ booking-service chaos reset${NC}"

echo ""
echo -e "${BOLD}${GREEN}✅ Frontend error scenarios complete!${NC}"
