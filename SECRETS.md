# Secrets Management

This document lists all secrets required to deploy Dogstronaut Tours.
**No actual secret values are stored in this repository.**

---

## Required Secrets

### 1. Datadog API Key (`DD_API_KEY`)

- **What it is:** Your Datadog organization API key, used by the Datadog Agent to ship metrics, logs, and traces.
- **Where to get it:** Datadog UI > Organization Settings > API Keys
- **How it is used:** Stored as a Kubernetes secret `datadog-secret` in the `dogstronaut` namespace, referenced by the Datadog Helm chart via `apiKeyExistingSecret`.

### 2. Datadog RUM Application ID (`DD_RUM_APPLICATION_ID`)

- **What it is:** The Application ID for the Datadog RUM (Real User Monitoring) application.
- **Where to get it:** Datadog UI > UX Monitoring > RUM Applications > your app > Setup & Configuration
- **How it is used:** Passed as a build argument (`VITE_DD_RUM_APPLICATION_ID`) when building the frontend Docker image. Baked into the static bundle at build time.

### 3. Datadog RUM Client Token (`DD_RUM_CLIENT_TOKEN`)

- **What it is:** The client token for the Datadog RUM application (safe for browser exposure, scoped to RUM only).
- **Where to get it:** Same location as the RUM Application ID above.
- **How it is used:** Passed as a build argument (`VITE_DD_RUM_CLIENT_TOKEN`) when building the frontend Docker image.

### 4. PostgreSQL Password (`POSTGRES_PASSWORD`)

- **What it is:** The password for the `postgres` database user.
- **Where to get it:** You generate this yourself. Use a strong random password (e.g., `openssl rand -base64 32`).
- **How it is used:** Stored as a Kubernetes secret `dogstronaut-secrets` in the `dogstronaut` namespace, referenced by all backend services and the PostgreSQL StatefulSet.

### 5. Docker Hub Username (`DOCKERHUB_USERNAME`)

- **What it is:** Your Docker Hub username, used to construct image push commands in next-step instructions.
- **Where to get it:** Your Docker Hub account (https://hub.docker.com).
- **How it is used:** Referenced in `deploy.sh` output for image rebuild instructions only. Not stored in any manifest.

### 6. Grafana Admin Password (`GRAFANA_ADMIN_PASSWORD`)

- **What it is:** The admin password for the Grafana instance in the observability silo stack. Only required when running `deploy-silo.sh`.
- **Where to get it:** You generate this yourself. Use a strong random password (e.g., `openssl rand -base64 24`).
- **How it is used:** Stored as a Kubernetes secret `grafana-admin` (key `admin-password`) in the `observability-silo` namespace, referenced by the Grafana Deployment via `secretKeyRef`.

---

## How to Provide Secrets Before Deploying

Export all secrets as environment variables in your shell session before running `deploy.sh`:

```bash
export DD_API_KEY=<your-datadog-api-key>
export DD_RUM_APPLICATION_ID=<your-rum-application-id>
export DD_RUM_CLIENT_TOKEN=<your-rum-client-token>
export POSTGRES_PASSWORD=<a-secure-database-password>
export DOCKERHUB_USERNAME=<your-dockerhub-username>

./deploy.sh
```

---

## How Secrets Are Created in Kubernetes

`deploy.sh` creates secrets using `kubectl` with `--dry-run=client -o yaml | kubectl apply -f -` (idempotent — safe to re-run):

```bash
# Application database password
kubectl create secret generic dogstronaut-secrets \
  --from-literal=postgres-password="$POSTGRES_PASSWORD" \
  -n dogstronaut --dry-run=client -o yaml | kubectl apply -f -

# Datadog Agent API key
kubectl create secret generic datadog-secret \
  --from-literal=api-key="$DD_API_KEY" \
  -n dogstronaut --dry-run=client -o yaml | kubectl apply -f -
```

**These commands are the only place secrets enter the cluster.
No YAML file in this repository contains any secret value.**

---

## Secret Names and Keys Reference

| K8s Secret Name       | Key                | Namespace            | Used By                                        |
|-----------------------|--------------------|----------------------|------------------------------------------------|
| `dogstronaut-secrets` | `postgres-password`| `dogstronaut`        | PostgreSQL StatefulSet, all backend services   |
| `datadog-secret`      | `api-key`          | `dogstronaut`        | Datadog Agent (via Helm `apiKeyExistingSecret`)|
| `grafana-admin`       | `admin-password`   | `observability-silo` | Grafana Deployment (silo stack only)           |

---

## Local Development (docker-compose)

For local development with `docker-compose`, copy `.env.example` to `.env` and fill in real values:

```bash
cp app/.env.example app/.env
# Edit app/.env with your real values
```

The `.env` file is gitignored and must never be committed.
