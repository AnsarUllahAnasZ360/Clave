#!/usr/bin/env bash

set -uo pipefail

steps=(
  "format|bun run format:gate"
  "lint|bun run lint:gate"
  "typecheck|bun run typecheck:gate"
  "unit|bun run test:unit"
  "integration|bun run test:integration"
  "coverage|bun run test:coverage"
)

names=()
codes=()

for step in "${steps[@]}"; do
  IFS='|' read -r name cmd <<< "$step"
  names+=("$name")

  echo
  echo "==> [$name] $cmd"
  if bash -lc "$cmd"; then
    codes+=("0")
  else
    codes+=("$?")
  fi
done

echo
echo "========================================"
echo "Fast Gate Summary"
echo "========================================"

overall=0
for i in "${!names[@]}"; do
  name="${names[$i]}"
  code="${codes[$i]}"

  if [ "$code" -eq 0 ]; then
    status="PASS"
  else
    status="FAIL ($code)"
    overall=1
  fi

  printf "%-12s %s\n" "$name" "$status"
done

echo "----------------------------------------"
if [ "$overall" -eq 0 ]; then
  echo "Overall: PASS"
  exit 0
fi

echo "Overall: FAIL"
exit 1
