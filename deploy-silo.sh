#!/usr/bin/env bash
# Deploy Observability Silo stack (ELK + Prometheus/Grafana + Jaeger)
# Note: DDOT Collector is embedded inside the Datadog Agent (helm upgrade handles it)
set -euo pipefail

GREEN='\033[0;32m'; CYAN='\033[0;36m'; BOLD='\033[1m'; NC='\033[0m'
step() { echo -e "\n${BOLD}${CYAN}▶ $1${NC}"; }
ok()   { echo -e "  ${GREEN}✓${NC} $1"; }

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

step "1/5 — Creating observability-silo namespace"
kubectl apply -f "$SCRIPT_DIR/app/k8s-gke-silo/00-namespace.yaml"

step "2/5 — Deploying Elasticsearch"
kubectl apply -f "$SCRIPT_DIR/app/k8s-gke-silo/01-elasticsearch.yaml"
echo "  Waiting for Elasticsearch to be ready (may take ~60s)..."
kubectl wait --for=condition=ready pod -l app=elasticsearch -n observability-silo --timeout=180s
ok "Elasticsearch ready"

step "3/5 — Deploying Filebeat + Kibana"
kubectl apply -f "$SCRIPT_DIR/app/k8s-gke-silo/02-filebeat.yaml"
kubectl apply -f "$SCRIPT_DIR/app/k8s-gke-silo/03-kibana.yaml"
ok "Filebeat + Kibana applied"

step "4/5 — Deploying Prometheus stack (kube-state-metrics + node-exporter + Prometheus + Grafana)"
kubectl apply -f "$SCRIPT_DIR/app/k8s-gke-silo/04-kube-state-metrics.yaml"
kubectl apply -f "$SCRIPT_DIR/app/k8s-gke-silo/05-node-exporter.yaml"
kubectl apply -f "$SCRIPT_DIR/app/k8s-gke-silo/06-prometheus.yaml"

if [ -z "${GRAFANA_ADMIN_PASSWORD:-}" ]; then
  echo "ERROR: GRAFANA_ADMIN_PASSWORD is not set. Export it before running deploy-silo.sh." >&2
  echo "  e.g. export GRAFANA_ADMIN_PASSWORD=\"\$(openssl rand -base64 24)\"" >&2
  exit 1
fi
kubectl create secret generic grafana-admin \
  --from-literal=admin-password="$GRAFANA_ADMIN_PASSWORD" \
  -n observability-silo --dry-run=client -o yaml | kubectl apply -f -
ok "grafana-admin secret created/updated"

kubectl apply -f "$SCRIPT_DIR/app/k8s-gke-silo/07-grafana.yaml"
ok "Prometheus stack applied"

step "5/5 — Deploying Jaeger"
kubectl apply -f "$SCRIPT_DIR/app/k8s-gke-silo/08-jaeger.yaml"
ok "Jaeger applied"

step "Applying app Deployments (DD_TRACE_AGENT_URL → Agent APM port 8126)"
kubectl apply -f "$SCRIPT_DIR/app/k8s-gke/02-booking-service.yaml"
kubectl apply -f "$SCRIPT_DIR/app/k8s-gke/03-payment-service.yaml"
kubectl apply -f "$SCRIPT_DIR/app/k8s-gke/04-fleet-service.yaml"
kubectl apply -f "$SCRIPT_DIR/app/k8s-gke/05-user-service.yaml"
kubectl rollout status deployment/booking-service -n dogstronaut --timeout=120s
kubectl rollout status deployment/payment-service -n dogstronaut --timeout=120s
kubectl rollout status deployment/fleet-service   -n dogstronaut --timeout=120s
kubectl rollout status deployment/user-service    -n dogstronaut --timeout=120s
ok "All app deployments updated"

echo ""
echo -e "${BOLD}Waiting for LoadBalancer IPs...${NC}"
sleep 30
kubectl get svc -n observability-silo -o custom-columns="NAME:.metadata.name,TYPE:.spec.type,EXTERNAL-IP:.status.loadBalancer.ingress[0].ip,PORT:.spec.ports[0].port" | grep -v "^NAME"

echo ""
echo -e "${BOLD}${GREEN}═══════════════════════════════════════════${NC}"
echo -e "${BOLD} Silo Stack deployed!${NC}"
echo -e "${BOLD}${GREEN}═══════════════════════════════════════════${NC}"
echo ""
echo " Silo UIs (update loadBalancerSourceRanges in k8s-gke-silo/*.yaml to restrict access):"
KIBANA_IP=$(kubectl get svc kibana -n observability-silo -o jsonpath='{.status.loadBalancer.ingress[0].ip}' 2>/dev/null || echo "pending")
GRAFANA_IP=$(kubectl get svc grafana -n observability-silo -o jsonpath='{.status.loadBalancer.ingress[0].ip}' 2>/dev/null || echo "pending")
JAEGER_IP=$(kubectl get svc jaeger-ui -n observability-silo -o jsonpath='{.status.loadBalancer.ingress[0].ip}' 2>/dev/null || echo "pending")
echo -e "  Kibana  (logs):    http://${KIBANA_IP}:5601"
echo -e "  Grafana (metrics): http://${GRAFANA_IP}:3000  (login: admin / \$GRAFANA_ADMIN_PASSWORD)"
echo -e "  Jaeger  (traces):  http://${JAEGER_IP}:16686"
echo ""
