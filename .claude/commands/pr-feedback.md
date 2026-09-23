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
asks for something that breaks a rule in `AGENTS.md`, change nothing.
Answer on the PR with the reason and let me decide. It is better to ask one
question than to push a commit I did not want. Act only on what you understand.
