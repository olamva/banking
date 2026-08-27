#!/bin/bash
# Run terraform against the state and the variables that live outside the repo.
# Use this rather than bare terraform, from any checkout or worktree.
#
#   infra/tf.sh init
#   infra/tf.sh apply
#   infra/tf.sh output -raw url
set -euo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
home_dir="${BANKING_AZURE_HOME:-$HOME/.config/banking-azure}"
state="$home_dir/terraform.tfstate"
vars="$home_dir/terraform.tfvars"

mkdir -p "$home_dir"
chmod 700 "$home_dir"

cmd="${1:-}"
shift || true

case "$cmd" in
init)
  terraform -chdir="$here" init -backend-config="path=$state" "$@"
  ;;
plan | apply | destroy)
  if [ ! -f "$vars" ]; then
    echo "no $vars — copy infra/terraform.tfvars.example there and fill it in" >&2
    exit 1
  fi
  terraform -chdir="$here" "$cmd" -var-file="$vars" "$@"
  ;;
"")
  echo "usage: infra/tf.sh <init | plan | apply | destroy | output | ...>" >&2
  exit 1
  ;;
*)
  terraform -chdir="$here" "$cmd" "$@"
  ;;
esac
