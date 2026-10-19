#!/bin/bash
# Upload the rules to the site.
set -euo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
repo="$(dirname "$here")"

. "$here/rules-lib.sh"

storage="$(terraform -chdir="$here" output -raw storage_account)"

# The rules never enter git. They reach Azure only here, and every push
# re-sends them, so an edit on the Mac cannot drift out of step.
key="$(storage_key "$storage")"

# The site can edit its own rules now, so this upload is no longer a one-way
# copy of a file only this machine writes. Stop rather than overwrite an edit
# made on the phone.
remote="$(remote_history "$storage" "$key")"
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
  live="$(remote_live "$storage" "$key")"
  moved="$(live_diff "$live" "$repo/rules")"
  rm -rf "$live"
  if [ -n "$moved" ]; then
    echo "the site stands at another point in the rule history:" >&2
    echo "$moved" >&2
    echo "run \`pnpm rules:pull\` to take it, or \`pnpm deploy --force\` to replace it" >&2
    exit 1
  fi
fi

az storage directory create --account-name "$storage" --account-key "$key" \
  --share-name data --name rules --only-show-errors >/dev/null
az storage file upload-batch --account-name "$storage" --account-key "$key" \
  --destination "data/rules" --source "$repo/rules" --pattern "*.json" \
  --no-progress --only-show-errors >/dev/null
# The versions go with them, or the site keeps a history that its own live file
# left behind, and undo there restores the state before this deploy.
if [ -d "$repo/rules/.history" ]; then
  missing="$(missing_history "$mine" "$remote")"
  if [ -n "$missing" ]; then
    history_stage="$(mktemp -d)"
    trap 'rm -rf "$history_stage"' EXIT
    while IFS= read -r version; do
      cp "$repo/rules/.history/$version" "$history_stage/$version"
    done <<< "$missing"
    az storage file upload-batch --account-name "$storage" --account-key "$key" \
      --destination "data/rules/.history" --source "$history_stage" \
      --pattern "*.json" --no-progress --only-show-errors >/dev/null
    rm -rf "$history_stage"
    trap - EXIT
  fi
fi

for dir in "$repo"/data/raw/receipts/*/; do
  [ -d "$dir" ] || continue
  path="raw/receipts/$(basename "$dir")"
  for d in raw/receipts "$path"; do
    az storage directory create --account-name "$storage" --account-key "$key" \
      --share-name data --name "$d" --only-show-errors >/dev/null
  done
  missing="$(comm -23 <(ls "$dir" | sort) <(az storage file list \
    --account-name "$storage" --account-key "$key" --share-name data \
    --path "$path" --num-results "*" --query "[].name" -o tsv | sort))"
  [ -n "$missing" ] || continue
  receipt_stage="$(mktemp -d)"
  trap 'rm -rf "$receipt_stage"' EXIT
  while IFS= read -r name; do
    cp "$dir$name" "$receipt_stage/"
  done <<< "$missing"
  az storage file upload-batch --account-name "$storage" --account-key "$key" \
    --destination "data/$path" --source "$receipt_stage" --max-connections 8 \
    --no-progress --only-show-errors >/dev/null
  rm -rf "$receipt_stage"
  trap - EXIT
  echo "==> $(wc -l <<< "$missing" | tr -d ' ') new files in $path"
done

echo "==> done: $(terraform -chdir="$here" output -raw url)"
