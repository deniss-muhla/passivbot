#!/usr/bin/env bash

if [ -z "${BASH_VERSION:-}" ]; then
    if command -v bash >/dev/null 2>&1; then
        exec bash "$0" "$@"
    fi
    echo "This script requires bash. Try: bash $0" >&2
    exit 1
fi
# Optional safer updater which can run a short backtest smoke-test *before* restarting live.
#
# By default, it does NOT run a backtest (RUN_BACKTEST=0), because backtests may download OHLCV
# history and consume disk. Enable only on a staging host or if you are confident caches exist.
#
# Usage examples:
#   RUN_BACKTEST=0 ./update_with_backtest.sh
#   RUN_BACKTEST=1 BT_START_DATE=2026-01-10 BT_END_DATE=2026-01-16 ./update_with_backtest.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR" || exit 1

COMPOSE_LIVE="docker-compose-bot.yml"
COMPOSE_BACKTEST="docker-compose-backtest.yml"
SERVICE_NAME="passivbot"
RUN_BACKTEST="${RUN_BACKTEST:-0}"

BT_START_DATE="${BT_START_DATE:-}"
BT_END_DATE="${BT_END_DATE:-}"

echo "==> Stopping container (if running)"
docker compose -f "$COMPOSE_LIVE" stop "$SERVICE_NAME" >/dev/null 2>&1 || true
docker stop passivbot >/dev/null 2>&1 || true

echo "==> Updating git working tree"
git pull --ff-only

echo "==> Building image"
docker compose -f "$COMPOSE_LIVE" build

if [[ "$RUN_BACKTEST" == "1" ]]; then
    echo "==> Running backtest smoke-test"
    BT_ARGS=("configs/bybit/config.json" "--disable_plotting" "--log-level" "info")
    if [[ -n "$BT_START_DATE" ]]; then
        BT_ARGS+=("--backtest.start_date" "$BT_START_DATE")
    fi
    if [[ -n "$BT_END_DATE" ]]; then
        BT_ARGS+=("--backtest.end_date" "$BT_END_DATE")
    fi
    docker compose -f "$COMPOSE_BACKTEST" run --rm "$SERVICE_NAME" python src/backtest.py "${BT_ARGS[@]}"
fi

echo "==> Starting live"
docker compose -f "$COMPOSE_LIVE" up -d --remove-orphans

echo "==> Pruning dangling images (safe)"
docker image prune -f
docker builder prune -f --filter until=24h >/dev/null 2>&1 || true

echo "==> Following logs (Ctrl+C to stop following; container keeps running)"
docker compose -f "$COMPOSE_LIVE" logs -f --tail=200 "$SERVICE_NAME"
