#!/bin/bash
# Bring the rules the site holds back to this machine, and commit them.
#
# The site writes rules/ on its volume when somebody edits a rule on the page.
# `pnpm deploy` refuses to overwrite those, and `pnpm rules:pull` is what it
# tells you to run.
set -euo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
repo="$(dirname "$here")"

. "$here/rules-lib.sh"

storage="$(terraform -chdir="$here" output -raw storage_account)"
key="$(storage_key "$storage")"

remote="$(remote_history "$storage" "$key")"
local="$(local_history "$repo/rules")"

if [ -z "$remote" ]; then
  echo "the site holds no rule history yet — nothing to pull" >&2
  exit 0
fi

# The live file of a rule can only come from one side. Refuse rather than
# choose, because the other side's edit has no second copy on this machine.
ahead="$(behind_files "$local" "$remote")"
if [ -n "$ahead" ] && [ "${1:-}" != "--force" ]; then
  echo "this machine holds rule edits that the site does not:" >&2
  echo "$ahead" >&2
  echo "pass --force to take the site copy anyway, or deploy first" >&2
  exit 1
fi

echo "==> download the rules"
az storage file download-batch --account-name "$storage" --account-key "$key" \
  --source "data/rules" --destination "$repo/rules" --only-show-errors >/dev/null

# rules/ is a git repo on this machine with no remote. An edit there is only
# durable once it is committed, and .history is ignored inside it.
if git -C "$repo/rules" rev-parse --git-dir >/dev/null 2>&1; then
  git -C "$repo/rules" add -A
  git -C "$repo/rules" diff --cached --quiet ||
    git -C "$repo/rules" commit -q -m "chore: pull the rules from the site"
fi

echo "==> rebuild"
pnpm --dir "$repo" sb1 rebuild
