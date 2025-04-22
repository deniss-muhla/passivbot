#!/bin/bash

COMPOSE_BAKE=true docker compose -f 'docker-compose-configurator.yml' up -d --build
