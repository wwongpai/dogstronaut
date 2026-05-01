#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

echo "🛑 Stopping CosmoCab local environment..."
cd "$APP_DIR"
docker-compose down

echo "✓ CosmoCab stopped. Safe travels (from Earth)."
