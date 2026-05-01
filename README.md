# Dogstronaut Tours

> **Disclaimer:** Personal demo project. Not affiliated with or endorsed by Datadog, Inc. All views, code, and materials in this repository are the author's own.

A multi-service observability demo app: a fake space-travel booking platform that runs on Kubernetes and emits traces, logs, metrics, and RUM sessions to Datadog, with an optional parallel open-source observability stack.

This repository contains **only the code needed to deploy and run the app.** The demo guide, talk track, slides, and screenshots live separately in Confluence.

---

## Repository layout

```
.
├── app/                          Main application (Kubernetes-hosted)
│   ├── frontend/                 React + Vite + nginx, Datadog RUM instrumented
│   ├── booking-service/          Node.js + Express + dd-trace
│   ├── payment-service/          Node.js + Express + dd-trace
│   ├── fleet-service/            Node.js + Express + dd-trace
│   ├── user-service/             Node.js + Express + dd-trace
│   ├── seat-check-service/       Node.js + Express + dd-trace
│   ├── loyalty-service/          Node.js + Express + dd-trace
│   ├── launch-control-service/   Node.js + Express + dd-trace
│   ├── notification-service/     Node.js + Express + dd-trace
│   ├── chaos-scheduler/          Flips services into error/slow/normal modes
│   ├── load-test/                Load test scripts driven by a CronJob
│   ├── playwright/               Synthetic browser traffic for RUM
│   ├── helm/                     Datadog Agent Helm values + DDOT OTel config
│   ├── k8s-gke/                  Primary Kubernetes manifests (GKE)
│   ├── k8s-gke-silo/             Optional open-source observability silo manifests
│   └── scripts/                  Local docker-compose helper scripts
├── streaming-chat/               Standalone Cloud Run live-chat service (Node + Socket.IO)
├── deploy.sh                     Deploy app + Datadog Agent to GKE
├── deploy-silo.sh                Deploy optional observability silo stack to GKE
├── chaos-error-10min.sh          Inject 10 min of errors, auto-reset
├── chaos-error-30min.sh          Inject 30 min of errors, auto-reset
└── SECRETS.md                    Which env vars/secrets are required
```

---

## Prerequisites

- GKE cluster (or any Kubernetes cluster with LoadBalancer support)
- `kubectl`, `helm`, `docker`, `gcloud` on your path
- A container registry you can push to (Docker Hub by default)
- A Datadog account with an API key
- A Datadog RUM application (for `applicationId` + `clientToken`)

---

## Quick start

1. Read `SECRETS.md` — lists every required env var and how it enters the cluster.
2. Export all required env vars in your shell:

   ```bash
   export DD_API_KEY=<your-datadog-api-key>
   export DD_RUM_APPLICATION_ID=<your-rum-application-id>
   export DD_RUM_CLIENT_TOKEN=<your-rum-client-token>
   export POSTGRES_PASSWORD=$(openssl rand -base64 32)
   export DOCKERHUB_USERNAME=<your-dockerhub-username>
   ```

3. Deploy the app + Datadog Agent:

   ```bash
   ./deploy.sh
   ```

   This creates the namespace, creates Kubernetes secrets, installs the Datadog Agent via Helm (with the embedded DDOT OTel collector), applies all app manifests, and waits for rollouts.

4. (Optional) Deploy the silo comparison stack:

   ```bash
   ./deploy-silo.sh
   ```

5. (Optional) Deploy the live chat app to Cloud Run:

   ```bash
   cd streaming-chat
   ./deploy.sh
   ```

6. Get the frontend LoadBalancer IP:

   ```bash
   kubectl get svc frontend -n dogstronaut
   ```

---

## Rebuilding the frontend image with your own RUM credentials

RUM IDs are baked into the Vite bundle at build time, so you must rebuild the frontend image to use your own RUM application:

```bash
docker build \
  --build-arg VITE_DD_RUM_APPLICATION_ID=$DD_RUM_APPLICATION_ID \
  --build-arg VITE_DD_RUM_CLIENT_TOKEN=$DD_RUM_CLIENT_TOKEN \
  -t $DOCKERHUB_USERNAME/dogstronaut-frontend:latest \
  app/frontend/
docker push $DOCKERHUB_USERNAME/dogstronaut-frontend:latest

# Update the image tag in app/k8s-gke/06-frontend.yaml, then:
kubectl rollout restart deployment/frontend -n dogstronaut
```

---

## Chaos injection

```bash
./chaos-error-10min.sh   # 10 min of errors across all services, auto-reset
./chaos-error-30min.sh   # 30 min
```

Manual override on a specific service:

```bash
POD=$(kubectl get pod -n dogstronaut -l app=booking-service -o jsonpath='{.items[0].metadata.name}')
kubectl exec -n dogstronaut $POD -- \
  wget -qO- --header="Content-Type: application/json" \
  --post-data='{"mode":"error"}' http://localhost:4001/admin/chaos
```

Modes: `normal`, `slow`, `error`, `error-full`.

---

## Secrets

**No real credentials are committed.** All secrets enter the cluster at deploy time via environment variables. See `SECRETS.md` for the full list and how each is wired up.

`.env.example` files throughout the repo show the expected variable names — copy to `.env` (gitignored) locally for local Docker Compose runs.

---

## Namespaces

- `dogstronaut` — main application + Datadog Agent DaemonSet
- `observability-silo` — optional open-source observability silo (only if you run `deploy-silo.sh`)
