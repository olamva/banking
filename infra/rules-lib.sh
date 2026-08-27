# Which side holds the newer rules. Sourced by deploy.sh and rules-pull.sh.
#
# rules/.history holds one file for each version, named <epoch-ms>-<file>.json,
# and the newest one holds what the live file holds. Comparing the newest stamp
# on each side therefore says which side is ahead, without reading a rule.

RULE_FILES="overrides giro payees categories family subscriptions not-subscriptions"

# Read names on stdin, print the newest stamp for one rule file, or nothing.
newest_stamp() {
  sed -n "s/^\([0-9]\{1,\}\)-$1\.json\$/\1/p" | sort -n | tail -1
}

storage_key() {
  az storage account keys list --account-name "$1" --query '[0].value' -o tsv
}

# The share may hold no history yet. That is a first deploy, not a fault.
remote_history() {
  az storage file list --account-name "$1" --account-key "$2" \
    --share-name data --path "rules/.history" --query "[].name" -o tsv \
    2>/dev/null || true
}

local_history() {
  ls "$1/.history" 2>/dev/null || true
}

when() {
  [ -n "$1" ] && [ "$1" != "0" ] || { echo "never"; return; }
  date -r "$(($1 / 1000))" -u +%Y-%m-%dT%H:%MZ
}

# Print one line for each rule file where $1's stamps are newer than $2's.
# Both arguments are newline-separated file names.
behind_files() {
  local ahead="$1" behind="$2" f a b
  for f in $RULE_FILES; do
    a="$(printf '%s\n' "$ahead" | newest_stamp "$f")"
    b="$(printf '%s\n' "$behind" | newest_stamp "$f")"
    [ -n "$a" ] || continue
    if [ "${a:-0}" -gt "${b:-0}" ]; then
      printf '  %-20s %s, other side %s\n' "$f.json" "$(when "$a")" "$(when "$b")"
    fi
  done
}
