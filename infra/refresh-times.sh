#!/bin/bash
set -euo pipefail

ssh "${BANKING_SSH:-banking}" 'sudo journalctl -u banking -o cat' | TZ=Europe/Oslo jq -rR '
  def oslo: sub("\\.[0-9]+Z$"; "Z") | fromdateiso8601 | strflocaltime("%Y-%m-%d %H:%M");
  def s: if . == null then "-" else (. / 1000 * 10 | round / 10 | tostring) + "s" end;
  fromjson? | select(.event? == "refresh")
  | [(.time | oslo), (.totalMs | s), (.steps | to_entries[] | "\(.key): \(.value | s)"), (.error // empty)]
  | join("  ")'
