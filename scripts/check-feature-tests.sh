#!/usr/bin/env bash
# Thin wrapper — policy logic lives in check-feature-tests.mjs for Windows + CI parity.
exec node "$(dirname "$0")/check-feature-tests.mjs"
