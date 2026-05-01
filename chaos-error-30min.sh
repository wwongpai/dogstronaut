#!/usr/bin/env bash
# Trigger 30 minutes of 100% error mode across all services (all replicas), then restore normal
set -euo pipefail

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; BOLD='\033[1m'; NC='\033[0m'
NAMESPACE="dogstronaut"

get_port() {
  case "$1" in
    booking-service)       echo 4001 ;;
    payment-service)       echo 4002 ;;
    fleet-service)         echo 4003 ;;
    user-service)          echo 4004 ;;
    seat-check-service)    echo 4005 ;;
    loyalty-service)       echo 4006 ;;
    launch-control-service) echo 4007 ;;
    notification-service)  echo 4008 ;;
  esac
}

set_chaos_mode() {
  local mode="$1"
  if [[ "$mode" == "error-full" ]]; then
    echo -e "${BOLD}▶ Setting chaos mode → ${RED}error-full (100% errors)${NC}"
  else
    echo -e "${BOLD}▶ Setting chaos mode → ${GREEN}${mode}${NC}"
  fi

  for svc in booking-service payment-service fleet-service user-service seat-check-service loyalty-service launch-control-service notification-service; do
    local port
    port=$(get_port "$svc")
    # Set on ALL pods (all replicas)
    for pod in $(kubectl get pod -n "$NAMESPACE" -l "app=$svc" -o jsonpath='{.items[*].metadata.name}' 2>/dev/null); do
      kubectl exec "$pod" -n "$NAMESPACE" -- \
        wget -qO- --header="Content-Type: application/json" \
        --post-data="{\"mode\":\"$mode\"}" \
        "http://localhost:$port/admin/chaos" > /dev/null 2>&1 \
        && echo -e "  ${GREEN}✓ $pod → $mode${NC}" \
        || echo -e "  ${RED}✗ $pod failed${NC}"
    done
  done
}

set_chaos_mode "error-full"

echo ""
echo -e "${YELLOW}  Waiting 30 minutes (1800s)...${NC}"
sleep 1800

echo ""
set_chaos_mode "normal"

echo ""
echo -e "${GREEN}Done! 100% error mode ran for 30 minutes, all replicas restored to normal.${NC}"
