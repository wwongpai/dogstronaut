#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

SERVICE="${1:-}"

cd "$APP_DIR"

if [ -n "$SERVICE" ]; then
  echo "📋 Streaming logs for: $SERVICE"
  docker-compose logs -f "$SERVICE"
else
  echo "📋 Streaming logs for all services (Ctrl+C to stop)..."
  echo "   Tip: Pass a service name to filter: $0 booking-service"
  docker-compose logs -f
fi
