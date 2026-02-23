#!/usr/bin/env bash
#
# test-changed.sh — Run only tests related to changed files
#
# Usage:
#   ./scripts/test-changed.sh                              # tests for all uncommitted changes
#   ./scripts/test-changed.sh src/hooks/use-ai-chat.ts     # tests for a specific file
#
set -uo pipefail

find_related_tests() {
  local file="$1"
  local basename
  basename="$(basename "$file")"
  # Strip file extension (.ts, .tsx, .js, .jsx)
  basename="${basename%.*}"

  # Strip common test suffixes to get the core name
  local core
  core="$(echo "$basename" | sed -E 's/\.(test|spec|unit|integration)$//')"

  local dir
  dir="$(dirname "$file")"

  # Search tests/unit, tests/integration, and co-located
  {
    find tests/unit tests/integration \( -name "${core}.test.*" -o -name "${core}.spec.*" -o -name "${core}.unit.test.*" -o -name "${core}.integration.test.*" -o -name "${core}-*.test.*" -o -name "${core}-*.spec.*" -o -name "${core}*.test.*" \) -print 2>/dev/null
    find "$dir" -maxdepth 1 \( -name "${core}*.test.*" -o -name "${core}*.spec.*" \) -print 2>/dev/null
  } | sort -u
}

# Collect target files
targets=()
if [ $# -gt 0 ]; then
  targets=("$@")
else
  # Get all changed files (staged + unstaged + untracked)
  while IFS= read -r f; do
    [ -n "$f" ] && targets+=("$f")
  done < <(
    {
      git diff --name-only 2>/dev/null
      git diff --cached --name-only 2>/dev/null
      git ls-files --others --exclude-standard 2>/dev/null
    } | sort -u | grep -E '\.(ts|tsx|js|jsx)$' || true
  )
fi

if [ ${#targets[@]} -eq 0 ]; then
  echo "[test-changed] No changed files found."
  exit 0
fi

echo "[test-changed] Finding tests for ${#targets[@]} changed file(s)..."

# Collect all related test files
all_tests=()
for file in "${targets[@]}"; do
  while IFS= read -r test_file; do
    [ -n "$test_file" ] && all_tests+=("$test_file")
  done < <(find_related_tests "$file")
done

# Deduplicate
unique_tests=()
if [ ${#all_tests[@]} -gt 0 ]; then
  while IFS= read -r t; do
    [ -n "$t" ] && unique_tests+=("$t")
  done < <(printf '%s\n' "${all_tests[@]}" | sort -u)
fi

if [ ${#unique_tests[@]} -eq 0 ]; then
  echo "[test-changed] WARNING: No related tests found for changed files:"
  printf "  %s\n" "${targets[@]}"
  echo ""
  echo "  Tests may need to be written for:"
  for file in "${targets[@]}"; do
    case "$file" in
      src/*|convex/*)
        echo "    - $file"
        ;;
    esac
  done
  exit 2  # Exit code 2 = missing tests
fi

echo "[test-changed] Running ${#unique_tests[@]} test file(s):"
printf "  %s\n" "${unique_tests[@]}"
echo ""

# Run only the matched tests
exec bunx vitest run "${unique_tests[@]}"
