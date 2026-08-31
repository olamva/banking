#!/usr/bin/env bash
# PreToolUse guard: refuse a tracked change in the main checkout, on main only.
#
# .claude/CLAUDE.md says to make every tracked code change in an isolated
# worktree. Prose alone did not hold, so this is the backstop. A checkout that
# already sits on a branch of its own is a branch to work on, so the guard
# leaves it alone.
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

# Only main is protected. A checkout already on a branch of its own is a branch
# to work on, and a worktree buys nothing there.
[ "$(git -C "$cwd" symbolic-ref --short -q HEAD)" = main ] || exit 0

deny() {
  jq -nc --arg reason "$1 The main checkout sits on main. Call EnterWorktree, then run pnpm install and pnpm worktree:link. Edit rules/ and data/ in the main checkout, and write a scratch file under /tmp." '{
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason: $reason
    }
  }'
  exit 0
}

case $tool in
Edit | Write | NotebookEdit | MultiEdit)
  path=$(field '.tool_input.file_path')
  [ -n "$path" ] || exit 0
  # Every path the repo permits here is gitignored: rules/, data/, .env.local.
  git -C "$cwd" check-ignore -q "$path" 2>/dev/null && exit 0
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
  deny "A redirect writes a file in the main checkout."
  ;;
esac

exit 0
