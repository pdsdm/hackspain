#!/usr/bin/env bash
set -euo pipefail

ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
RUNTIME_DIR=${DEMO_RUNTIME_DIR:-"$ROOT/.demo"}
BACKEND_PORT=${DEMO_BACKEND_PORT:-8000}
FRONTEND_PORT=${DEMO_FRONTEND_PORT:-5173}
BACKEND_URL="http://127.0.0.1:$BACKEND_PORT"
FRONTEND_URL="http://127.0.0.1:$FRONTEND_PORT"
DATABASE_URL=${DEMO_DATABASE_URL:-"$ROOT/backend/data/demo.db"}
COORDINATOR_MODE=${DEMO_COORDINATOR_MODE:-rules}
CALL_MODE=${DEMO_CALL_MODE:-sim}
INITIAL_FIXTURE=${DEMO_INITIAL_FIXTURE:-calm}
CLOCK_SPEED=${DEMO_CLOCK_SPEED:-1}
TUNNEL=${DEMO_TUNNEL:-cloudflared}

usage() {
  cat <<'EOF'
Uso: ./scripts/demo.sh <comando>

  up                 Arranca Quick Tunnel, backend y frontend en modo API
  up-local           Arranca backend y frontend sin túnel
  restart-backend    Reinicia el backend conservando SQLite y la URL pública
  reset [fixture]    Crea una ejecución limpia (calm por defecto)
  status             Comprueba procesos y endpoints
  doctor             Dice qué falta para llamar de verdad, sin enseñar ningún valor
  down               Detiene los procesos arrancados por este script

Variables: DEMO_COORDINATOR_MODE=rules|llm, DEMO_CALL_MODE=sim|real,
DEMO_TUNNEL=cloudflared|lhr (lhr = localhost.run por SSH, para redes que bloquean
trycloudflare.com), DEMO_DATABASE_URL, DEMO_CLOCK_SPEED, DEMO_BACKEND_PORT,
DEMO_FRONTEND_PORT.
EOF
}

require() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "Falta el comando requerido: $1" >&2
    exit 1
  }
}

pid_of() {
  local file="$RUNTIME_DIR/$1.pid"
  [[ -s "$file" ]] && cat "$file"
}

running() {
  local pid
  pid=$(pid_of "$1" || true)
  [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null
}

ensure_stopped() {
  local name=$1
  if running "$name"; then
    echo "$name ya está activo con PID $(pid_of "$name"); usa './scripts/demo.sh down' primero" >&2
    exit 1
  fi
}

stop_one() {
  local name=$1
  local pid
  pid=$(pid_of "$name" || true)
  if [[ -z "$pid" ]] || ! kill -0 "$pid" 2>/dev/null; then
    : >"$RUNTIME_DIR/$name.pid"
    return
  fi
  kill -TERM "$pid"
  for _ in {1..50}; do
    kill -0 "$pid" 2>/dev/null || break
    sleep 0.1
  done
  if kill -0 "$pid" 2>/dev/null; then
    echo "$name no se detuvo; revisa el PID $pid" >&2
    return 1
  fi
  : >"$RUNTIME_DIR/$name.pid"
}

wait_http() {
  local url=$1
  local label=$2
  for _ in {1..150}; do
    curl -fsS "$url" >/dev/null 2>&1 && return
    sleep 0.2
  done
  echo "$label no respondió en $url" >&2
  return 1
}

save_settings() {
  printf '%s\n' "$BACKEND_PORT" >"$RUNTIME_DIR/backend-port"
  printf '%s\n' "$FRONTEND_PORT" >"$RUNTIME_DIR/frontend-port"
  printf '%s\n' "$DATABASE_URL" >"$RUNTIME_DIR/database-url"
  printf '%s\n' "$COORDINATOR_MODE" >"$RUNTIME_DIR/coordinator-mode"
  printf '%s\n' "$CALL_MODE" >"$RUNTIME_DIR/call-mode"
  printf '%s\n' "$INITIAL_FIXTURE" >"$RUNTIME_DIR/initial-fixture"
  printf '%s\n' "$CLOCK_SPEED" >"$RUNTIME_DIR/clock-speed"
  printf '%s\n' "$TUNNEL" >"$RUNTIME_DIR/tunnel-kind"
}

load_settings() {
  if [[ -z ${DEMO_BACKEND_PORT+x} && -s "$RUNTIME_DIR/backend-port" ]]; then BACKEND_PORT=$(cat "$RUNTIME_DIR/backend-port"); fi
  if [[ -z ${DEMO_FRONTEND_PORT+x} && -s "$RUNTIME_DIR/frontend-port" ]]; then FRONTEND_PORT=$(cat "$RUNTIME_DIR/frontend-port"); fi
  if [[ -z ${DEMO_DATABASE_URL+x} && -s "$RUNTIME_DIR/database-url" ]]; then DATABASE_URL=$(cat "$RUNTIME_DIR/database-url"); fi
  if [[ -z ${DEMO_COORDINATOR_MODE+x} && -s "$RUNTIME_DIR/coordinator-mode" ]]; then COORDINATOR_MODE=$(cat "$RUNTIME_DIR/coordinator-mode"); fi
  if [[ -z ${DEMO_CALL_MODE+x} && -s "$RUNTIME_DIR/call-mode" ]]; then CALL_MODE=$(cat "$RUNTIME_DIR/call-mode"); fi
  if [[ -z ${DEMO_INITIAL_FIXTURE+x} && -s "$RUNTIME_DIR/initial-fixture" ]]; then INITIAL_FIXTURE=$(cat "$RUNTIME_DIR/initial-fixture"); fi
  if [[ -z ${DEMO_CLOCK_SPEED+x} && -s "$RUNTIME_DIR/clock-speed" ]]; then CLOCK_SPEED=$(cat "$RUNTIME_DIR/clock-speed"); fi
  if [[ -z ${DEMO_TUNNEL+x} && -s "$RUNTIME_DIR/tunnel-kind" ]]; then TUNNEL=$(cat "$RUNTIME_DIR/tunnel-kind"); fi
  BACKEND_URL="http://127.0.0.1:$BACKEND_PORT"
  FRONTEND_URL="http://127.0.0.1:$FRONTEND_PORT"
}

validate_config() {
  require node
  require curl
  local major
  major=$(node -p 'Number(process.versions.node.split(".")[0])')
  [[ "$major" -ge 22 ]] || {
    echo "Node 22 o superior es obligatorio; encontrado $(node --version)" >&2
    exit 1
  }
  [[ -d "$ROOT/backend/node_modules" && -d "$ROOT/frontend/node_modules" ]] || {
    echo "Faltan dependencias; ejecuta ./scripts/setup.sh" >&2
    exit 1
  }
  [[ "$COORDINATOR_MODE" == "rules" || "$COORDINATOR_MODE" == "llm" ]] || {
    echo "DEMO_COORDINATOR_MODE debe ser rules o llm" >&2
    exit 1
  }
  [[ "$CALL_MODE" == "sim" || "$CALL_MODE" == "real" ]] || {
    echo "DEMO_CALL_MODE debe ser sim o real" >&2
    exit 1
  }
  if [[ "$COORDINATOR_MODE" == "llm" ]]; then
    node --env-file-if-exists="$ROOT/.env" -e '
      const keys = ["COGNITION_API_KEY", "DEVIN_API_KEY", "OPENAI_API_KEY", "HELMCODE_API_KEY", "ANTHROPIC_API_KEY"];
      if (!keys.some((key) => process.env[key]?.trim())) {
        console.error("Falta una clave de LLM en .env");
        process.exit(1);
      }
    '
  fi
  if [[ "$CALL_MODE" == "real" ]]; then
    node --env-file-if-exists="$ROOT/.env" -e '
      const required = ["HAPPYROBOT_API_KEY", "HAPPYROBOT_TEST_PHONE", "HAPPYROBOT_WEBHOOK_TOKEN"];
      const missing = required.filter((key) => !process.env[key]?.trim());
      const hooks = ["ESPACIOS", "CATERING", "TRANSPORTE", "ASISTENTES"];
      if (!hooks.some((area) => process.env[`HAPPYROBOT_HOOK_${area}`]?.trim())) missing.push("HAPPYROBOT_HOOK_*");
      if (missing.length > 0) {
        console.error(`Faltan variables para llamada real en .env: ${missing.join(", ")}`);
        process.exit(1);
      }
    '
  fi
}

start_backend() {
  local public_base_url=$1
  ensure_stopped backend
  if curl -fsS "$BACKEND_URL/health" >/dev/null 2>&1; then
    echo "El puerto $BACKEND_PORT ya sirve otro backend" >&2
    exit 1
  fi
  local -a environment=(
    "DATABASE_URL=$DATABASE_URL"
    "HOST=127.0.0.1"
    "PORT=$BACKEND_PORT"
    "INITIAL_FIXTURE=$INITIAL_FIXTURE"
    "CLOCK_SPEED=$CLOCK_SPEED"
    "COORDINATOR_MODE=$COORDINATOR_MODE"
    "PUBLIC_BASE_URL=$public_base_url"
  )
  if [[ "$CALL_MODE" == "sim" ]]; then
    environment+=(
      "HAPPYROBOT_API_KEY="
      "HAPPYROBOT_HOOK_ESPACIOS="
      "HAPPYROBOT_HOOK_CATERING="
      "HAPPYROBOT_HOOK_TRANSPORTE="
      "HAPPYROBOT_HOOK_ASISTENTES="
    )
  fi
  (
    cd "$ROOT/backend"
    exec env "${environment[@]}" node --env-file-if-exists=../.env --import tsx src/server.ts
  ) >"$RUNTIME_DIR/backend.log" 2>&1 &
  echo $! >"$RUNTIME_DIR/backend.pid"
  wait_http "$BACKEND_URL/health" "backend" || {
    tail -n 30 "$RUNTIME_DIR/backend.log" >&2
    return 1
  }
}

start_frontend() {
  ensure_stopped frontend
  if curl -fsS "$FRONTEND_URL" >/dev/null 2>&1; then
    echo "El puerto $FRONTEND_PORT ya sirve otro frontend" >&2
    exit 1
  fi
  (
    cd "$ROOT/frontend"
    exec env VITE_API_URL="$BACKEND_URL" VITE_DATA_SOURCE=api \
      node node_modules/vite/bin/vite.js --host 127.0.0.1 --port "$FRONTEND_PORT"
  ) >"$RUNTIME_DIR/frontend.log" 2>&1 &
  echo $! >"$RUNTIME_DIR/frontend.pid"
  wait_http "$FRONTEND_URL" "frontend" || {
    tail -n 30 "$RUNTIME_DIR/frontend.log" >&2
    return 1
  }
}

start_tunnel() {
  ensure_stopped tunnel
  : >"$RUNTIME_DIR/tunnel.log"
  # El patrón excluye api.trycloudflare.com: aparece en la línea de error cuando el túnel
  # falla, y tomarlo por la URL pública deja el callback apuntando a ninguna parte.
  local pattern='https://[A-Za-z0-9-]+\.trycloudflare\.com'
  local label="Quick Tunnel"
  case "$TUNNEL" in
    cloudflared)
      require cloudflared
      cloudflared tunnel --url "$BACKEND_URL" --no-autoupdate >"$RUNTIME_DIR/tunnel.log" 2>&1 &
      ;;
    lhr)
      # localhost.run por SSH: no necesita cuenta y resuelve en redes donde
      # trycloudflare.com está bloqueado (por ejemplo la wifi de la ETSIT).
      require ssh
      pattern='https://[a-z0-9]+\.lhr\.life'
      label="localhost.run"
      # Sin -N a propósito: localhost.run anuncia la URL por la sesión, y con -N no llega.
      ssh -o StrictHostKeyChecking=accept-new -o ExitOnForwardFailure=yes \
        -o ServerAliveInterval=30 -R "80:127.0.0.1:$BACKEND_PORT" nokey@localhost.run \
        >"$RUNTIME_DIR/tunnel.log" 2>&1 &
      ;;
    *)
      echo "DEMO_TUNNEL debe ser cloudflared o lhr" >&2
      exit 1
      ;;
  esac
  echo $! >"$RUNTIME_DIR/tunnel.pid"
  local public_url=""
  for _ in {1..300}; do
    public_url=$(grep -oE "$pattern" "$RUNTIME_DIR/tunnel.log" | grep -v '//api\.' | head -n 1)
    [[ -n "$public_url" ]] && break
    running tunnel || {
      tail -n 30 "$RUNTIME_DIR/tunnel.log" >&2
      echo "$label terminó antes de publicar una URL" >&2
      exit 1
    }
    sleep 0.1
  done
  [[ -n "$public_url" ]] || {
    tail -n 30 "$RUNTIME_DIR/tunnel.log" >&2
    echo "No se pudo descubrir la URL de $label" >&2
    exit 1
  }
  printf '%s\n' "$public_url" >"$RUNTIME_DIR/public-url"
  printf '%s\n' "$public_url"
}

show_process() {
  local name=$1
  if running "$name"; then
    echo "$name: activo (PID $(pid_of "$name"))"
  else
    echo "$name: parado"
  fi
}

mkdir -p "$RUNTIME_DIR"
command=${1:-}
if [[ "$command" == "restart-backend" || "$command" == "reset" || "$command" == "status" ]]; then
  load_settings
fi
case "$command" in
  up)
    validate_config
    save_settings
    public_url=$(start_tunnel)
    start_backend "$public_url"
    start_frontend
    wait_http "$public_url/health" "Quick Tunnel"
    echo "Panel: $FRONTEND_URL"
    echo "Callback público: $public_url/workflow/happyrobot/results"
    echo "Modo coordinador: $COORDINATOR_MODE; llamadas: $CALL_MODE"
    ;;
  up-local)
    validate_config
    save_settings
    : >"$RUNTIME_DIR/public-url"
    start_backend "$BACKEND_URL"
    start_frontend
    echo "Panel: $FRONTEND_URL"
    echo "Modo coordinador: $COORDINATOR_MODE; llamadas: $CALL_MODE"
    ;;
  restart-backend)
    validate_config
    public_url=$(cat "$RUNTIME_DIR/public-url" 2>/dev/null || true)
    [[ -n "$public_url" ]] || public_url=$BACKEND_URL
    stop_one backend
    start_backend "$public_url"
    echo "Backend reiniciado con SQLite en $DATABASE_URL"
    ;;
  reset)
    fixture=${2:-calm}
    curl -fsS -X POST "$BACKEND_URL/simulation/reset" \
      -H 'Content-Type: application/json' \
      -d "{\"fixture\":\"$fixture\"}"
    echo
    ;;
  status)
    show_process backend
    show_process frontend
    show_process tunnel
    if curl -fsS "$BACKEND_URL/health" >/dev/null 2>&1; then
      echo "health local: OK"
    else
      echo "health local: ERROR"
    fi
    public_url=$(cat "$RUNTIME_DIR/public-url" 2>/dev/null || true)
    if [[ -n "$public_url" ]]; then
      echo "URL pública: $public_url"
      if curl -fsS "$public_url/health" >/dev/null 2>&1; then
        echo "health público: OK"
      else
        echo "health público: ERROR"
      fi
    fi
    ;;
  doctor)
    # Solo dice si una variable está puesta o no. Nunca imprime su valor.
    node --env-file-if-exists="$ROOT/.env" -e '
      const show = (label, ok, hint) => console.log(`${ok ? "OK  " : "FALTA"} ${label}${ok || !hint ? "" : ` · ${hint}`}`);
      const set = (key) => Boolean(process.env[key]?.trim());
      const llm = ["COGNITION_API_KEY", "DEVIN_API_KEY", "OPENAI_API_KEY", "HELMCODE_API_KEY", "ANTHROPIC_API_KEY"];
      console.log("Coordinador con LLM:");
      show(`una clave de ${llm.join(", ")}`, llm.some(set));
      console.log("Llamada real por HappyRobot:");
      for (const key of ["HAPPYROBOT_API_KEY", "HAPPYROBOT_TEST_PHONE", "HAPPYROBOT_WEBHOOK_TOKEN"]) show(key, set(key));
      const hooks = ["ESPACIOS", "CATERING", "TRANSPORTE", "ASISTENTES"].filter((area) => set(`HAPPYROBOT_HOOK_${area}`));
      show("al menos un HAPPYROBOT_HOOK_*", hooks.length > 0, "pídeselo a quien administre los workflows");
      if (hooks.length > 0) console.log(`      hooks configurados: ${hooks.join(", ").toLowerCase()}`);
    '
    echo "Túnel para el callback:"
    if command -v cloudflared >/dev/null 2>&1; then
      echo "OK   cloudflared en PATH"
    else
      echo "FALTA cloudflared en PATH · sin túnel el callback no vuelve y todo acaba en no_answer"
    fi
    # Una red que no resuelve trycloudflare.com deja el Quick Tunnel inservible por mucho
    # que el binario esté instalado. Pasa en la wifi de la ETSIT.
    if host -W 4 trycloudflare.com >/dev/null 2>&1; then
      echo "OK   esta red resuelve trycloudflare.com"
    else
      echo "AVISO esta red NO resuelve trycloudflare.com · usa DEMO_TUNNEL=lhr (localhost.run) o un móvil como punto de acceso"
    fi
    node -e 'const major = Number(process.versions.node.split(".")[0]); console.log(`${major >= 22 ? "OK  " : "FALTA"} Node ${process.versions.node} (mínimo 22)`)'
    ;;
  down)
    stop_one frontend
    stop_one backend
    stop_one tunnel
    echo "Procesos de demo detenidos"
    ;;
  *)
    usage
    [[ -n "$command" ]] && exit 1
    ;;
esac
