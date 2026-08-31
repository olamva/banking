# Which side holds the newer rules. Sourced by deploy.sh and rules-pull.sh.
#
# rules/.history holds one file for each version, named <epoch-ms>-<file>.json.
# A new version always takes the time it was written, so the newest stamp only
# moves forward. Comparing it on each side therefore says which side is ahead,
# without reading a rule. The live file holds the version at the cursor, which
# sits below the newest one while a reader steps back through the stack.
#
# ponytail: neither side deletes. An edit below the cursor drops the versions
# above it, and the other side keeps its copies until somebody prunes by hand.

RULE_FILES="categories giro payees labels family subscriptions not-subscriptions"

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

missing_history() {
  comm -23 \
    <(printf '%s\n' "$1" | sed -n '/^[0-9][0-9]*-.*\.json$/p' | sort -u) \
    <(printf '%s\n' "$2" | sed -n '/^[0-9][0-9]*-.*\.json$/p' | sort -u)
}

# The live rule files as the share holds them, in a new temporary directory.
# The caller removes it. A file the share lacks is skipped, not a fault.
remote_live() {
  local dir f
  dir="$(mktemp -d)"
  for f in $RULE_FILES; do
    az storage file download --account-name "$1" --account-key "$2" \
      --share-name data --path "rules/$f.json" --dest "$dir/$f.json" \
      --only-show-errors >/dev/null 2>&1 || true
  done
  printf '%s\n' "$dir"
}

# Print one line for each rule file that differs between two directories of live
# files. The cursor is not a stamp: a move through the history rewrites the live
# file and writes no version, so equal stamps do not mean equal rules. Only ask
# this when neither side holds a newer version, or an ordinary edit answers yes.
live_diff() {
  local a="$1" b="$2" f
  for f in $RULE_FILES; do
    [ -f "$a/$f.json" ] && [ -f "$b/$f.json" ] || continue
    cmp -s "$a/$f.json" "$b/$f.json" || printf '  %s\n' "$f.json"
  done
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
