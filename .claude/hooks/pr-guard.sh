#!/usr/bin/env bash
set -uo pipefail

payload=$(cat)
cmd=$(printf '%s' "$payload" | jq -r '.tool_input.command // empty' 2>/dev/null)
cwd=$(printf '%s' "$payload" | jq -r '.cwd // empty' 2>/dev/null)

printf '%s' "$cmd" | grep -qE 'gh[[:space:]]+pr[[:space:]]+create' || exit 0
printf '%s' "$cmd" | grep -q 'no release' && exit 0
git -C "${cwd:-.}" diff --quiet --diff-filter=A origin/main...HEAD -- src/web/app/release-notes || exit 0

jq -nc '{
  hookSpecificOutput: {
    hookEventName: "PreToolUse",
    permissionDecision: "deny",
    permissionDecisionReason: "This branch adds no release file. Add one to src/web/app/release-notes/, or pass --label \"no release\" to gh pr create. A label that you add later does not stop the first CI run from failing."
  }
}'
exit 0
