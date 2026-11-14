# banking

This repository serves one user.

## Complete the work

Create a PR into `main`. Put feedback requests in its description.
Add a release file to `src/web/app/release-notes/` for important features and major changes. The README gives its format.
Limit releases to changes in the app, including performance. Scripts, CI and terminal output get `no release`.
Apply the `no release` label to every other PR. CI requires one of the two.
Use the `babysit-pr` skill after creating or updating the PR.
Complete implementation, relevant tests, and a review of the final diff before merging.
Fix failures and resolve review feedback within the requested scope.
Enable auto-merge with `gh pr merge --auto --merge` after you create the PR.
For a change that needs visual approval, enable auto-merge only after I approve.
Continue through these steps without asking for routine confirmation.
Ask only when a missing decision, permission, or external failure prevents progress.
Notify the user in the thread when work needs input and when the PR merges.
Include the PR URL, validation results, and cleanup status in the final response.
Keep T3 and its agent process running while checks run.
Run each post-merge step yourself, such as `pnpm rules:push` and `pnpm receipts:seed`. Ask only when a tool refuses it twice.

Merge `origin/main` into the task branch only when GitHub reports a conflict. Then push and repeat all checks for the new commit.
Use merge commits. Never force-push, bypass protection, or merge a PR stack.
Keep GitHub's required CI check enabled. Keep strict branch updating off.

Use `pnpm worktree:link` after dependency installation when T3 does not run setup.
Keep each task's changes in its existing worktree.
After merge, run `pnpm worktree:cleanup <path> <pr-number> --branch-only --apply` before the final response.
This waits up to 2 minutes for auto-merge, verifies remote deletion, detaches the checkout, and deletes its merged local branch.
If a task ends without a PR, and `git status --porcelain` and `git log origin/main..HEAD` show nothing, run `git switch --detach` and then `git branch -d <branch>` in the task worktree.
Create a new task branch before making further commits in a detached checkout.
T3 setup runs `pnpm worktree:cleanup --merged --apply`. It removes the worktrees of merged PRs and deletes merged `t3/` branches without a worktree.
Do not remove another task's worktree or branch by hand.
Preserve thread history. Never edit T3's internal database.
Never force worktree removal. Preserve uncommitted changes, local files other than `data.local`, and commits outside `origin/main`.
Leave cleanup pending when these conditions prevent removal.

Keep shared `rules/` edits, shared database rebuilds, and deployments separate from concurrent writers.
Do not assume that worktrees isolate the linked `rules/` and `data/` directories.

Commit manual rule edits in the `rules/` repository during the same turn.
Stage only the intended edits. Page edits need no commit because `rules/.history/` versions them.

## Data and requests

Keep fetching in `src/net/` and analysis in `src/core/`. Use `src/web/` to compose them.
Keep `src/core/` compatible with Node and browsers. Never import `node:` modules or `src/net/` there.
Ask where a new file belongs if its directory is unclear.

Treat `data/raw/` as the source of truth. Analysis reads local data and never calls the bank API.
Insert database rows only through `rebuild`. It empties the table and rebuilds from raw files.
Never rely on transaction IDs across syncs. SB1 changes them on every fetch and when reservations book.

Keep `/api/txns` reading only `data/banking.db`.
Call the bank and receipt APIs only through `refresh` in `src/web/api.ts`.
Start `refresh` only from the Refresh button, the hosted server's midnight run, or the first payload request of each Oslo day.
Run the midnight and first-visit refreshes only on the hosted server, through `autoRefresh` in `src/web/server.ts`.
Never call the bank API on other page loads, reloads, filter changes, or timers.
Let the page poll only `/api/refresh/status`. It reports the refresh state and never starts a refresh.
These routes live in `vite.config.ts` and `src/web/server.ts`.

Use `reconcile` to identify missing months.
Remove `data/raw/<month>/*.json` and press Refresh to fetch a stored month again. Do not add a force flag.

Format dates with `Europe/Oslo`. API dates use epoch milliseconds at Norwegian midnight, which is `22:00Z` during summer.
UTC formatting can place a transaction in the previous month.

Use only `pnpm rules:push` to send personal data off this machine.
It uploads `rules/*.json`, `rules/.history/` and new `data/raw/receipts/` files to the Oracle VM over `ssh` and `rsync`.
GitHub Actions builds the image from git. The VM pulls each new image. The image holds no personal data.
Use only `pnpm receipts:seed` to send the receipt logins to `/srv/banking/secrets/` on the VM.
Store each receipt login with `secretSet(<source>)` and read it with `secretGet(<source>)` from `src/net/token.ts`.
Name each receipt setting in `.env` with the source in capitals and `_`, such as `REMA_SUBSCRIPTION_KEY`, and read it with `env`.
Keep the deployment gate. Get an explicit decision before adding another upload route.
Use `pnpm rules:pull` to download these files without sending personal data.

## Money and classification

Read `card: true` from `rules/accounts.json` for `billReason` and the travel guess.
Use `typeText` to distinguish peer payments from lump transfers. A name alone cannot distinguish them.
Instant and card payments are peer payments. Giro and plain `Overførsel` transactions are lumps.
Use `rules/giro.json` to assign meaning to lumps. The payment type describes movement, not purpose.
Keep `remoteAccountNumber` on `Txn` and in override matching. It distinguishes unrelated bills from the same payee.

Split income and spending by sign, never category.
Use `exclude.ts` to remove income from totals, and preserve the netting invariant.
Keep refunds as income within their spending categories. Show them in `Income by category`.
Reconcile both totals to the øre.

Preserve this `categorize` precedence:

1. Excluded rows → `overfoering`; retain the exclusion `reason`.
2. `rules/categories.json` → `category/sub`.
3. `rules/giro.json`, for lumps only.
4. `rules/family.json`.
5. The two Vipps peer shapes.
6. The bank's category pair.
7. The travel guess, for card rows only.

Keep `rules/categories.json` independent of line order. Reordering must never change a row's category.
Keep one category rule type. A key with more conditions wins over a key with fewer conditions.
Fix collisions between different categories by narrowing patterns, never by changing the matcher or line order.
Use `rebuild` to report collisions and suggested patterns. Leave collisions within the same category alone.

Use names from `rules/payees.json` exactly as written.
Apply mechanical formatting in `src/core/names.ts` only when no payee rule matches.
Give `rules/countries.json` precedence over card-name parsing and currency fallback.
Keep name and country changes independent of money totals.

Apply `rules/family.json` regardless of sign.
Categorize money from relatives as `innskudd/familie` and repayments to relatives as `diverse/vennebetaling`.

## Rule history and synchronization

Keep `rules/.history/` ignored with its `*` pattern. Store whole-file snapshots there.
Write the snapshot and live file together in `save`. Keep the newest snapshot identical to the live file.
Implement `undo` by copying the second-newest snapshot.

Preserve the version comparisons in `infra/rules-lib.sh`.
Make `pnpm rules:push` refuse to overwrite newer site rules.
Make `pnpm rules:pull` refuse to overwrite newer local rules.
Keep pull's local rule commit and rebuild. Never overwrite newer rules silently.

## Transfer exclusions

Flag internal transfers without dropping rows. Keep exclusions auditable.
Match equal amounts, the same date, and opposite signs across different accounts marked `mine`.
Require both transactions' `Txn.typeText` values to contain the transfer stem `overfør`.
Never match on amount, date, and sign alone.

Use `transferPairs` once per month. Pair transactions one-to-one and consume each transaction once.
Never replace pairing with a counterpart-existence check.

## Visual review before merge

Require my explicit visual approval before merging any visual change beyond a minor correction.
Require review for noticeable changes to layout, navigation, typography, color scheme, component styling, or responsive behavior.
Limit minor corrections to isolated fixes that preserve the existing design.
Require review when the classification is unclear.
Prepare the completed changes before requesting approval.
Capture before and after screenshots with `pnpm shot --before origin/main`. Follow `.claude/skills/screenshots/SKILL.md`.
Show the screenshots in the T3 thread. Do not ask me to open a dev server or a preview.
Never put screenshots on GitHub. This repository is public, and each screenshot shows real transactions.
Write in the PR description that visual approval is pending in the T3 thread.
Include the affected pages, states, and screen sizes needed to assess the changes.
Wait for my explicit approval of the presented visual changes before merging or enabling automatic merge.
Do not treat silence, passing tests, screenshots alone, or earlier implementation permission as visual approval.
Request renewed approval if subsequent changes materially alter the reviewed appearance.

## Phone layout

Inspect every UI change at 375 CSS px with `pnpm shot` before completion. Do not use the T3 preview tools.
Use one responsive layout. Prevent horizontal page scrolling.
Never bind the development server to `0.0.0.0`. The local page has no access gate and serves all transactions.

Provide plain controls for modifier-key actions. Keep hover and meta-click optional.
Show every tooltip number somewhere accessible without hover.
Contain wide content in a scrolling box. Use `overflow-x-auto`, as `DataTable` does.
