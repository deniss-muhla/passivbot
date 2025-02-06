#!/bin/bash

API_KEYS_FILE="api-keys.json"

# Fill in api-keys.json
read -p "Enter your Bybit API key: " BYBIT_API_KEY
read -s -p "Enter your Bybit API secret: " BYBIT_API_SECRET
cat > "$API_KEYS_FILE" <<EOF
{
  "bybit_passivbot": {
    "exchange": "bybit",
    "key": "$BYBIT_API_KEY",
    "secret": "$BYBIT_API_SECRET"
  }
}
EOF
echo "Created $API_KEYS_FILE"

docker compose -f "docker-compose.yml" up -d --build