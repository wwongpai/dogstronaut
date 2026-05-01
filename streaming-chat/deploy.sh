#!/usr/bin/env bash
set -euo pipefail

# ── Live Chat App — Build & Deploy Script ──
# Prerequisites:
#   - docker login as wwongpai (run once: docker login)
#   - gcloud auth login + gcloud auth configure-docker (if needed)
#   - docker buildx with a builder that supports linux/amd64

echo "==> [1/3] Building Docker image for linux/amd64 and pushing to Docker Hub..."
docker buildx build \
  --platform linux/amd64 \
  -t wwongpai/live-chat-app:latest \
  --push \
  .

echo ""
echo "==> [2/3] Deploying to Cloud Run (asia-southeast1)..."
gcloud run deploy live-chat-app \
  --image docker.io/wwongpai/live-chat-app:latest \
  --project datadog-ese-sandbox \
  --region asia-southeast1 \
  --allow-unauthenticated \
  --min-instances=1 \
  --max-instances=5 \
  --concurrency=100 \
  --memory=1Gi \
  --cpu=1 \
  --port=8080 \
  --timeout=3600 \
  --session-affinity

echo ""
echo "==> [3/3] Deployed! Service URL:"
gcloud run services describe live-chat-app \
  --project datadog-ese-sandbox \
  --region asia-southeast1 \
  --format 'value(status.url)'
