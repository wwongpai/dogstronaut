#!/usr/bin/env bash
set -euo pipefail

# ─────────────────────────────────────────────────────────────
# Color output helpers
# ─────────────────────────────────────────────────────────────
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BOLD='\033[1m'
NC='\033[0m' # No Color

ok()   { echo -e "${GREEN}[OK]${NC}    $*"; }
err()  { echo -e "${RED}[ERROR]${NC} $*" >&2; }
warn() { echo -e "${YELLOW}[WARN]${NC}  $*"; }
info() { echo -e "${BOLD}[INFO]${NC}  $*"; }

# ─────────────────────────────────────────────────────────────
# Step 1: Validate required environment variables
# ─────────────────────────────────────────────────────────────
info "Checking required environment variables..."

MISSING=0
for var in DD_API_KEY DD_RUM_APPLICATION_ID DD_RUM_CLIENT_TOKEN POSTGRES_PASSWORD DOCKERHUB_USERNAME; do
  if [ -z "${!var:-}" ]; then
    err "Required environment variable is not set: ${var}"
    MISSING=1
  fi
done

if [ "$MISSING" -ne 0 ]; then
  echo ""
  err "One or more required environment variables are missing."
  echo ""
  echo "  Please export the following before running this script:"
  echo ""
  echo "    export DD_API_KEY=<your-datadog-api-key>"
  echo "    export DD_RUM_APPLICATION_ID=<your-rum-application-id>"
  echo "    export DD_RUM_CLIENT_TOKEN=<your-rum-client-token>"
  echo "    export POSTGRES_PASSWORD=<a-secure-database-password>"
  echo "    export DOCKERHUB_USERNAME=<your-dockerhub-username>"
  echo ""
  exit 1
fi

ok "All required environment variables are set."

# ─────────────────────────────────────────────────────────────
# Step 2: Create namespace
# ─────────────────────────────────────────────────────────────
info "Creating namespace dogstronaut..."
kubectl apply -f app/k8s-gke/00-namespace.yaml
ok "Namespace applied."

# ─────────────────────────────────────────────────────────────
# Step 3: Create Kubernetes secrets (via kubectl, never in YAML)
# ─────────────────────────────────────────────────────────────
info "Creating Kubernetes secrets..."

kubectl create secret generic dogstronaut-secrets \
  --from-literal=postgres-password="${POSTGRES_PASSWORD}" \
  -n dogstronaut --dry-run=client -o yaml | kubectl apply -f -
ok "dogstronaut-secrets created/updated."

kubectl create secret generic datadog-secret \
  --from-literal=api-key="${DD_API_KEY}" \
  -n dogstronaut --dry-run=client -o yaml | kubectl apply -f -
ok "datadog-secret created/updated."

# ─────────────────────────────────────────────────────────────
# Step 4: Install Datadog Agent via Helm
# ─────────────────────────────────────────────────────────────
info "Adding Datadog Helm repo..."
helm repo add datadog https://helm.datadoghq.com
helm repo update
ok "Helm repo updated."

info "Installing/upgrading Datadog Agent with embedded DDOT Collector..."
helm upgrade --install datadog-agent datadog/datadog \
  -n dogstronaut \
  -f app/helm/datadog-values.yaml \
  --set-file datadog.otelCollector.config=app/helm/otel-config.yaml
ok "Datadog Agent + DDOT Collector deployed."

# ─────────────────────────────────────────────────────────────
# Step 5: Apply all application manifests
# ─────────────────────────────────────────────────────────────
info "Applying Kubernetes manifests..."
kubectl apply -f app/k8s-gke/ -n dogstronaut
ok "All manifests applied."

# ─────────────────────────────────────────────────────────────
# Step 6: Wait for PostgreSQL to be ready
# ─────────────────────────────────────────────────────────────
info "Waiting for PostgreSQL StatefulSet to be ready..."
kubectl rollout status statefulset/postgres -n dogstronaut --timeout=120s
ok "PostgreSQL is ready."

# ─────────────────────────────────────────────────────────────
# Step 7: Wait for all application deployments
# ─────────────────────────────────────────────────────────────
info "Waiting for application deployments to roll out..."

kubectl rollout status deployment/booking-service -n dogstronaut --timeout=120s
ok "booking-service is ready."

kubectl rollout status deployment/payment-service -n dogstronaut --timeout=120s
ok "payment-service is ready."

kubectl rollout status deployment/fleet-service -n dogstronaut --timeout=120s
ok "fleet-service is ready."

kubectl rollout status deployment/user-service -n dogstronaut --timeout=120s
ok "user-service is ready."

kubectl rollout status deployment/frontend -n dogstronaut --timeout=120s
ok "frontend is ready."

# ─────────────────────────────────────────────────────────────
# Step 8: Print external IP for frontend
# ─────────────────────────────────────────────────────────────
info "Retrieving frontend LoadBalancer external IP..."
echo ""

EXTERNAL_IP=""
RETRIES=20
for i in $(seq 1 $RETRIES); do
  EXTERNAL_IP=$(kubectl get service frontend -n dogstronaut \
    -o jsonpath='{.status.loadBalancer.ingress[0].ip}' 2>/dev/null || true)
  if [ -n "$EXTERNAL_IP" ]; then
    break
  fi
  warn "External IP not yet assigned (attempt $i/$RETRIES). Waiting 15s..."
  sleep 15
done

if [ -n "$EXTERNAL_IP" ]; then
  echo ""
  ok "Dogstronaut Tours frontend is live at: ${GREEN}http://${EXTERNAL_IP}${NC}"
  echo ""
else
  warn "External IP could not be determined yet. Run the following to check:"
  echo "  kubectl get service frontend -n dogstronaut"
  echo ""
fi

# ─────────────────────────────────────────────────────────────
# Step 9: Print next steps
# ─────────────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}════════════════════════════════════════════════════════${NC}"
echo -e "${BOLD}  NEXT STEPS${NC}"
echo -e "${BOLD}════════════════════════════════════════════════════════${NC}"
echo ""
echo "  1. Verify pods are running:"
echo "       kubectl get pods -n dogstronaut"
echo ""
echo "  2. If you need to update RUM allowedTracingUrls in the frontend,"
echo "     rebuild the frontend image with the correct EXTERNAL_IP:"
echo "       export VITE_DD_RUM_APPLICATION_ID=${DD_RUM_APPLICATION_ID}"
echo "       export VITE_DD_RUM_CLIENT_TOKEN=${DD_RUM_CLIENT_TOKEN}"
echo "       docker build --build-arg VITE_DD_RUM_APPLICATION_ID=\$VITE_DD_RUM_APPLICATION_ID \\"
echo "                    --build-arg VITE_DD_RUM_CLIENT_TOKEN=\$VITE_DD_RUM_CLIENT_TOKEN \\"
echo "                    -t ${DOCKERHUB_USERNAME}/dogstronaut-frontend:latest app/frontend/"
echo "       docker push ${DOCKERHUB_USERNAME}/dogstronaut-frontend:latest"
echo "       kubectl rollout restart deployment/frontend -n dogstronaut"
echo ""
echo "  3. View logs:"
echo "       kubectl logs -l app=booking-service -n dogstronaut --tail=50"
echo ""
echo "  4. Chaos scheduler CronJobs:"
echo "       kubectl get cronjobs -n dogstronaut"
echo "       # Trigger manually: kubectl create job --from=cronjob/chaos-enable-errors chaos-test -n dogstronaut"
echo ""
echo "  5. Datadog:"
echo "       https://app.datadoghq.com/apm/services"
echo ""
echo -e "${GREEN}Deployment complete!${NC}"
