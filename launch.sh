#!/usr/bin/env bash
# OmniTrading Cross-Platform Local Launcher
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PORT="${PORT:-${OMNI_PORT:-8787}}"
HOST="${HOST:-${OMNI_HOST:-127.0.0.1}}"
HEALTH_URL="http://${HOST}:${PORT}/api/health"

# Locate Node binary dynamically
NODE_BIN="$(command -v node || true)"
if [[ -z "$NODE_BIN" ]]; then
  for candidate in "$HOME/.local/share/mise/installs/node/latest/bin/node" /usr/local/bin/node /usr/bin/node; do
    if [[ -x "$candidate" ]]; then
      NODE_BIN="$candidate"
      break
    fi
  done
fi

if [[ -z "$NODE_BIN" ]]; then
  echo "Error: Node.js (v18+) is required to run OmniTrading." >&2
  exit 1
fi

# Build bundle if missing
if [[ ! -f "$APP_DIR/dist/app.js" ]]; then
  echo "Building OmniTrading application bundle..."
  (cd "$APP_DIR" && npm run build)
fi

# Check if server is already running
if ! curl -sf "$HEALTH_URL" >/dev/null 2>&1; then
  echo "Starting local OmniTrading server on http://${HOST}:${PORT}..."
  (cd "$APP_DIR" && "$NODE_BIN" "$APP_DIR/server/omni-server.mjs" &)
  
  for _ in $(seq 1 40); do
    if curl -sf "$HEALTH_URL" >/dev/null 2>&1; then
      break
    fi
    sleep 0.1
  done
fi

echo "OmniTrading is ready at http://${HOST}:${PORT}"

# If running on desktop, optionally launch browser or Chromium app window
if command -v xdg-open >/dev/null 2>&1; then
  xdg-open "http://${HOST}:${PORT}" >/dev/null 2>&1 || true
elif command -v open >/dev/null 2>&1; then
  open "http://${HOST}:${PORT}" >/dev/null 2>&1 || true
fi
