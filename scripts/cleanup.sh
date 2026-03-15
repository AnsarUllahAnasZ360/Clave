#!/usr/bin/env bash
set -eu

PORT="${DEV_PORT:-4000}"
PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
UNKILLABLE=0

USE_POWERSHELL=false
if command -v powershell.exe &>/dev/null; then
  USE_POWERSHELL=true
fi

kill_pid() {
  local pid="$1"
  local label="$2"

  if [[ -z "${pid//[[:space:]]/}" ]]; then
    return 0
  fi

  echo "Stopping ${label} process $pid"

  if $USE_POWERSHELL; then
    powershell.exe -NoProfile -Command "Stop-Process -Id $pid -Force -ErrorAction SilentlyContinue" 2>/dev/null || true
    return 0
  fi

  if ! ps -p "$pid" >/dev/null 2>&1; then
    return 0
  fi

  local pgrp=""
  pgrp="$(ps -o pgid= -p "$pid" 2>/dev/null | tr -d ' ')"

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

is_next_server_under_project_stack() {
  local pid="$1"
  local -i depth=0
  local parent_pid
  local ancestor_cmd

  while (( depth < 12 )); do
    parent_pid="$(ps -p "$pid" -o ppid= 2>/dev/null | tr -d ' ')"
    if [[ -z "$parent_pid" || "$parent_pid" == "1" || "$parent_pid" == "$pid" ]]; then
      return 1
    fi

    ancestor_cmd="$(ps -p "$parent_pid" -o args= 2>/dev/null || true)"
    if [[ -n "$ancestor_cmd" ]] && [[ "$ancestor_cmd" == *"$PROJECT_DIR"* ]]; then
      if [[ "$ancestor_cmd" == *"convex dev"* ]] || [[ "$ancestor_cmd" == *"next dev"* ]] || [[ "$ancestor_cmd" == *"next-server"* ]]; then
        return 0
      fi
    fi

    pid="$parent_pid"
    ((depth += 1))
  done

  return 1
}

# ── Windows cleanup (netstat + taskkill — no PowerShell subshell needed) ───
if $USE_POWERSHELL; then
  KILLED=0

  win_kill_pid() {
    local pid="$1"
    local label="$2"
    echo "Killing $label (PID $pid)"
    taskkill.exe //PID "$pid" //F 2>&1 | tr -d '\r' || true
    sleep 0.3
    # Verify the process is dead; retry via PowerShell if not
    if netstat.exe -ano 2>/dev/null | tr -d '\r' | grep -q ":${PORT} .*LISTENING.*${pid}"; then
      echo "  PID $pid survived taskkill, retrying via PowerShell..."
      powershell.exe -NoProfile -Command "Stop-Process -Id $pid -Force -ErrorAction SilentlyContinue" 2>/dev/null || true
      sleep 0.5
    fi
  }

  # Kill processes listening on the dev port
  while IFS= read -r line; do
    pid=$(echo "$line" | tr -s ' ' | tr -d '\r' | rev | cut -d' ' -f1 | rev)
    if [[ -n "$pid" && "$pid" != "0" ]]; then
      win_kill_pid "$pid" "port $PORT listener"
      KILLED=$((KILLED + 1))
    fi
  done < <(netstat.exe -ano 2>/dev/null | grep ":${PORT} " | grep "LISTENING" | tr -d '\r')

  # Kill stale convex/esbuild processes (extract PID from column 2 of tasklist)
  for name in convex esbuild; do
    while IFS= read -r line; do
      pid=$(echo "$line" | tr -s ' ' | tr -d '\r' | awk '{print $2}')
      if [[ -n "$pid" && "$pid" =~ ^[0-9]+$ && "$pid" != "0" ]]; then
        echo "Killed stale $name (PID $pid)"
        taskkill.exe //PID "$pid" //F 2>&1 | tr -d '\r' || true
        KILLED=$((KILLED + 1))
      fi
    done < <(tasklist.exe 2>/dev/null | grep -i "^${name}" | tr -d '\r')
  done

  if [[ "$KILLED" -eq 0 ]]; then
    echo "Port $PORT is free"
  else
    sleep 1
    # Final verification
    if netstat.exe -ano 2>/dev/null | tr -d '\r' | grep -q ":${PORT} .*LISTENING"; then
      echo "WARNING: port $PORT is still in use after cleanup"
    else
      echo "Port $PORT is now free"
    fi
  fi
else
  # ── Unix port cleanup ─────────────────────────────────────────────────
  if pids=$(lsof -nP -iTCP:"$PORT" -sTCP:LISTEN -t 2>/dev/null); then
    echo "Killing processes on port $PORT: $(echo "$pids" | tr '\n' ' ')"
    while IFS= read -r pid; do
      if [[ -z "$pid" ]]; then
        continue
      fi
      cmdline=$(ps -p "$pid" -o args= 2>/dev/null || true)
      if is_project_process "$cmdline" || is_next_dev_process "$cmdline" || is_next_server_process "$cmdline" || is_convex_dev_process "$cmdline"; then
        if is_next_server_process "$cmdline" && ! is_next_server_under_project_stack "$pid"; then
          echo "Port ${PORT} is in use by non-project process."
          echo "PID ${pid}: ${cmdline:-unknown}"
          continue
        fi
        kill_pid "$pid" "process on dev port $PORT"
        continue
      else
        echo "Port ${PORT} is in use by non-project process."
        echo "PID ${pid}: ${cmdline:-unknown}"
        exit 1
      fi
    done <<< "$pids"
  else
    echo "Port $PORT is free"
  fi

  # ── Unix stale process cleanup ────────────────────────────────────────
  while IFS= read -r pid; do
    if [[ -n "$pid" ]]; then
      cmdline=$(ps -p "$pid" -o args= 2>/dev/null || true)
      if is_project_process "$cmdline" || is_convex_dev_process "$cmdline"; then
        if [[ "$pid" != "$$" && "$pid" != "$PPID" ]]; then
          kill_pid "$pid" "stale convex dev"
        fi
      fi
    fi
  done < <(pgrep -f "convex dev" 2>/dev/null || true)

  while IFS= read -r pid; do
    if [[ -n "$pid" ]]; then
      cmdline=$(ps -p "$pid" -o args= 2>/dev/null || true)
      if is_next_server_process "$cmdline" && is_next_server_under_project_stack "$pid"; then
        kill_pid "$pid" "orphaned project next-server process"
      fi
    fi
  done < <(pgrep -f "next-server" 2>/dev/null || true)

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
    echo "WARNING: $UNKILLABLE esbuild processes are stuck in uninterruptible state."
    echo "   A reboot is the only way to clear them."
    echo ""
  fi

  if [[ "${ESBUILD_KILLED:-0}" -gt 0 ]]; then
    echo "Killed $ESBUILD_KILLED esbuild processes"
  fi
  if [[ "${ESBUILD_TOTAL:-0}" -eq 0 ]]; then
    echo "No stale esbuild processes"
  fi
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
  if command -v pkill &>/dev/null; then
    pkill -f 'agent-browser.*daemon' 2>/dev/null && echo "Killed agent-browser daemons" || true
  fi
fi

if command -v pkill &>/dev/null; then
  pkill -f 'chrome-headless-shell' 2>/dev/null && echo "Killed orphaned playwright headless browsers" || true
  pkill -f 'Google Chrome.*mcp-chrome' 2>/dev/null && echo "Killed orphaned MCP headless Chrome" || true
fi

# ── Lock file cleanup ─────────────────────────────────────────────────────
if [[ -f "$PROJECT_DIR/.dev/dev-bootstrap.pid" ]]; then
  echo "Removing stale lock file"
  rm -f "$PROJECT_DIR/.dev/dev-bootstrap.pid"
fi

# ── Next.js cache cleanup ─────────────────────────────────────────────────
if [ -d "$PROJECT_DIR/.next/cache" ]; then
  echo "Clearing .next/cache"
  rm -rf "$PROJECT_DIR/.next/cache"
else
  echo ".next/cache already clean"
fi

echo "Cleanup complete"
