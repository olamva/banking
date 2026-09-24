#!/bin/bash
set -euo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
out() { terraform -chdir="$here" output -raw "$1"; }

gh variable set AZURE_CLIENT_ID --body "$(out deploy_client_id)"
gh variable set AZURE_TENANT_ID --body "$(out tenant_id)"
gh variable set AZURE_SUBSCRIPTION_ID --body "$(out subscription_id)"
gh variable set AZURE_APP --body "$(out app)"
gh variable set AZURE_RESOURCE_GROUP --body "$(out resource_group)"
