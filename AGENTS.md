# banking

This repository serves one user.

## Complete the work

Create a PR into `main`. Put feedback requests in its description.
Add a release to `src/web/app/releases.ts` for important features and major changes.
Apply the `no release` label to every other PR. CI requires one of the two.
Use the `babysit-pr` skill after creating or updating the PR.
Complete implementation, relevant tests, and a review of the final diff before merging.
Fix failures and resolve review feedback within the requested scope.
Wait for all checks to pass. Merge the PR yourself when the change is ready and any required visual approval is present.
Continue through these steps without asking for routine confirmation.
Ask only when a missing decision, permission, or external failure prevents progress.
Notify the user in the thread when work needs input and when the PR merges.
Include the PR URL, validation results, and cleanup status in the final response.
Keep T3 and its agent process running while checks run.

Fetch `origin/main` before merging. Merge it into the task branch when the task branch falls behind.
Push the updated branch and repeat all checks for its new commit.
Use merge commits. Never force-push, bypass protection, or merge a PR stack.
Keep GitHub's required CI check and strict branch updating enabled.

Use `pnpm worktree:link` after dependency installation when T3 does not run setup.
Keep each task's changes in its existing worktree.
After merge, run `pnpm worktree:cleanup <path> <pr-number> --branch-only --apply` before the final response.
This prunes remote references, verifies remote deletion, detaches the checkout, and deletes its merged local branch.
Keep T3 running for branch cleanup. Preserve local files and thread history.
Create a new task branch before making further commits in a detached checkout.
Never remove an active thread's worktree or another task's branch without explicit user authorization.
Run `pnpm worktree:cleanup <path> <pr-number>` from another checkout to inspect cleanup eligibility.
Use worktree removal with `--apply` only after the thread finishes and T3 stops.
Preserve thread history. Never edit T3's internal database.
Never force worktree removal. Preserve uncommitted changes, local data, and commits outside `origin/main`.
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
Allow page requests to the bank API only through `/api/refresh`, after the user presses Refresh.
Never call the bank API on page load, reload, filter changes, or timers.
These routes live in `vite.config.ts`.

Use `reconcile` to identify missing months.
Remove `data/raw/<month>/*.json` and press Refresh to fetch a stored month again. Do not add a force flag.

Format dates with `Europe/Oslo`. API dates use epoch milliseconds at Norwegian midnight, which is `22:00Z` during summer.
UTC formatting can place a transaction in the previous month.

Use only `pnpm rules:push` to send personal data off this machine.
It uploads `rules/*.json`, `rules/.history/` and new `data/raw/receipts/` files to the Oracle VM over `ssh` and `rsync`.
GitHub Actions builds the image from git. The VM pulls each new image. The image holds no personal data.
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
Provide either a working preview with access instructions or before-and-after screenshots embedded in the PR body.
Include the affected pages, states, and screen sizes needed to assess the changes.
Wait for my explicit approval of the presented visual changes before merging or enabling automatic merge.
Do not treat silence, passing tests, screenshots alone, or earlier implementation permission as visual approval.
Request renewed approval if subsequent changes materially alter the reviewed appearance.

## Phone layout

Open the local page in the collaborative preview without asking. Standing permission applies.
Inspect every UI change at 375 CSS px before completion.
Use one responsive layout. Prevent horizontal page scrolling.
Never bind the development server to `0.0.0.0`. The local page has no access gate and serves all transactions.

Provide plain controls for modifier-key actions. Keep hover and meta-click optional.
Show every tooltip number somewhere accessible without hover.
Contain wide content in a scrolling box. Use `overflow-x-auto`, as `DataTable` does.
