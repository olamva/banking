#!/bin/bash
# Create the storage that holds the terraform state. Run it one time, before the
# first init. It is safe to run again.
#
# This runs on az alone, because the state cannot describe the storage that
# holds it. It reads the names out of backend.tf, which is the one place they
# are written, so the two cannot drift.
set -euo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
backend="$here/backend.tf"

field() {
  sed -n "s/^ *$1 *= *\"\\(.*\\)\"/\\1/p" "$backend"
}

group="$(field resource_group_name)"
account="$(field storage_account_name)"
container="$(field container_name)"
location="${BANKING_TF_LOCATION:-norwayeast}"

if [ -z "$group" ] || [ -z "$account" ] || [ -z "$container" ]; then
  echo "could not read the backend names out of $backend" >&2
  exit 1
fi

echo "==> subscription $(az account show --query id -o tsv)"

# A subscription serves a namespace only after it is registered, and a fresh one
# registers almost nothing. The failure arrives late, as a 409 from the first
# resource in that namespace, so do it here rather than read it as a bug.
echo "==> resource providers"
for ns in Microsoft.App Microsoft.ContainerRegistry Microsoft.KeyVault Microsoft.Storage; do
  if [ "$(az provider show --namespace "$ns" --query registrationState -o tsv 2>/dev/null)" != "Registered" ]; then
    echo "    registering $ns"
    az provider register --namespace "$ns" --wait --only-show-errors
  fi
done
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

echo
echo "Now run:  terraform -chdir=infra init"
echo
echo "A new role assignment can take a minute to reach the data plane. Init"
echo "again if it refuses the first time."
