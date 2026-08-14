---
description: Read my comments on a PR and act on them, in a worktree on that PR's branch
argument-hint: [PR number]
---

Act on my review feedback for PR $ARGUMENTS. If that number is blank, ask me for one
and stop — the fetches below need it.

## The PR

!`gh pr view $ARGUMENTS --json number,title,state,url,headRefName --jq '"#\(.number) \(.title)\nstate: \(.state)\nbranch: \(.headRefName)\n\(.url)"'`

Top-level comments, oldest first:

!`gh pr view $ARGUMENTS --comments`

Inline comments on the diff:

!`gh api repos/{owner}/{repo}/pulls/$ARGUMENTS/comments --jq '.[] | "--\n\(.path):\(.line // .original_line)  @\(.user.login)\n\(.body)"'`

## What to act on

Every comment of mine that no later reply of yours already answers. Your own
earlier replies are in the list above — read them first and do not do the same
work twice. If nothing is unanswered, say so in one line and stop. Do not
comment on the PR to say there was nothing to do.

**Disagree by replying, never by editing.** If a comment is wrong, unclear, or
asks for something that breaks a rule in `.claude/CLAUDE.md`, change nothing.
Answer on the PR with the reason and let me decide. It is better to ask one
question than to push a commit I did not want. Act only on what you understand.

## Where to work

The branch is checked out nowhere — the agent that opened the PR gave it back.
Put it in a worktree, so my own checkout stays where it is:

1. Read the branch name from the PR data above. If `git worktree list` already
   shows that branch, use that path. If not, make one:
   `git worktree add .claude/worktrees/<branch> <branch>`
2. Enter it with the `EnterWorktree` tool and its `path` argument.
3. `pnpm install` — a new worktree has no `node_modules`.

## Finishing

`pnpm test` and `pnpm typecheck` must both pass. Then commit in the repo's
style, push the branch, and reply once on the PR: what you changed, and what
you refused and why. One short paragraph, no account numbers, payee names or
amounts.

Then hand the branch back the way the global rules say — `ExitWorktree` with
`action: "keep"`, `git worktree unlock`, `git worktree remove` — so I can check
the branch out myself. Move any papercuts to the main checkout before you go.
