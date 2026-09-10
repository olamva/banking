# Thread workflow

## Setup

T3 reads `t3.json` and runs setup after worktree creation.
Setup installs locked dependencies and links `.env.local`, `data`, and `rules` from the main checkout.
Setup preserves existing files and refuses incorrect links.
Keep the source paths available in the main checkout.

Keep T3 and the agent running until the PR merges or a decision prevents progress.
The agent reports requests for input and merge completion in the thread.
This workflow does not install an external notification service.

## Permissions

Claude permissions and Codex execution rules permit setup, checks, branch updates, and PR merging.
The shared instructions also apply through `.agents/rules/AGENTS.md` for Antigravity.
The existing Antigravity user permissions already allow `gh` commands.
Keep force pushes, forced worktree removal, and stack merging prohibited.

Restart agent sessions after permission changes. Trust this repository's configuration in the agent host.
Codex execution rules permit matching commands outside the sandbox.
They do not change the current session's filesystem or network restrictions.
Use the host's approval mechanism when those restrictions apply.

## Merge checks

GitHub requires `Tests, types, and build` from GitHub Actions on `main` PRs.
Strict branch protection requires the branch to include current `main`.
GitHub applies these requirements to administrators and requires resolved review conversations.
GitHub deletes remote branches after merging.

Fetch `origin/main` before merging.
Merge `origin/main` into an outdated task branch, resolve conflicts, and push without rewriting history.
Repeat checks for the new commit.
Run `pnpm test` and `pnpm typecheck` locally.
Let CI run `pnpm build`; the local build guard refuses linked worktrees.
Use the babysit-pr skill to check every reported result and merge the exact reviewed commit.
Concurrent agents can encounter an outdated branch after another merge. Repeat this update cycle when GitHub refuses merging.

## Cleanup

Delete the local task branch after merge and remote branch deletion:

```sh
pnpm worktree:cleanup /absolute/worktree/path 123 --branch-only --apply
```

Run this step before the final response, while T3 remains open.
The command detaches the checkout at its existing commit and deletes the verified local branch and its configuration.
It preserves ignored local files and thread history. It refuses uncommitted changes and commits outside `origin/main`.
It requires remote branch deletion. Fetching prunes obsolete remote references.
Create a new task branch before making further commits in a detached checkout.

Run worktree inspection from another checkout:

```sh
pnpm worktree:cleanup /absolute/worktree/path 123
```

The command fetches origin with pruning and reads the PR from this checkout's GitHub repository.
It requires a merged PR into `main` and an exact match between the branch and PR head.
It also requires both the branch head and merge commit in `origin/main`.
It preserves locked worktrees, uncommitted changes, untracked files, and local commits outside `origin/main`.
It preserves ignored files except `node_modules/` and the three verified setup links.
It preserves `data.local`, including any local database. Inspect that data separately before cleanup.

Finish the thread, stop T3, and close terminals and servers that use the worktree.
Run removal from another checkout:

```sh
pnpm worktree:cleanup /absolute/worktree/path 123 --apply
```

Removal requires macOS process checks and refuses detected T3 processes or working directories inside the target.
Keep T3 stopped throughout removal. Do not start another writer during cleanup.
Git removes the worktree without force. Removal also accepts a checkout detached by branch cleanup.
GitHub handles remote branch deletion. The command never deletes another remote branch.

This command does not change T3's thread history or internal database.
T3 can retain a reference to the removed path. Create a new worktree before resuming that thread.
Worktree removal during active T3 sessions remains unavailable without a verified thread lifecycle interface.
No background cleanup service runs.

## Shared files

The setup links share `rules/` and `data/` between worktrees.
Coordinate edits to shared files before changing them.
The development server uses a separate database in `data.local`.
Do not run simultaneous shared rule edits, shared database rebuilds, or deployments.
