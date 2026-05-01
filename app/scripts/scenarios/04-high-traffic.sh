#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:4001}"
CONCURRENCY="${CONCURRENCY:-50}"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

echo -e "${BOLD}${CYAN}"
echo "  ═══════════════════════════════════════════"
echo "   CosmoCab 🚀  High Traffic Load Test"
echo "   ${CONCURRENCY} concurrent requests!"
echo "  ═══════════════════════════════════════════"
echo -e "${NC}"

DESTINATIONS=("iss" "moon" "mars" "jupiter" "saturn")
CLASSES=("economy" "business" "first_class")
PILOTS=("captain_buzz" "aria_v2" "rookie_rick")

future_date() {
  local days="$1"
  if date -v+${days}d +%Y-%m-%d 2>/dev/null; then return; fi
  date -d "+${days} days" +%Y-%m-%d
}

rand_element() {
  local arr=("$@")
  echo "${arr[$((RANDOM % ${#arr[@]}))]}"
}

# Temp file for results
RESULTS_FILE=$(mktemp)
trap "rm -f $RESULTS_FILE" EXIT

single_request() {
  local id="$1"
  local dest="${DESTINATIONS[$((RANDOM % ${#DESTINATIONS[@]}))]}"
  local class="${CLASSES[$((RANDOM % ${#CLASSES[@]}))]}"
  local pilot="${PILOTS[$((RANDOM % ${#PILOTS[@]}))]}"

  local start
  start=$(date +%s%3N 2>/dev/null || date +%s)

  local http_code
  http_code=$(curl -sf -o /dev/null -w "%{http_code}" -X POST "${BASE_URL}/api/bookings" \
    -H "Content-Type: application/json" \
    -d "{
      \"destination_id\": \"${dest}\",
      \"passenger_name\": \"Load Test User ${id}\",
      \"passenger_email\": \"loadtest${id}@cosmocab.space\",
      \"departure_date\": \"$(future_date $((30 + RANDOM % 100)))\",
      \"rocket_class\": \"${class}\",
      \"pilot_name\": \"${pilot}\"
    }" 2>&1) || http_code="000"

  local end
  end=$(date +%s%3N 2>/dev/null || date +%s)
  local dur=$((end - start))

  echo "${id} ${http_code} ${dur}" >> "$RESULTS_FILE"

  if [ "$http_code" = "201" ] || [ "$http_code" = "200" ]; then
    echo -e "${GREEN}  ✅ Request ${id}: HTTP ${http_code} (${dur}ms)${NC}"
  else
    echo -e "${RED}  ✗ Request ${id}: HTTP ${http_code} (${dur}ms)${NC}"
  fi
}

export -f single_request future_date
export BASE_URL DESTINATIONS CLASSES PILOTS RESULTS_FILE

echo -e "${BOLD}${YELLOW}🚀 Firing ${CONCURRENCY} concurrent booking requests!${NC}"
echo -e "${CYAN}Watch your infra metrics spike in Datadog!${NC}\n"

# Launch concurrent requests
PIDS=()
for i in $(seq 1 "$CONCURRENCY"); do
  single_request "$i" &
  PIDS+=($!)
  # Small stagger to avoid thundering herd being too perfect
  if (( i % 10 == 0 )); then
    sleep 0.1
  fi
done

# Wait for all
echo -e "\n${YELLOW}⏳ Waiting for all ${CONCURRENCY} requests to complete...${NC}"
for pid in "${PIDS[@]}"; do
  wait "$pid" 2>/dev/null || true
done

# Analyze results
TOTAL=$(wc -l < "$RESULTS_FILE" | tr -d ' ')
SUCCESS=$(grep -c ' 201 \| 200 ' "$RESULTS_FILE" 2>/dev/null || echo 0)
ERRORS=$(grep -v ' 201 \| 200 ' "$RESULTS_FILE" 2>/dev/null | wc -l | tr -d ' ')

if [ "$TOTAL" -gt 0 ]; then
  SUM=0
  while read -r _ _ dur; do
    SUM=$((SUM + dur))
  done < "$RESULTS_FILE"
  AVG=$((SUM / TOTAL))
else
  AVG=0
fi

echo ""
echo -e "${BOLD}${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BOLD}  🚀 HIGH TRAFFIC TEST COMPLETE!${NC}"
echo -e "  Total requests:    ${TOTAL}"
echo -e "  Successful:        ${SUCCESS}"
echo -e "  Errors:            ${ERRORS}"
echo -e "  Avg duration:      ${AVG}ms"
echo -e "${BOLD}${CYAN}  👉 Watch your infra metrics in Datadog!${NC}"
echo -e "${BOLD}${CYAN}  👉 Check APM → Service Map for call volume${NC}"
echo -e "${BOLD}${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
