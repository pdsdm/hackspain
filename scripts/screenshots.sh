#!/usr/bin/env bash
set -euo pipefail

ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
OUT_DIR=${SCREENSHOT_DIR:-"$ROOT/docs/screenshots"}
FRONTEND_URL=${SCREENSHOT_FRONTEND_URL:-http://localhost:5173}
BACKEND_URL=${SCREENSHOT_BACKEND_URL:-http://localhost:8000}
WAIT_S=${SCREENSHOT_WAIT_S:-20}

find_chrome() {
  if [ -n "${CHROME_BIN:-}" ] && [ -x "$CHROME_BIN" ]; then
    echo "$CHROME_BIN"
    return
  fi
  local c
  for c in \
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
    "/Applications/Chromium.app/Contents/MacOS/Chromium" \
    "$HOME/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"; do
    [ -x "$c" ] && { echo "$c"; return; }
  done
  for c in google-chrome google-chrome-stable chromium chromium-browser; do
    command -v "$c" >/dev/null 2>&1 && { command -v "$c"; return; }
  done
  echo "No se encontró Chrome/Chromium. Define CHROME_BIN con la ruta al binario." >&2
  exit 1
}

CHROME=$(find_chrome)
mkdir -p "$OUT_DIR"

curl -fsS "$BACKEND_URL/health" >/dev/null || {
  echo "El backend no responde en $BACKEND_URL. Arranca con ./scripts/demo.sh up-local" >&2
  exit 1
}
curl -fsS -o /dev/null "$FRONTEND_URL/" || {
  echo "El frontend no responde en $FRONTEND_URL. Arranca con ./scripts/demo.sh up-local" >&2
  exit 1
}

shot() {
  "$CHROME" --headless=new --disable-gpu --hide-scrollbars \
    --window-size="$2" --virtual-time-budget=25000 \
    --screenshot="$OUT_DIR/$1" "$FRONTEND_URL/" 2>/dev/null | tail -1 || true
  echo "→ $OUT_DIR/$1"
}

reset_fixture() {
  curl -fsS -X POST "$BACKEND_URL/simulation/reset" \
    -H 'Content-Type: application/json' -d "{\"fixture\":\"$1\"}" >/dev/null
}

reset_fixture pabellon_b_400
sleep "$WAIT_S"
shot panel-general.png 1680,1050

reset_fixture proposal
sleep 2
shot panel-decision.png 1680,1050
shot panel-movil.png 390,844

echo "Capturas listas en $OUT_DIR"
