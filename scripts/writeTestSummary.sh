#!/usr/bin/env bash
# Adds a Vitest result line to the GitHub Actions run summary.
# Usage: scripts/writeTestSummary.sh <title> <vitest-output-file>
set -uo pipefail

title="${1:?Usage: writeTestSummary.sh <title> <vitest-output-file>}"
file="${2:?Usage: writeTestSummary.sh <title> <vitest-output-file>}"
summary="${GITHUB_STEP_SUMMARY:-/dev/stdout}"

if [ ! -f "$file" ]; then
  echo "- **$title:** no output (the step didn't run)" >> "$summary"
  exit 0
fi

# Vitest prints e.g. "Tests  1399 passed | 1 skipped (1400)"; strip its colour codes first.
result=$(sed 's/\x1b\[[0-9;]*m//g' "$file" | grep -E '^ +Tests ' | tail -n 1 | sed -E 's/^ +Tests +//')
echo "- **$title:** ${result:-no test results found}" >> "$summary"
