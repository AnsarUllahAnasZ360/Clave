#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

PORT="${DEV_PORT:-4000}"
LOG_DIR="${DEV_LOG_DIR:-$PROJECT_DIR/.dev}"
ACCESS_LOG_FILE="${NEXT_ACCESS_LOG_FILE:-$LOG_DIR/next-access.log}"

mkdir -p "$LOG_DIR"

if [[ "${CLEAR_NEXT_ACCESS_LOG:-1}" == "1" ]]; then
	: > "$ACCESS_LOG_FILE"
fi

echo "[dev-with-access-log] writing request logs to $ACCESS_LOG_FILE"
next dev --turbopack -p "$PORT" 2>&1 | tee -a "$ACCESS_LOG_FILE"
