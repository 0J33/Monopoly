#!/usr/bin/env bash
# Build + ship monopoly to disinteg. Run from the repo root:
#   ./deploy/push.sh
#
# Auth: if deploy/deploy.local.env (gitignored) sets SSHPASS, ssh/rsync use
# password auth via `sshpass -e` (the password never appears on a command
# line). Otherwise it falls back to key-based auth.

set -euo pipefail
cd "$(dirname "$0")/.."

# Source gitignored secrets if present.
if [[ -f deploy/deploy.local.env ]]; then
    set -o allexport
    # shellcheck disable=SC1091
    source deploy/deploy.local.env
    set +o allexport
fi

HOST="${REMOTE_HOST:-disinteg@100.118.201.77}"
SERVER_DIR="/home/disinteg/monopoly-server"
CLIENT_DIR="/home/disinteg/monopoly-client"

# `sshpass -e` reads the password from $SSHPASS so it never appears on the
# command line or in a process listing.
if [[ -n "${SSHPASS:-}" ]]; then
    export SSHPASS
    SSH=(sshpass -e ssh -o StrictHostKeyChecking=accept-new)
    RSYNC=(sshpass -e rsync -az --delete -e "ssh -o StrictHostKeyChecking=accept-new")
else
    SSH=(ssh)
    RSYNC=(rsync -az --delete)
fi

# 1) Build client locally so the box doesn't need node_modules bloat.
echo "→ building client…"
pushd client >/dev/null
CI=true npm run build
popd >/dev/null

# 2) Sync client static files.
echo "→ syncing client → $CLIENT_DIR"
"${RSYNC[@]}" client/build/ "$HOST:$CLIENT_DIR/"

# 3) Sync server source. node_modules rebuilt remotely so native bindings match.
echo "→ syncing server → $SERVER_DIR"
"${RSYNC[@]}" \
    --exclude node_modules \
    --exclude .env \
    --exclude '*.log' \
    server/ "$HOST:$SERVER_DIR/"

# 4) Remote install + restart. A non-interactive ssh shell doesn't load nvm,
# so source it first to get node/npm on PATH.
echo "→ remote install + restart"
"${SSH[@]}" "$HOST" "source ~/.nvm/nvm.sh 2>/dev/null || true; cd $SERVER_DIR && npm install --omit=dev && sudo systemctl restart monopoly-server"

echo "✓ deployed"
