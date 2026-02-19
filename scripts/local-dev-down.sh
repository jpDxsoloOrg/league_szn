#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
STATE_DIR="$ROOT_DIR/.localdev"
BACKEND_PID_FILE="$STATE_DIR/backend.pid"
FRONTEND_PID_FILE="$STATE_DIR/frontend.pid"
STATE_FILE="$STATE_DIR/state.env"
CONTAINER_NAME="league-szn-dynamodb-local"

stop_pid_file() {
  local pid_file="$1"
  local label="$2"

  if [[ ! -f "$pid_file" ]]; then
    echo "$label is not tracked as running"
    return 0
  fi

  local pid
  pid="$(cat "$pid_file")"

  if [[ -n "$pid" ]] && kill -0 "$pid" >/dev/null 2>&1; then
    kill "$pid" >/dev/null 2>&1 || true
    for _ in $(seq 1 10); do
      if ! kill -0 "$pid" >/dev/null 2>&1; then
        break
      fi
      sleep 1
    done

    if kill -0 "$pid" >/dev/null 2>&1; then
      kill -9 "$pid" >/dev/null 2>&1 || true
    fi

    echo "Stopped $label (PID $pid)"
  else
    echo "$label PID not running: $pid"
  fi

  rm -f "$pid_file"
}

stop_pid_file "$FRONTEND_PID_FILE" "frontend"
stop_pid_file "$BACKEND_PID_FILE" "backend"

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
  local label="$2"
  local pids
  pids="$(get_port_pids "$port" || true)"
  if [[ -z "$pids" ]]; then
    echo "No listener on port $port for $label"
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
  echo "Stopped $label listeners on port $port"
}

if [[ -f "$STATE_FILE" ]]; then
  # shellcheck disable=SC1090
  source "$STATE_FILE"
  [[ -n "${FRONTEND_PORT:-}" ]] && kill_port_processes "$FRONTEND_PORT" "frontend"
  [[ -n "${BACKEND_PORT:-}" ]] && kill_port_processes "$BACKEND_PORT" "backend http"
  [[ -n "${BACKEND_LAMBDA_PORT:-}" ]] && kill_port_processes "$BACKEND_LAMBDA_PORT" "backend lambda"
else
  echo "No state file found. Falling back to process-pattern cleanup."
  pkill -f "league_szn/league_szn/backend/node_modules/.bin/serverless offline" >/dev/null 2>&1 || true
  pkill -f "league_szn/league_szn/frontend/node_modules/.bin/vite" >/dev/null 2>&1 || true
fi

if docker container inspect "$CONTAINER_NAME" >/dev/null 2>&1; then
  if [[ "$(docker inspect -f '{{.State.Running}}' "$CONTAINER_NAME")" == "true" ]]; then
    docker stop "$CONTAINER_NAME" >/dev/null
    echo "Stopped DynamoDB Local container: $CONTAINER_NAME"
  else
    echo "DynamoDB Local container is not running: $CONTAINER_NAME"
  fi
else
  echo "DynamoDB Local container does not exist: $CONTAINER_NAME"
fi

rm -f "$STATE_FILE"

echo "Local environment is down."
