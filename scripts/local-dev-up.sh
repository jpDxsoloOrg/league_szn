#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
STATE_DIR="$ROOT_DIR/.localdev"
LOG_DIR="$STATE_DIR/logs"
BACKEND_PID_FILE="$STATE_DIR/backend.pid"
FRONTEND_PID_FILE="$STATE_DIR/frontend.pid"
STATE_FILE="$STATE_DIR/state.env"
CONTAINER_NAME="league-szn-dynamodb-local"
DDB_PORT="${DDB_PORT:-8000}"
BACKEND_PORT="${BACKEND_PORT:-3001}"
BACKEND_LAMBDA_PORT="${BACKEND_LAMBDA_PORT:-3002}"
FRONTEND_PORT="${FRONTEND_PORT:-3000}"
KILL_CONFLICTING_PORTS="${KILL_CONFLICTING_PORTS:-0}"

mkdir -p "$LOG_DIR"

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1"
    exit 1
  fi
}

is_pid_running() {
  local pid="$1"
  kill -0 "$pid" >/dev/null 2>&1
}

wait_for_port() {
  local host="$1"
  local port="$2"
  local retries="$3"
  local label="$4"

  for _ in $(seq 1 "$retries"); do
    if (echo >"/dev/tcp/$host/$port") >/dev/null 2>&1; then
      echo "$label is ready on $host:$port"
      return 0
    fi
    sleep 1
  done

  echo "Timed out waiting for $label on $host:$port"
  return 1
}

is_port_open() {
  local port="$1"
  (echo >"/dev/tcp/127.0.0.1/$port") >/dev/null 2>&1
}

get_port_pids() {
  local port="$1"
  ss -ltnp "sport = :$port" 2>/dev/null \
    | awk -F'pid=' 'NR>1 && NF>1 {print $2}' \
    | awk -F',' '{print $1}' \
    | awk '{print $1}' \
    | sort -u
}

kill_port_processes() {
  local port="$1"
  local pids
  pids="$(get_port_pids "$port" || true)"
  if [[ -z "$pids" ]]; then
    return 0
  fi

  while IFS= read -r pid; do
    [[ -z "$pid" ]] && continue
    kill "$pid" >/dev/null 2>&1 || true
  done <<< "$pids"

  sleep 1

  while IFS= read -r pid; do
    [[ -z "$pid" ]] && continue
    if kill -0 "$pid" >/dev/null 2>&1; then
      kill -9 "$pid" >/dev/null 2>&1 || true
    fi
  done <<< "$pids"
}

resolve_port() {
  local requested_port="$1"
  local service_name="$2"
  local resolved_port="$requested_port"

  if is_port_open "$resolved_port"; then
    if [[ "$KILL_CONFLICTING_PORTS" == "1" ]]; then
      echo "$service_name port $resolved_port is in use. Killing conflicting listeners..." >&2
      kill_port_processes "$resolved_port"
      if is_port_open "$resolved_port"; then
        echo "Failed to free $service_name port $resolved_port" >&2
        exit 1
      fi
      echo "$service_name port $resolved_port is now free." >&2
    else
      for candidate in $(seq $((requested_port + 1)) $((requested_port + 100))); do
        if ! is_port_open "$candidate"; then
          resolved_port="$candidate"
          echo "$service_name port $requested_port is in use. Using $candidate instead." >&2
          break
        fi
      done

      if [[ "$resolved_port" == "$requested_port" ]]; then
        echo "Could not find a free port for $service_name starting from $requested_port" >&2
        exit 1
      fi
    fi
  fi

  echo "$resolved_port"
}

port_is_reserved() {
  local port="$1"
  shift
  for reserved in "$@"; do
    if [[ "$reserved" == "$port" ]]; then
      return 0
    fi
  done
  return 1
}

resolve_port_with_reserved() {
  local requested_port="$1"
  local service_name="$2"
  shift 2
  local reserved_ports=("$@")

  local candidate
  candidate="$(resolve_port "$requested_port" "$service_name")"

  if port_is_reserved "$candidate" "${reserved_ports[@]}"; then
    for alt in $(seq $((candidate + 1)) $((candidate + 100))); do
      if ! is_port_open "$alt" && ! port_is_reserved "$alt" "${reserved_ports[@]}"; then
        echo "$service_name port $candidate conflicts with already-selected local ports. Using $alt instead." >&2
        candidate="$alt"
        break
      fi
    done
  fi

  if port_is_reserved "$candidate" "${reserved_ports[@]}"; then
    echo "Could not find a unique free port for $service_name near $requested_port" >&2
    exit 1
  fi

  echo "$candidate"
}

run_with_retries() {
  local description="$1"
  local retries="$2"
  shift 2

  local attempt
  for attempt in $(seq 1 "$retries"); do
    if "$@"; then
      return 0
    fi
    if [[ "$attempt" -lt "$retries" ]]; then
      echo "$description failed (attempt $attempt/$retries). Retrying..."
      sleep 2
    fi
  done

  echo "$description failed after $retries attempts."
  return 1
}

start_process() {
  local pid_file="$1"
  local log_file="$2"
  shift 2

  if [[ -f "$pid_file" ]]; then
    local existing_pid
    existing_pid="$(cat "$pid_file")"
    if [[ -n "$existing_pid" ]] && is_pid_running "$existing_pid"; then
      echo "Process already running (PID $existing_pid): $*"
      return 0
    fi
    rm -f "$pid_file"
  fi

  "$@" >"$log_file" 2>&1 &
  local pid=$!
  echo "$pid" >"$pid_file"
  echo "Started (PID $pid): $*"
}

require_command docker
require_command npm

DDB_PORT="$(resolve_port_with_reserved "$DDB_PORT" "DynamoDB")"
BACKEND_PORT="$(resolve_port_with_reserved "$BACKEND_PORT" "Backend" "$DDB_PORT")"
BACKEND_LAMBDA_PORT="$(resolve_port_with_reserved "$BACKEND_LAMBDA_PORT" "Backend Lambda" "$DDB_PORT" "$BACKEND_PORT")"
FRONTEND_PORT="$(resolve_port_with_reserved "$FRONTEND_PORT" "Frontend" "$DDB_PORT" "$BACKEND_PORT" "$BACKEND_LAMBDA_PORT")"

existing_port_container="$(docker ps --filter publish="$DDB_PORT" --format '{{.Names}}' | head -n 1 || true)"

if [[ -n "$existing_port_container" ]] && [[ "$existing_port_container" != "$CONTAINER_NAME" ]]; then
  echo "Port $DDB_PORT is already served by container: $existing_port_container"
  echo "Reusing existing DynamoDB Local on port $DDB_PORT."
elif docker container inspect "$CONTAINER_NAME" >/dev/null 2>&1; then
  container_running="$(docker inspect -f '{{.State.Running}}' "$CONTAINER_NAME")"
  mapped_port="$(docker inspect -f '{{(index (index .HostConfig.PortBindings "8000/tcp") 0).HostPort}}' "$CONTAINER_NAME" 2>/dev/null || true)"

  if [[ "$container_running" == "true" ]]; then
    if [[ -n "$mapped_port" ]] && [[ "$mapped_port" != "$DDB_PORT" ]]; then
      echo "DynamoDB Local container already running on port $mapped_port (requested $DDB_PORT). Using $mapped_port."
      DDB_PORT="$mapped_port"
    fi
    echo "DynamoDB Local container already running: $CONTAINER_NAME"
  else
    if [[ -n "$mapped_port" ]] && [[ "$mapped_port" != "$DDB_PORT" ]]; then
      echo "Recreating $CONTAINER_NAME to use port $DDB_PORT (currently configured for $mapped_port)."
      docker rm "$CONTAINER_NAME" >/dev/null
      docker run -d --name "$CONTAINER_NAME" -p "$DDB_PORT:8000" amazon/dynamodb-local >/dev/null
    else
      echo "Starting existing DynamoDB Local container: $CONTAINER_NAME"
      if ! docker start "$CONTAINER_NAME" >/dev/null 2>&1; then
        if [[ "$KILL_CONFLICTING_PORTS" == "1" ]]; then
          conflict_container="$(docker ps --filter publish="$DDB_PORT" --format '{{.Names}}' | head -n 1 || true)"
          if [[ -n "$conflict_container" ]] && [[ "$conflict_container" != "$CONTAINER_NAME" ]]; then
            echo "Stopping conflicting container on port $DDB_PORT: $conflict_container"
            docker stop "$conflict_container" >/dev/null
            docker start "$CONTAINER_NAME" >/dev/null
          else
            echo "Could not start $CONTAINER_NAME and no stoppable conflicting container was found."
            exit 1
          fi
        else
          echo "Could not start $CONTAINER_NAME. Port $DDB_PORT may be in use."
          echo "Try setting a different port (e.g. DDB_PORT=8100) or KILL_CONFLICTING_PORTS=1."
          exit 1
        fi
      fi
    fi
  fi
else
  echo "Creating DynamoDB Local container: $CONTAINER_NAME"
  docker run -d --name "$CONTAINER_NAME" -p "$DDB_PORT:8000" amazon/dynamodb-local >/dev/null
fi

wait_for_port "127.0.0.1" "$DDB_PORT" "20" "DynamoDB Local"

echo "Ensuring local tables exist..."
run_with_retries "create-tables" 5 env DYNAMODB_ENDPOINT="http://localhost:$DDB_PORT" npm run create-tables --prefix "$ROOT_DIR/backend"

if [[ "${SKIP_SEED:-0}" != "1" ]]; then
  db_state="$(DYNAMODB_ENDPOINT="http://localhost:$DDB_PORT" npm run local-db-has-data --prefix "$ROOT_DIR/backend" --silent | awk -F= '/^HAS_DATA=/{print $2}' | tail -n 1 || true)"
  if [[ "$db_state" == "1" ]]; then
    echo "Local DB already has data. Skipping seed."
  else
    echo "Local DB is empty. Seeding local data..."
    run_with_retries "seed" 3 env IS_OFFLINE=true DYNAMODB_ENDPOINT="http://localhost:$DDB_PORT" npm run seed --prefix "$ROOT_DIR/backend"
  fi
else
  echo "Skipping seed (SKIP_SEED=1)"
fi

start_process "$BACKEND_PID_FILE" "$LOG_DIR/backend.log" env DYNAMODB_ENDPOINT="http://localhost:$DDB_PORT" npm run offline --prefix "$ROOT_DIR/backend" -- --httpPort "$BACKEND_PORT" --lambdaPort "$BACKEND_LAMBDA_PORT" --noAuth
wait_for_port "127.0.0.1" "$BACKEND_PORT" "30" "Backend API"

start_process "$FRONTEND_PID_FILE" "$LOG_DIR/frontend.log" env VITE_DEV_PORT="$FRONTEND_PORT" VITE_PROXY_TARGET="http://localhost:$BACKEND_PORT" npm run dev --prefix "$ROOT_DIR/frontend" -- --port "$FRONTEND_PORT"
wait_for_port "127.0.0.1" "$FRONTEND_PORT" "30" "Frontend dev server"

cat >"$STATE_FILE" <<EOF
DDB_PORT=$DDB_PORT
BACKEND_PORT=$BACKEND_PORT
BACKEND_LAMBDA_PORT=$BACKEND_LAMBDA_PORT
FRONTEND_PORT=$FRONTEND_PORT
CONTAINER_NAME=$CONTAINER_NAME
EOF

cat <<EOF

Local environment is up.
- Frontend: http://localhost:$FRONTEND_PORT
- Backend:  http://localhost:$BACKEND_PORT/dev
- Lambda:   127.0.0.1:$BACKEND_LAMBDA_PORT
- DynamoDB: http://localhost:$DDB_PORT

Logs:
- $LOG_DIR/frontend.log
- $LOG_DIR/backend.log

Use scripts/local-dev-down.sh to stop everything.
EOF
