#!/usr/bin/env bash
set -eu

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

PORT="${DEV_PORT:-4000}"
DEV_DIR="${DEV_LOG_DIR:-$PROJECT_DIR/.dev}"
LOCK_FILE="$DEV_DIR/dev-bootstrap.pid"
CONVEX_BIN="${CONVEX_BIN:-$PROJECT_DIR/node_modules/.bin/convex}"
NEXT_BIN="${NEXT_BIN:-$PROJECT_DIR/node_modules/.bin/next}"

DEV_PID=""
SHUTTING_DOWN=0

log() {
  printf '[dev-bootstrap] %s\n' "$*"
}

pid_alive() {
  kill -0 "$1" 2>/dev/null
}

cmdline_of() {
  ps -p "$1" -o args= 2>/dev/null || true
}

is_bootstrap_cmdline() {
  [[ "$1" == *"scripts/dev-bootstrap.sh"* ]]
}

is_project_dev_cmdline() {
  local cmdline="$1"

  if [[ "$cmdline" == *"$PROJECT_DIR"* ]]; then
    [[ "$cmdline" == *"convex dev"* ]] && return 0
    [[ "$cmdline" == *"next dev"* ]] && return 0
    [[ "$cmdline" == *"next-server"* ]] && return 0
  fi

  if [[ "$cmdline" == *"next dev"* ]] && [[ "$cmdline" == *"-p ${PORT}"* ]]; then
    return 0
  fi

  return 1
}

listener_pids() {
  lsof -nP -iTCP:"$PORT" -sTCP:LISTEN -t 2>/dev/null || true
}

collect_descendants() {
  local pid="$1"
  local children
  children="$(pgrep -P "$pid" 2>/dev/null || true)"

  [[ -n "$children" ]] || return 0

  while IFS= read -r child_pid; do
    [[ -n "$child_pid" ]] || continue
    echo "$child_pid"
    collect_descendants "$child_pid"
  done <<< "$children"
}

kill_tree() {
  local pid="$1"
  local sig="${2:-TERM}"
  local -a pids=("$pid")

  while IFS= read -r desc_pid; do
    [[ -n "$desc_pid" ]] && pids+=("$desc_pid")
  done < <(collect_descendants "$pid")

  kill -"$sig" "${pids[@]}" 2>/dev/null || true
}

wait_pid_exit() {
  local pid="$1"
  local timeout="${2:-5}"
  local deadline=$((SECONDS + timeout))

  while (( SECONDS < deadline )); do
    pid_alive "$pid" || return 0
    sleep 0.3
  done

  return 1
}

stop_pid_tree() {
  local pid="$1"

  pid_alive "$pid" || return 0

  kill_tree "$pid" INT
  if ! wait_pid_exit "$pid" 5; then
    kill_tree "$pid" TERM
    if ! wait_pid_exit "$pid" 3; then
      kill_tree "$pid" KILL
      sleep 0.5
    fi
  fi
}

cleanup_port_listeners() {
  local pids
  pids="$(listener_pids)"
  [[ -n "$pids" ]] || return 0

  while IFS= read -r pid; do
    [[ -n "$pid" ]] || continue

    local cmdline
    cmdline="$(cmdline_of "$pid")"

    if is_project_dev_cmdline "$cmdline"; then
      log "Stopping stale project process on port ${PORT} (PID ${pid})"
      stop_pid_tree "$pid"
      continue
    fi

    log "Port ${PORT} is in use by non-project process."
    log "PID ${pid}: ${cmdline:-unknown}"
    return 1
  done <<< "$pids"

  return 0
}

resolve_binaries() {
  local BIN_DIR="${PROJECT_DIR}/node_modules/.bin"
  # Prefer Unix scripts (next, convex) for WSL/Linux; fall back to .exe for Windows
  if [[ ! -x "$CONVEX_BIN" ]]; then
    if [[ -x "$BIN_DIR/convex" ]]; then
      CONVEX_BIN="$BIN_DIR/convex"
    elif [[ -x "$BIN_DIR/convex.exe" ]]; then
      CONVEX_BIN="$BIN_DIR/convex.exe"
    elif command -v convex >/dev/null 2>&1; then
      CONVEX_BIN="$(command -v convex)"
    else
      log 'Convex CLI not found. Run: bun install'
      exit 127
    fi
  fi

  if [[ ! -x "$NEXT_BIN" ]]; then
    if [[ -x "$BIN_DIR/next" ]]; then
      NEXT_BIN="$BIN_DIR/next"
    elif [[ -x "$BIN_DIR/next.exe" ]]; then
      NEXT_BIN="$BIN_DIR/next.exe"
    elif command -v next >/dev/null 2>&1; then
      NEXT_BIN="$(command -v next)"
    else
      log 'Next.js CLI not found. Run: bun install'
      exit 127
    fi
  fi
}

acquire_lock() {
  mkdir -p "$DEV_DIR"

  if [[ -f "$LOCK_FILE" ]]; then
    local old_pid old_cmd
    old_pid="$(tr -d '[:space:]' < "$LOCK_FILE" 2>/dev/null || true)"

    if [[ -n "$old_pid" ]] && pid_alive "$old_pid"; then
      old_cmd="$(cmdline_of "$old_pid")"
      if is_bootstrap_cmdline "$old_cmd"; then
        log "Another dev bootstrap is already running (PID ${old_pid})."
        exit 1
      fi
    fi

    rm -f "$LOCK_FILE"
  fi

  echo "$$" > "$LOCK_FILE"
}

release_lock() {
  [[ -f "$LOCK_FILE" ]] || return 0

  local owner
  owner="$(tr -d '[:space:]' < "$LOCK_FILE" 2>/dev/null || true)"

  if [[ -z "$owner" || "$owner" == "$$" ]] || ! pid_alive "$owner"; then
    rm -f "$LOCK_FILE"
  fi
}

cleanup() {
  if (( SHUTTING_DOWN )); then
    return 0
  fi
  SHUTTING_DOWN=1

  trap '' INT TERM HUP EXIT

  log 'Shutting down...'

  if [[ -n "$DEV_PID" ]] && pid_alive "$DEV_PID"; then
    stop_pid_tree "$DEV_PID"
  fi

  cleanup_port_listeners || true
  release_lock

  log 'Shutdown complete.'
}

trap 'cleanup' INT TERM HUP EXIT

resolve_binaries
acquire_lock

if ! cleanup_port_listeners; then
  trap - INT TERM HUP EXIT
  release_lock
  exit 1
fi

if listener_pids | grep -q .; then
  log "Port ${PORT} is still busy after cleanup."
  trap - INT TERM HUP EXIT
  release_lock
  exit 1
fi

# Use 'bunx next' to avoid Windows/WSL path conflicts (next.exe path fails when Convex runs in mixed env)
printf -v NEXT_COMMAND 'bunx next dev --turbopack -p %q' "$PORT"

log "Starting Convex + Next.js on http://localhost:${PORT}"
(
  cd "$PROJECT_DIR"
  exec "$CONVEX_BIN" dev --typecheck=disable --run-sh "$NEXT_COMMAND"
) &
DEV_PID=$!

if [[ -z "$DEV_PID" ]]; then
  log 'Failed to start dev server.'
  exit 1
fi

log "Dev process PID: ${DEV_PID}"
log 'Running. Press Ctrl+C to stop.'

wait "$DEV_PID" 2>/dev/null && DEV_EXIT=0 || DEV_EXIT=$?

if (( DEV_EXIT == 130 || DEV_EXIT == 143 )); then
  exit 0
fi

exit "$DEV_EXIT"
