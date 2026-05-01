#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:4001}"
ITERATIONS="${ITERATIONS:-30}"
DELAY="${DELAY:-2}"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

echo -e "${BOLD}${CYAN}"
echo "  ═══════════════════════════════════════════"
echo "   CosmoCab 🚀  Normal Traffic Simulation"
echo "   ${ITERATIONS} bookings, ${DELAY}s delay between each"
echo "  ═══════════════════════════════════════════"
echo -e "${NC}"

DESTINATIONS=("iss" "moon" "mars" "jupiter" "saturn")
CLASSES=("economy" "business" "first_class")
PILOTS=("captain_buzz" "aria_v2" "rookie_rick")

FIRST_NAMES=("Alex" "Jordan" "Morgan" "Casey" "Riley" "Taylor" "Drew" "Quinn" "Blake" "Charlie")
LAST_NAMES=("Cosmos" "Stardust" "Orbit" "Nebula" "Quasar" "Pulsar" "Vega" "Lyra" "Orion" "Cygnus")

future_date() {
  local days="$1"
  if date -v+${days}d +%Y-%m-%d 2>/dev/null; then return; fi
  date -d "+${days} days" +%Y-%m-%d
}

rand_element() {
  local arr=("$@")
  echo "${arr[$((RANDOM % ${#arr[@]}))]}"
}

for i in $(seq 1 "$ITERATIONS"); do
  dest=$(rand_element "${DESTINATIONS[@]}")
  class=$(rand_element "${CLASSES[@]}")
  pilot=$(rand_element "${PILOTS[@]}")
  fname=$(rand_element "${FIRST_NAMES[@]}")
  lname=$(rand_element "${LAST_NAMES[@]}")
  name="$fname $lname"
  email="${fname,,}.${lname,,}@cosmotravel.space"
  days=$((14 + RANDOM % 180))
  dep_date=$(future_date $days)

  start_time=$(date +%s%N 2>/dev/null || date +%s)

  # 1. List destinations
  curl -sf "${BASE_URL}/api/destinations" > /dev/null

  # 2. Create booking
  booking_response=$(curl -sf -X POST "${BASE_URL}/api/bookings" \
    -H "Content-Type: application/json" \
    -d "{
      \"destination_id\": \"${dest}\",
      \"passenger_name\": \"${name}\",
      \"passenger_email\": \"${email}\",
      \"departure_date\": \"${dep_date}\",
      \"rocket_class\": \"${class}\",
      \"pilot_name\": \"${pilot}\"
    }" 2>&1) || { echo -e "${RED}  ✗ [$i/${ITERATIONS}] Booking failed${NC}"; sleep "$DELAY"; continue; }

  booking_id=$(echo "$booking_response" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4 || echo "")
  price=$(echo "$booking_response" | grep -o '"total_price_usd":"[^"]*"' | head -1 | cut -d'"' -f4 || echo "?")

  # 3. Process payment
  payment_response=$(curl -sf -X POST "${BASE_URL}/api/payments/process" \
    -H "Content-Type: application/json" \
    -d "{
      \"booking_id\": \"${booking_id}\",
      \"amount_usd\": ${price:-9999},
      \"card_last_four\": \"$(printf '%04d' $((RANDOM % 10000)))\"
    }" 2>&1) || true

  # 4. Get booking confirmation
  if [ -n "$booking_id" ]; then
    curl -sf "${BASE_URL}/api/bookings/${booking_id}" > /dev/null || true
  fi

  end_time=$(date +%s%N 2>/dev/null || date +%s)
  if [[ "$start_time" =~ ^[0-9]{19}$ ]]; then
    duration_ms=$(( (end_time - start_time) / 1000000 ))
    duration="${duration_ms}ms"
  else
    duration="~${DELAY}s"
  fi

  ref="${booking_id:0:8}"
  echo -e "${GREEN}  ✅ [$i/${ITERATIONS}] Normal booking completed: ${ref:-unknown} | ${dest} / ${class} | ${duration}${NC}"

  sleep "$DELAY"
done

echo -e "\n${BOLD}${GREEN}✅ Normal traffic simulation complete!${NC}"
echo -e "${CYAN}Check Datadog APM for trace data.${NC}"
