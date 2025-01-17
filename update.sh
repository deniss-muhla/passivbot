#!/bin/bash

docker stop passivbot
git pull
docker compose -f "docker-compose.yml" up -d --build
docker attach passivbot
