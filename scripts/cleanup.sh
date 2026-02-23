#!/usr/bin/env bash
set -euo pipefail

PORT="${DEV_PORT:-4000}"
PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
UNKILLABLE=0

kill_pid() {
  local pid="$1"
  local label="$2"

  if [[ -z "${pid//[[:space:]]/}" ]]; then
    return 0
  fi

  if ! ps -p "$pid" >/dev/null 2>&1; then
    return 0
  fi

  local pgrp=""
  pgrp="$(ps -o pgid= -p "$pid" 2>/dev/null | tr -d ' ')"

  echo "Stopping ${label} process $pid"
  if [[ -n "$pgrp" ]]; then
    kill "-$pgrp" 2>/dev/null || true
    sleep 0.5
    if ps -p "$pid" >/dev/null 2>&1; then
      kill -TERM "-$pgrp" 2>/dev/null || true
      sleep 0.75
    fi
    if ps -p "$pid" >/dev/null 2>&1; then
      kill -9 "-$pgrp" 2>/dev/null || true
      sleep 0.5
    fi
  else
    kill "$pid" 2>/dev/null || true
    sleep 0.5
    if ps -p "$pid" >/dev/null 2>&1; then
      kill -TERM "$pid" 2>/dev/null || true
      sleep 0.75
    fi
    if ps -p "$pid" >/dev/null 2>&1; then
      kill -9 "$pid" 2>/dev/null || true
      sleep 0.5
    fi
  fi
}

is_uninterruptible_process() {
  local pid="$1"
  local state
  state="$(ps -p "$pid" -o stat= 2>/dev/null | tr -d ' ')"
  [[ "$state" == *U* ]]
}

is_project_process() {
  local cmdline="$1"
  [[ "$cmdline" == *"$PROJECT_DIR"* ]]
}

is_next_dev_process() {
  local cmdline="$1"
  [[ "$cmdline" == *"next dev --turbopack"* ]] \
    || [[ "$cmdline" == *"next dev --turbo"* ]] \
    || { [[ "$cmdline" == *"next dev"* ]] && [[ "$cmdline" == *"-p ${PORT}"* ]]; }
}

is_next_server_process() {
  local cmdline="$1"
  [[ "$cmdline" == *"next-server"* ]]
}

is_convex_dev_process() {
  local cmdline="$1"
  [[ "$cmdline" == *"convex dev --run-sh"* ]] \
    || [[ "$cmdline" == *"convex dev --typecheck=disable --run-sh"* ]] \
    || [[ "$cmdline" == *"convex dev"* ]]
}

is_esbuild_dev_process() {
  local cmdline="$1"
  [[ "$cmdline" == *"esbuild"*"--service"* ]] || [[ "$cmdline" == *"${PROJECT_DIR}/.next/cache/"* ]]
}

# ── Port cleanup ───────────────────────────────────────────────────────────
if pids=$(lsof -ti:"$PORT" 2>/dev/null); then
  echo "Killing processes on port $PORT: $(echo "$pids" | tr '\n' ' ')"
  while IFS= read -r pid; do
    if [[ -z "$pid" ]]; then
      continue
    fi
    cmdline=$(ps -p "$pid" -o args= 2>/dev/null || true)
    if is_project_process "$cmdline" || is_next_dev_process "$cmdline" || is_next_server_process "$cmdline" || is_convex_dev_process "$cmdline"; then
      kill_pid "$pid" "process on dev port $PORT"
    fi
  done <<< "$pids"
else
  echo "Port $PORT is free"
fi

# ── Stale convex dev processes (from previous agent sessions) ──────────────
while IFS= read -r pid; do
  if [[ -n "$pid" ]]; then
    cmdline=$(ps -p "$pid" -o args= 2>/dev/null || true)
    if is_project_process "$cmdline" || is_convex_dev_process "$cmdline"; then
      # Don't kill the bootstrap process that might be running this script
      if [[ "$pid" != "$$" && "$pid" != "$PPID" ]]; then
        kill_pid "$pid" "stale convex dev"
      fi
    fi
  fi
done < <(pgrep -f "convex dev" 2>/dev/null || true)

# ── Esbuild zombie cleanup ────────────────────────────────────────────────
ESBUILD_TOTAL=0
ESBUILD_KILLED=0
while IFS= read -r pid; do
  if [[ -n "$pid" ]]; then
    cmdline=$(ps -p "$pid" -o args= 2>/dev/null || true)
    if is_project_process "$cmdline" || is_esbuild_dev_process "$cmdline"; then
      ESBUILD_TOTAL=$((ESBUILD_TOTAL + 1))
      if is_uninterruptible_process "$pid"; then
        UNKILLABLE=$((UNKILLABLE + 1))
      else
        kill_pid "$pid" "stale esbuild"
        ESBUILD_KILLED=$((ESBUILD_KILLED + 1))
      fi
    fi
  fi
done < <(pgrep -f "esbuild" 2>/dev/null || true)

if [[ "$UNKILLABLE" -gt 0 ]]; then
  echo ""
  echo "⚠  $UNKILLABLE esbuild processes are stuck in uninterruptible state (UE)."
  echo "   These are kernel zombies — kill -9 cannot touch them."
  echo "   They are harmless but waste memory. A reboot is the only way to clear them."
  echo ""
fi

if [[ "$ESBUILD_KILLED" -gt 0 ]]; then
  echo "Killed $ESBUILD_KILLED esbuild processes"
fi

if [[ "$ESBUILD_TOTAL" -eq 0 ]]; then
  echo "No stale esbuild processes"
fi

# ── Agent Browser CLI cleanup ─────────────────────────────────────────────
if command -v agent-browser &>/dev/null; then
  sessions=$(agent-browser session list 2>/dev/null | grep -v "^Active\|^No" | sed 's/^[[:space:]]*//' || true)
  if [[ -n "$sessions" ]]; then
    while IFS= read -r session; do
      if [[ -n "$session" ]]; then
        AGENT_BROWSER_SESSION="$session" agent-browser close 2>/dev/null || true
        echo "Closed agent-browser session: $session"
      fi
    done <<< "$sessions"
  fi
  if pkill -f 'agent-browser.*daemon' 2>/dev/null; then
    echo "Killed agent-browser daemons"
  fi
fi

# Kill orphaned playwright headless shells
if pkill -f 'chrome-headless-shell' 2>/dev/null; then
  echo "Killed orphaned playwright headless browsers"
fi

# Kill orphaned MCP headless Chrome
if pkill -f 'Google Chrome.*mcp-chrome' 2>/dev/null; then
  echo "Killed orphaned MCP headless Chrome"
fi

# ── Next.js cache cleanup ─────────────────────────────────────────────────
if [ -d "$PROJECT_DIR/.next/cache" ]; then
  echo "Clearing .next/cache"
  rm -rf "$PROJECT_DIR/.next/cache"
else
  echo ".next/cache already clean"
fi

echo "Cleanup complete"
