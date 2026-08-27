#!/bin/bash
# Build the image, push it, and upload the rules.
# Terraform owns the resources. This script owns their contents.
set -euo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
repo="$(dirname "$here")"
stage="$repo/data/deploy"

tf="$here/tf.sh"
app="$("$tf" output -raw app)"
group="$("$tf" output -raw resource_group)"
registry="$("$tf" output -raw registry)"
storage="$("$tf" output -raw storage_account)"
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
az acr build --registry "$registry" --image "banking:$tag" --image "banking:latest" \
  --file Dockerfile "$stage" --only-show-errors >/dev/null

echo "==> point the app at the new image"
az containerapp update --resource-group "$group" --name "$app" \
  --image "$(az acr show --name "$registry" --query loginServer -o tsv)/banking:$tag" \
  --only-show-errors >/dev/null

# The rules never enter git. They reach Azure only here, and every deploy
# re-sends them, so an edit on the Mac cannot drift out of step.
echo "==> upload the rules"
key="$(az storage account keys list --account-name "$storage" --query '[0].value' -o tsv)"
az storage directory create --account-name "$storage" --account-key "$key" \
  --share-name data --name rules --only-show-errors >/dev/null
az storage file upload-batch --account-name "$storage" --account-key "$key" \
  --destination "data/rules" --source "$repo/rules" --pattern "*.json" \
  --only-show-errors >/dev/null

rm -rf "$stage"
echo "==> done: $("$tf" output -raw url)"
