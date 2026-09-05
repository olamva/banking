#!/bin/bash
set -euo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
workspace="$(terraform -chdir="$here" output -raw traffic_workspace_id)"
az monitor log-analytics query --workspace "$workspace" \
  --analytics-query "$(cat "$here/traffic.kql")" --timespan P30D -o json
