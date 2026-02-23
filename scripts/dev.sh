#!/usr/bin/env bash
set -euo pipefail
# exec replaces this shell so SIGTERM from convex goes directly to Next.js
exec next dev --turbopack -p "${DEV_PORT:-4000}"
