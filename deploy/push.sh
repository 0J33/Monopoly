#!/usr/bin/env bash
# Build + ship monopoly to disinteg. Run from the repo root:
#   ./deploy/push.sh

set -euo pipefail

HOST="disinteg@100.118.201.77"
SERVER_DIR="/home/disinteg/monopoly-server"
CLIENT_DIR="/home/disinteg/monopoly-client"

# 1) Build client locally so the box doesn't need node_modules bloat.
echo "→ building client…"
pushd client >/dev/null
CI=true npm run build
popd >/dev/null

# 2) Sync client static files.
echo "→ syncing client → $CLIENT_DIR"
rsync -az --delete client/build/ "$HOST:$CLIENT_DIR/"

# 3) Sync server source. node_modules rebuilt remotely so native bindings match.
echo "→ syncing server → $SERVER_DIR"
rsync -az --delete \
    --exclude node_modules \
    --exclude .env \
    --exclude '*.log' \
    server/ "$HOST:$SERVER_DIR/"

# 4) Remote install + restart.
ssh "$HOST" "cd $SERVER_DIR && npm install --omit=dev && sudo systemctl restart monopoly-server"

echo "✓ deployed"
