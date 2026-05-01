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
echo "   CosmoCab 🚀  Seed Traffic"
echo "   Generating 10 realistic bookings..."
echo "  ═══════════════════════════════════════════"
echo -e "${NC}"

DESTINATIONS=("iss" "moon" "mars" "jupiter" "saturn")
CLASSES=("economy" "business" "first_class")
PILOTS=("captain_buzz" "aria_v2" "rookie_rick")

NAMES=(
  "Elon Richguy"
  "Jeff Spacesworth"
  "Amelia Starcroft"
  "Neil Youngblood"
  "Buzz McMillionaire"
  "Sally Rocketson"
  "Chris Voidwalker"
  "Mae Cosmopolitan"
  "Owen Nebula"
  "Peggy Galaxywit"
)

EMAILS=(
  "elon@richguy.com"
  "jeff@spacesworth.com"
  "amelia@starcroft.io"
  "neil@youngblood.space"
  "buzz@mcmillionaire.com"
  "sally@rocketson.io"
  "chris@voidwalker.space"
  "mae@cosmopolitan.com"
  "owen@nebula.io"
  "peggy@galaxywit.space"
)

# Get a date N days from now
future_date() {
  local days="$1"
  if date -v+${days}d +%Y-%m-%d 2>/dev/null; then
    return
  fi
  date -d "+${days} days" +%Y-%m-%d
}

make_booking() {
  local i="$1"
  local dest="${DESTINATIONS[$((RANDOM % ${#DESTINATIONS[@]}))]}"
  local class="${CLASSES[$((RANDOM % ${#CLASSES[@]}))]}"
  local pilot="${PILOTS[$((RANDOM % ${#PILOTS[@]}))]}"
  local name="${NAMES[$i]}"
  local email="${EMAILS[$i]}"
  local days=$((30 + RANDOM % 300))
  local dep_date
  dep_date=$(future_date $days)

  local payload
  payload=$(cat <<EOF
{
  "destination_id": "${dest}",
  "passenger_name": "${name}",
  "passenger_email": "${email}",
  "departure_date": "${dep_date}",
  "rocket_class": "${class}",
  "pilot_name": "${pilot}"
}
EOF
)

  local response
  response=$(curl -sf -X POST "${BASE_URL}/api/bookings" \
    -H "Content-Type: application/json" \
    -d "$payload" 2>&1) || { echo -e "${RED}  ✗ Booking failed for ${name}${NC}"; return; }

  local booking_id
  booking_id=$(echo "$response" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4 || echo "unknown")

  echo -e "${GREEN}  ✓ Booked: ${name} → ${dest} (${class}, ${pilot}) | Ref: ${booking_id:0:8}${NC}"
}

echo -e "${YELLOW}Creating 10 bookings...${NC}\n"

for i in $(seq 0 9); do
  make_booking "$i"
  sleep 0.5
done

echo -e "\n${BOLD}${GREEN}✅ Seeding complete! 10 bookings created.${NC}"
echo -e "${CYAN}Check Datadog APM → Services → dogstronaut-booking${NC}"
