#!/bin/bash
# Build the image, push it, and upload the rules.
# Terraform owns the resources. This script owns their contents.
set -euo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
repo="$(dirname "$here")"
stage="$repo/data/deploy"

. "$here/rules-lib.sh"

app="$(terraform -chdir="$here" output -raw app)"
group="$(terraform -chdir="$here" output -raw resource_group)"
registry="$(terraform -chdir="$here" output -raw registry)"
storage="$(terraform -chdir="$here" output -raw storage_account)"
tag="$(date -u +%Y%m%d%H%M%S)"

echo "==> build the page"
pnpm --dir "$repo" build

echo "==> stage $stage"
rm -rf "$stage"
mkdir -p "$stage/data"
cp -R "$repo/src" "$stage/src"
cp -R "$repo/data/dist" "$stage/data/dist"
cp "$here/Dockerfile" "$stage/Dockerfile"

cp "$repo/package.json" "$stage/package.json"
cp "$repo/pnpm-lock.yaml" "$stage/pnpm-lock.yaml"

echo "==> install the runtime dependencies"
pnpm install --dir "$stage" --prod --node-linker=hoisted --frozen-lockfile --ignore-scripts

# ACR builds the image itself, so this machine needs no container runtime.
echo "==> build the image in the registry"
# --file resolves against the working directory, not the context, so build
# from inside the context rather than passing a path.
(cd "$stage" && az acr build --registry "$registry" \
  --image "banking:$tag" --image "banking:latest" \
  --file Dockerfile . --only-show-errors >/dev/null)

echo "==> point the app at the new image"
az containerapp update --resource-group "$group" --name "$app" \
  --image "$(az acr show --name "$registry" --query loginServer -o tsv)/banking:$tag" \
  --only-show-errors >/dev/null

# The rules never enter git. They reach Azure only here, and every deploy
# re-sends them, so an edit on the Mac cannot drift out of step.
echo "==> upload the rules"
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

rm -rf "$stage"
echo "==> done: $(terraform -chdir="$here" output -raw url)"
