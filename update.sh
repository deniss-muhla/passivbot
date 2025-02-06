#!/bin/bash

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR" || exit 1

docker stop passivbot
git pull
docker compose -f "docker-compose.yml" up -d --build
docker attach passivbot
