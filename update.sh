#!/bin/bash

docker stop passivbot
docker compose -f "docker-compose.yml" up -d --build