#!/bin/bash
# Put a refresh token for the AZURE client into Key Vault.
#
# `pnpm sb1 login` reads .env.local, which holds the client of this machine.
# Running that with KEY_VAULT_NAME set writes THIS machine's token into the
# vault, and then two processes share one rotating chain. This script reads the
# second client out of infra/terraform.tfvars instead, and it passes no env
# file, so .env.local cannot reach it.
set -euo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
repo="$(dirname "$here")"
vars="$here/terraform.tfvars"

[ -f "$vars" ] || { echo "no $vars" >&2; exit 1; }

field() { sed -n "s/^ *$1 *= *\"\(.*\)\"/\1/p" "$vars"; }

CLIENT_ID="$(field sb1_client_id)"
CLIENT_SECRET="$(field sb1_client_secret)"
REDIRECT_URI="$(field sb1_redirect_uri)"
FINANCIAL_INSTITUTION="$(field sb1_financial_institution)"
KEY_VAULT_NAME="$(terraform -chdir="$here" output -raw vault)"
export CLIENT_ID CLIENT_SECRET REDIRECT_URI FINANCIAL_INSTITUTION KEY_VAULT_NAME

for name in CLIENT_ID CLIENT_SECRET REDIRECT_URI FINANCIAL_INSTITUTION; do
  eval "value=\$$name"
  [ -n "$value" ] || { echo "$name is empty in $vars" >&2; exit 1; }
done

# The Mac keeps the first client. This one must differ, or the chains collide.
if [ -f "$repo/.env.local" ] && grep -q "CLIENT_ID=\"\?$CLIENT_ID" "$repo/.env.local"; then
  echo "refusing: this is the same client that .env.local uses." >&2
  echo "register a second client in the SB1 portal first." >&2
  exit 1
fi

echo "client ${CLIENT_ID:0:8}... redirect $REDIRECT_URI -> vault $KEY_VAULT_NAME"
# No --env-file. .env.local must not reach this.
node "$repo/src/cli.ts" login
