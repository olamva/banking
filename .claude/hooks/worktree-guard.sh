#!/usr/bin/env bash
# PreToolUse guard: refuse a tracked change in the main checkout.
#
# .claude/CLAUDE.md says to make every tracked code change in an isolated
# worktree. Prose alone did not hold, so this is the backstop.
#
# Reads the hook payload on stdin, prints a deny decision, exits 0 either way:
# a hook that errors is a hook that blocks nothing.
set -uo pipefail

payload=$(cat)
field() { printf '%s' "$payload" | jq -r "$1 // empty" 2>/dev/null; }
has() { printf '%s' "$cmd" | grep -qE "$1"; }

tool=$(field '.tool_name')
cwd=$(field '.cwd')
[ -n "$cwd" ] || cwd=$PWD

# A linked worktree keeps its git dir under the common one, so the two paths
# differ there. Only the main checkout has them equal, and only there does this
# guard have work to do.
git_dir=$(git -C "$cwd" rev-parse --absolute-git-dir 2>/dev/null) || exit 0
common=$(git -C "$cwd" rev-parse --path-format=absolute --git-common-dir 2>/dev/null) || exit 0
[ "$git_dir" = "$common" ] || exit 0

deny() {
  jq -nc --arg reason "$1 Call EnterWorktree, then run pnpm install and pnpm worktree:link. Edit rules/ and data/ in the main checkout, and write a scratch file under /tmp." '{
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason: $reason
    }
  }'
  exit 0
}

case $tool in
apply_patch)
  patch=$(field '.tool_input.command')
  paths=$(printf '%s\n' "$patch" | sed -nE 's/^\*\*\* (Add|Update|Delete) File: //p')
  [ -n "$paths" ] || deny "apply_patch has no file list that the guard can check."
  while IFS= read -r path; do
    git -C "$cwd" check-ignore -q "$path" 2>/dev/null && continue
    git -C "$cwd" ls-files --error-unmatch "$path" >/dev/null 2>&1 || continue
    deny "$path is a tracked path in the main checkout."
  done <<<"$paths"
  ;;
Edit | Write | NotebookEdit | MultiEdit)
  path=$(field '.tool_input.file_path')
  [ -n "$path" ] || exit 0
  # Every path the repo permits here is gitignored: rules/, data/, .env.local.
  git -C "$cwd" check-ignore -q "$path" 2>/dev/null && exit 0
  git -C "$cwd" ls-files --error-unmatch "$path" >/dev/null 2>&1 || exit 0
  deny "$path is a tracked path in the main checkout."
  ;;
Bash)
  cmd=$(field '.tool_input.command')
  [ -n "$cmd" ] || exit 0

  # The documented exception: a rules edit belongs in the main checkout.
  has '(^|[^[:alnum:]/_-])(rules|data)/' && exit 0

  # In-place rewriters. A verb that only creates a file is left alone, because
  # blocking mkdir and cp breaks the provisioning that this guard asks for.
  has "^sed[[:space:]]+-i[[:space:]]+(''|\"\")[[:space:]]+[^[:space:]]+[[:space:]]+(/tmp/|/private/tmp/|/var/folders/)[^[:space:]]+$" && exit 0
  has 'sed[[:space:]]+(-[[:alnum:]]*i|--in-place)' && deny "sed rewrites a file in place, in the main checkout."
  has 'perl[[:space:]]+-[[:alnum:]]*i' && deny "perl rewrites a file in place, in the main checkout."
  has 'awk[[:space:]]+-i[[:space:]]+inplace' && deny "awk rewrites a file in place, in the main checkout."
  has '(^|[^[:alnum:]-])(patch|git[[:space:]]+apply)([[:space:]]|$)' && deny "This applies a patch in the main checkout."
  has 'git[[:space:]]+(restore|checkout)[[:space:]]+--' && deny "This discards a working-tree file in the main checkout."
  has '(--write|--fix)([[:space:]]|$)' && deny "A formatter rewrites the files it reads, in the main checkout."
  has '[[:space:]]tee([[:space:]]|$)' && deny "tee writes a file in the main checkout."

  # A redirect counts only when it names a path outside the scratch roots. The
  # leading whitespace is what tells `> file` from `2>&1` and from a `=>` that
  # a grep pattern holds.
  redirect='(^|[[:space:]])>>?[[:space:]]*[^ &|]'
  has "$redirect" || exit 0
  has '>>?[[:space:]]*(/tmp/|/dev/|/var/folders/|\$CLAUDE|\$TMPDIR)' && exit 0

  # This guard covers one repository. A path outside it is another repository's
  # business, or nobody's. ~/.claude/CLAUDE.md is the common one.
  target=$(printf '%s' "$cmd" | sed -nE "s/.*(^|[[:space:]])>>?[[:space:]]*([^ &|]+).*/\\2/p")
  target=${target/#\~/$HOME}
  root=$(git -C "$cwd" rev-parse --show-toplevel 2>/dev/null)
  case $target in
  "$root"/*) ;;
  /*) exit 0 ;;
  esac
  deny "A redirect writes a file in the main checkout."
  ;;
esac

exit 0
