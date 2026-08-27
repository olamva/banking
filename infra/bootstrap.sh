#!/bin/bash
# Create the storage that holds the terraform state, and write backend.hcl.
# The state cannot describe the account that holds it, so this runs once, on az
# alone, before the first init. It is safe to run again.
set -euo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
location="${BANKING_TF_LOCATION:-norwayeast}"
group="${BANKING_TF_GROUP:-banking-tfstate}"
container="tfstate"

subscription="$(az account show --query id -o tsv)"
# A storage account name is globally unique and takes 24 lower-case alphanumeric
# characters. The digest keeps it stable for this subscription.
digest="$(printf '%s' "$subscription" | shasum | cut -c1-8)"
account="bankingtfstate${digest}"

echo "==> subscription $subscription"
echo "==> resource group $group in $location"
az group create --name "$group" --location "$location" --only-show-errors >/dev/null

echo "==> storage account $account"
az storage account create --name "$account" --resource-group "$group" \
  --location "$location" --sku Standard_LRS --kind StorageV2 \
  --min-tls-version TLS1_2 --allow-blob-public-access false \
  --only-show-errors >/dev/null

echo "==> grant yourself the data plane role"
user="$(az ad signed-in-user show --query id -o tsv)"
scope="$(az storage account show --name "$account" --resource-group "$group" --query id -o tsv)"
az role assignment create --assignee-object-id "$user" --assignee-principal-type User \
  --role "Storage Blob Data Contributor" --scope "$scope" \
  --only-show-errors >/dev/null 2>&1 || echo "    (already granted)"

echo "==> container $container"
az storage container create --name "$container" --account-name "$account" \
  --auth-mode login --only-show-errors >/dev/null

cat >"$here/backend.hcl" <<EOF
resource_group_name  = "$group"
storage_account_name = "$account"
container_name       = "$container"
key                  = "banking.tfstate"
use_azuread_auth     = true
EOF

echo "==> wrote $here/backend.hcl"
echo
echo "Now run:"
echo "  terraform -chdir=infra init -backend-config=backend.hcl"
echo
echo "A new role assignment can take a minute to reach the data plane. Init"
echo "again if it refuses the first time."
