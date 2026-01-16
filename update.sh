#!/usr/bin/env bash

set -euo pipefail

#SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR" || exit 1

COMPOSE_FILE="docker-compose-bot.yml"
SERVICE_NAME="passivbot"

echo "==> Stopping container (if running)"
docker compose -f "$COMPOSE_FILE" stop "$SERVICE_NAME" >/dev/null 2>&1 || true
docker stop passivbot >/dev/null 2>&1 || true

echo "==> Updating git working tree"
git pull --ff-only

echo "==> Building and starting"
docker compose -f "$COMPOSE_FILE" up -d --build --remove-orphans

echo "==> Pruning dangling images (safe)"
docker image prune -f
# Optional: prune build cache older than 24h
docker builder prune -f --filter until=24h >/dev/null 2>&1 || true

echo "==> Following logs (Ctrl+C to stop following; container keeps running)"
docker compose -f "$COMPOSE_FILE" logs -f --tail=200 "$SERVICE_NAME"
