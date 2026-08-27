#!/bin/bash
# Push the code, the built page and the rules to App Service.
# Terraform owns the resources. This script owns their contents.
set -euo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
repo="$(dirname "$here")"
stage="$repo/data/deploy"

app="$(terraform -chdir="$here" output -raw app)"
group="$(terraform -chdir="$here" output -raw resource_group)"

echo "==> build the page"
pnpm --dir "$repo" build

echo "==> stage $stage"
rm -rf "$stage"
mkdir -p "$stage"
cp -R "$repo/src" "$stage/src"
cp -R "$repo/data/dist" "$stage/data-dist-tmp"
mkdir -p "$stage/data"
mv "$stage/data-dist-tmp" "$stage/data/dist"
cp "$repo/tsconfig.json" "$stage/"

# Vite bundles React and the icons into data/dist, so the process needs neither.
# Only the vault client survives into the deployment.
node -e '
const pkg = JSON.parse(require("node:fs").readFileSync(process.argv[1], "utf8"));
const keep = ["@azure/identity", "@azure/keyvault-secrets"];
require("node:fs").writeFileSync(process.argv[2], JSON.stringify({
  name: "banking",
  private: true,
  type: "module",
  dependencies: Object.fromEntries(keep.map((k) => [k, pkg.dependencies[k]])),
}, null, 2));
' "$repo/package.json" "$stage/package.json"

# App Service runs a plain node_modules, so the hoisted linker is required.
echo "==> install the runtime dependencies"
pnpm install --dir "$stage" --prod --node-linker=hoisted --ignore-scripts

echo "==> zip"
rm -f "$repo/data/app.zip"
(cd "$stage" && zip -qr "$repo/data/app.zip" .)

echo "==> deploy the code"
az webapp deploy --resource-group "$group" --name "$app" \
  --src-path "$repo/data/app.zip" --type zip --only-show-errors >/dev/null

# The rules never enter git. They reach Azure only here, and every deploy
# re-sends them, so an edit on the Mac cannot drift out of step.
echo "==> upload the rules"
for f in "$repo"/rules/*.json; do
  name="$(basename "$f")"
  echo "    $name"
  az webapp deploy --resource-group "$group" --name "$app" \
    --src-path "$f" --type static --target-path "/home/data/rules/$name" \
    --only-show-errors >/dev/null
done

rm -rf "$stage" "$repo/data/app.zip"
echo "==> done: $(terraform -chdir="$here" output -raw url)"
