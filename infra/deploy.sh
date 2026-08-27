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

# Vite bundles React and the icons into data/dist, so the process needs neither.
# Only the vault client survives into the image.
node -e '
const fs = require("node:fs");
const pkg = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
const keep = ["@azure/identity", "@azure/keyvault-secrets"];
fs.writeFileSync(process.argv[2], JSON.stringify({
  name: "banking",
  private: true,
  type: "module",
  dependencies: Object.fromEntries(keep.map((k) => [k, pkg.dependencies[k]])),
}, null, 2));
' "$repo/package.json" "$stage/package.json"

echo "==> install the runtime dependencies"
pnpm install --dir "$stage" --prod --node-linker=hoisted --ignore-scripts

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
ahead="$(behind_files "$(remote_history "$storage" "$key")" "$(local_history "$repo/rules")")"
if [ -n "$ahead" ]; then
  echo "the site holds rule edits that this machine does not:" >&2
  echo "$ahead" >&2
  echo "run \`pnpm rules:pull\` first" >&2
  exit 1
fi

az storage directory create --account-name "$storage" --account-key "$key" \
  --share-name data --name rules --only-show-errors >/dev/null
az storage file upload-batch --account-name "$storage" --account-key "$key" \
  --destination "data/rules" --source "$repo/rules" --pattern "*.json" \
  --only-show-errors >/dev/null
# The versions go with them, or the site keeps a history that its own live file
# left behind, and undo there restores the state before this deploy.
# ponytail: every version, every deploy. Upload only what the share lacks when
# the history grows past a few hundred files.
if [ -d "$repo/rules/.history" ]; then
  az storage file upload-batch --account-name "$storage" --account-key "$key" \
    --destination "data/rules/.history" --source "$repo/rules/.history" \
    --pattern "*.json" --only-show-errors >/dev/null
fi

rm -rf "$stage"
echo "==> done: $(terraform -chdir="$here" output -raw url)"
