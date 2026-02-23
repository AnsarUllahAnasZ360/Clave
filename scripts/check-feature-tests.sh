#!/usr/bin/env bash

set -euo pipefail

resolve_base_ref() {
  if [ -n "${BASE_REF:-}" ]; then
    echo "$BASE_REF"
    return
  fi

  if [ -n "${GITHUB_BASE_REF:-}" ]; then
    echo "origin/${GITHUB_BASE_REF}"
    return
  fi

  if git show-ref --verify --quiet refs/remotes/origin/main; then
    echo "origin/main"
    return
  fi

  if git show-ref --verify --quiet refs/heads/main; then
    echo "main"
    return
  fi

  echo "HEAD~1"
}

base_ref="$(resolve_base_ref)"

if ! git rev-parse --verify "$base_ref" >/dev/null 2>&1; then
  echo "[policy] FAIL: unable to resolve base ref '$base_ref'. Set BASE_REF explicitly."
  exit 1
fi

merge_base="$(git merge-base "$base_ref" HEAD 2>/dev/null || true)"
if [ -z "$merge_base" ]; then
  merge_base="$base_ref"
fi

changed_files="$(git diff --name-only "$merge_base"...HEAD)"

if [ -z "$changed_files" ]; then
  echo "[policy] PASS: no changed files detected against $base_ref."
  exit 0
fi

feature_changed=0
unit_changed=0
integration_changed=0

while IFS= read -r file; do
  [ -z "$file" ] && continue

  case "$file" in
    src/*|convex/*)
      case "$file" in
        convex/_generated/*)
          ;;
        *)
          feature_changed=1
          ;;
      esac
      ;;
  esac

  case "$file" in
    tests/unit/*|*.unit.test.ts|*.unit.test.tsx|*.unit.spec.ts|*.unit.spec.tsx|*.unit.spec.js)
      unit_changed=1
      ;;
  esac

  case "$file" in
    tests/integration/*|*.integration.test.ts|*.integration.test.tsx|*.integration.spec.ts|*.integration.spec.tsx|*.integration.spec.js)
      integration_changed=1
      ;;
  esac

done <<< "$changed_files"

if [ "$feature_changed" -eq 0 ]; then
  echo "[policy] PASS: no feature files changed in src/ or convex/."
  exit 0
fi

failed=0

if [ "$unit_changed" -eq 0 ]; then
  echo "[policy] FAIL: feature changes require unit test updates."
  failed=1
fi

if [ "$integration_changed" -eq 0 ]; then
  echo "[policy] FAIL: feature changes require integration test updates."
  failed=1
fi

if [ "$failed" -ne 0 ]; then
  echo "[policy] Changed files:"
  printf "%s\n" "$changed_files" | sed 's/^/ - /'
  exit 1
fi

echo "[policy] PASS: feature changes include required test updates (unit + integration)."
