---
name: babysit-pr
description: Monitor checks after creating or updating a PR. Wait for successful checks before any authorized merge.
---

Use this skill whenever you create or update a PR in this repository.

Record the PR number and current head commit with `gh pr view <pr> --json number,headRefOid,statusCheckRollup`.
Inspect `.github/workflows/` to identify expected checks.

Run `gh pr checks <pr> --watch --interval 10`.
Keep the command asynchronous so you can provide progress updates.
Do not restrict monitoring to required checks.
Branch protection can contain no required checks.

Treat missing checks as pending, never as success.
Check workflow runs if checks do not appear.
Treat skipped, cancelled, neutral, and failed expected checks as blockers.
Inspect failed logs without exposing credentials or personal data.
Fix failures within the authorized task, push the changes, and restart monitoring for the new head commit.
Do not disable checks or weaken assertions to obtain success.
Report an external blocker and leave the PR open when further work needs user input or unavailable service access.

After checks finish, fetch `origin/main` and check whether the task branch includes it.
Use `git merge origin/main` when the branch falls behind. Resolve conflicts, push, and restart monitoring.
Never rebase a published branch or force-push it.
Treat GitHub's behind or blocked merge state as a blocker.
After checks finish, query the PR head and checks again.
Require every expected check to report success for the current head commit.
Require every other reported check to finish without failure.
Restart monitoring if the head changes.
Resolve review requirements and conversations before merging.

Merge only when the user or repository instructions authorize it.
Use `gh pr merge <pr> --merge --match-head-commit <sha>` to prevent merging a different head commit.
Do not use `--admin` or merge while checks remain pending.
Confirm the merged state and report the PR URL.
Check remote branch deletion. GitHub deletes merged branches automatically in this repository.
Run `pnpm worktree:cleanup <path> <pr-number> --branch-only --apply` before the final response.
Keep T3 running. The command preserves files and detaches the checkout before deleting its merged local branch.
Create a new task branch before making further commits in a detached checkout.
Leave an active worktree in place. Report branch deletion and its path for later worktree cleanup.
Use `pnpm worktree:cleanup <path> <pr-number>` from another checkout after the thread finishes.
Read `docs/thread-workflow.md` for cleanup requirements.
