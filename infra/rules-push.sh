#!/bin/bash
# Upload the rules to the site.
set -euo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
repo="$(dirname "$here")"

. "$here/rules-lib.sh"

# The site can edit its own rules now, so this upload is no longer a one-way
# copy of a file only this machine writes. Stop rather than overwrite an edit
# made on the phone.
remote="$(remote_history)"
mine="$(local_history "$repo/rules")"

ahead="$(behind_files "$remote" "$mine")"
if [ -n "$ahead" ]; then
  echo "the site holds rule edits that this machine does not:" >&2
  echo "$ahead" >&2
  echo "run \`pnpm rules:pull\` first" >&2
  exit 1
fi

# The stamps say who holds newer versions. They say nothing about where each
# side stands in its own history, because a step through the stack rewrites the
# live file and writes no version. Ask the content when neither side is ahead,
# and only then: an ordinary edit here makes the files differ as well.
if [ -z "$(behind_files "$mine" "$remote")" ] && [ "${1:-}" != "--force" ]; then
  live="$(remote_live)"
  moved="$(live_diff "$live" "$repo/rules")"
  rm -rf "$live"
  if [ -n "$moved" ]; then
    echo "the site stands at another point in the rule history:" >&2
    echo "$moved" >&2
    echo "run \`pnpm rules:pull\` to take it, or \`pnpm rules:push --force\` to replace it" >&2
    exit 1
  fi
fi

# The rules never enter git. They reach the site only here, and every push
# re-sends them, so an edit on the Mac cannot drift out of step.
ssh "$HOST" "sudo -u banking mkdir -p $SITE/rules/.history $SITE/raw/receipts"
site_rsync -t "$repo"/rules/*.json "$HOST:$SITE/rules/"
# The versions go with them, or the site keeps a history that its own live file
# left behind, and undo there restores the state before this deploy.
if [ -d "$repo/rules/.history" ]; then
  site_rsync -rt --ignore-existing "$repo/rules/.history/" "$HOST:$SITE/rules/.history/"
fi

if [ -d "$repo/data/raw/receipts" ]; then
  sent="$(site_rsync -rt --ignore-existing --out-format='%n' \
    "$repo/data/raw/receipts/" "$HOST:$SITE/raw/receipts/")"
  echo "==> $(grep -c '[^/]$' <<< "$sent") new receipt files"
fi

echo "==> done"
