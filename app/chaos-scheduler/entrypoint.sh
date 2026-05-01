#!/bin/sh
MODE=${1:-normal}
NAMESPACE=dogstronaut

SERVICES="
http://booking-service.dogstronaut.svc.cluster.local:4001
http://payment-service.dogstronaut.svc.cluster.local:4002
http://fleet-service.dogstronaut.svc.cluster.local:4003
http://user-service.dogstronaut.svc.cluster.local:4004
http://seat-check-service.dogstronaut.svc.cluster.local:4005
http://loyalty-service.dogstronaut.svc.cluster.local:4006
http://launch-control-service.dogstronaut.svc.cluster.local:4007
http://notification-service.dogstronaut.svc.cluster.local:4008
"

echo "[chaos-scheduler] Setting chaos mode to: $MODE"
for url in $SERVICES; do
  result=$(curl -s -w " HTTP:%{http_code}" -X POST "$url/admin/chaos" \
    -H "Content-Type: application/json" \
    -d "{\"mode\":\"$MODE\"}" 2>/dev/null || echo "FAILED")
  echo "[chaos-scheduler] $url -> $result"
done
echo "[chaos-scheduler] Done."
