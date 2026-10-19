#!/bin/bash
set -euo pipefail

ssh "${BANKING_SSH:-banking}" 'sudo journalctl -u banking --since -30d -o cat' | TZ=Europe/Oslo jq -nR '
  def oslo: sub("\\.[0-9]+Z$"; "Z") | fromdateiso8601 | strflocaltime("%Y-%m-%d %H:%M:%S");
  def count(access): map(select(.access == access)) | length;
  [inputs | fromjson? | select(.event? == "http_request")]
  | group_by([.userAgent, .forwardedFor])
  | map({
      UserAgent: .[0].userAgent,
      ForwardedFor: .[0].forwardedFor,
      Requests: length,
      Allowed: count("allowed"),
      Denied: count("denied"),
      Anonymous: count("anonymous"),
      FirstSeen: (map(.time) | min),
      LastSeen: (map(.time) | max),
      Paths: (map(.path) | unique | .[:30]),
      StatusCodes: (map(.status) | unique | .[:20])
    })
  | sort_by(.LastSeen) | reverse
  | map(.FirstSeen |= oslo | .LastSeen |= oslo)'
