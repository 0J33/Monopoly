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
echo "→ remote install"
"${SSH[@]}" "$HOST" "source ~/.nvm/nvm.sh 2>/dev/null || true; cd $SERVER_DIR && npm install --omit=dev"

# The restart cannot assume sudo. `sudo systemctl restart monopoly-server`
# needs either a NOPASSWD rule (disinteg has them for factorio and tegtech,
# not for this one) or a terminal to type a password into — and a scripted
# ssh has no terminal, so it failed with "a terminal is required to read the
# password" AFTER everything had been copied: a deploy that looked finished
# and was still running the old code.
#
# The unit is Restart=on-failure, so killing the process is a restart, and
# killing our own service needs no privilege. sudo is still tried first, so
# adding a NOPASSWD rule later silently upgrades this to the clean path.
echo "→ restart"
"${SSH[@]}" "$HOST" bash -s <<'REMOTE'
set -u
unit=monopoly-server
before=$(systemctl show "$unit" -p MainPID --value)
if sudo -n systemctl restart "$unit" 2>/dev/null; then
    echo "  restarted via sudo"
else
    echo "  no sudo for $unit; killing pid ${before} — Restart=on-failure brings it back"
    if [ -n "$before" ] && [ "$before" != "0" ]; then kill -9 "$before" 2>/dev/null || true; fi
fi
for _ in $(seq 1 20); do
    sleep 1
    now=$(systemctl show "$unit" -p MainPID --value)
    state=$(systemctl show "$unit" -p ActiveState --value)
    if [ "$state" = "active" ] && [ -n "$now" ] && [ "$now" != "0" ] && [ "$now" != "$before" ]; then
        echo "  up as pid $now"
        exit 0
    fi
done
echo "  FAILED: $unit did not come back" >&2
systemctl show "$unit" -p ActiveState -p SubState --value >&2
exit 1
REMOTE

echo "✓ deployed"
