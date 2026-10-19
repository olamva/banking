#!/bin/bash
set -euo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
vars="$here/../terraform.tfvars"
host="${BANKING_SSH:-banking}"

[ -f "$vars" ] || { echo "no $vars" >&2; exit 1; }
field() { sed -n "s/^ *$1 *= *\"\(.*\)\"/\1/p" "$vars"; }
emails="$(sed -n 's/^ *allowed_emails *= *\[\(.*\)\]/\1/p' "$vars" | tr -d ' "')"
domain="$(field custom_domain)"
user="$(field ghcr_username)"
for name in emails domain; do
  [ -n "${!name}" ] || { echo "$name is empty in $vars" >&2; exit 1; }
done

put() { ssh "$host" "sudo install -D -m $1 /dev/stdin $2"; }

printf 'ALLOWED_EMAILS=%s\nCLIENT_ID=%s\nCLIENT_SECRET=%s\nREDIRECT_URI=%s\nFINANCIAL_INSTITUTION=%s\n' \
  "$emails" "$(field sb1_client_id)" "$(field sb1_client_secret)" "$(field sb1_redirect_uri)" \
  "$(field sb1_financial_institution)" | put 600 /etc/banking/env
printf 'OAUTH2_PROXY_CLIENT_ID=%s\nOAUTH2_PROXY_CLIENT_SECRET=%s\nOAUTH2_PROXY_COOKIE_SECRET=%s\n' \
  "$(field google_client_id)" "$(field google_client_secret)" "$(openssl rand -hex 16)" |
  put 600 /etc/banking/oauth2-proxy.env
printf '{"auths":{"ghcr.io":{"auth":"%s"}}}\n' \
  "$(printf '%s:%s' "${user:-olamva}" "$(field ghcr_token)" | base64)" | put 600 /etc/banking/ghcr.json
printf '%s\n' "$emails" | tr ',' '\n' | put 644 /etc/banking/emails
put 644 /etc/banking/oauth2-proxy.cfg < "$here/oauth2-proxy.cfg"
put 644 /etc/containers/systemd/banking.container < "$here/banking.container"
put 644 /etc/containers/systemd/oauth2-proxy.container < "$here/oauth2-proxy.container"
printf '%s {\n\treverse_proxy 127.0.0.1:4180\n}\n' "$domain" | put 644 /etc/caddy/Caddyfile

ssh "$host" 'sudo systemctl daemon-reload && sudo systemctl restart banking oauth2-proxy && sudo systemctl reload caddy'
