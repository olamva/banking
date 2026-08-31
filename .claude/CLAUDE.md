# banking

This is a private repo for one user. It is not a product.

## Committing

Commit, push and PRs are authorised in this repo. Commit when the work reaches a state worth keeping. Push your own branch. Open the PR against `main` when the work is done. `.claude/settings.json` holds the matching permissions, so none of these actions prompts.

A PR body holds no account numbers, no payee names and no amounts.

A rule edit that you make by hand is finished only after you commit it there, in the same turn. An edit made on the page needs no such commit, because `rules/.history/` versions it.

The last paragraph, below the code block, becomes:

```bash
git -C rules add -A && git -C rules commit -m "chore: …"
```

This commit is required, not only permitted.

## Working in a worktree

Run `pnpm install`, then run `pnpm worktree:link`. These two commands are the whole provisioning step. The second command makes symlinks to `.env.local`, `data` and `rules` in the main checkout.

Retry `pnpm install` with network permission when sandbox DNS fails. Do not use `--offline` as a fallback.

`pnpm sb1 rebuild` is not isolated. It writes the shared database through the `data` link. Rebuild through the page, or run the command from the main checkout.

You cannot change `rules/` or `data/` from a worktree. The symlink does not avoid this rule. The isolation guard resolves the link to the shared path and refuses the write. There is also nothing to isolate, because no commit carries those files. Make a rules edit in the main checkout. Do not enter a worktree for a task that only edits rules.

The Bash guard refuses a compound command inside an isolated session. This covers heredocs, redirects and `&&` chains. The guard is syntactic. Write the script to `$CLAUDE_JOB_DIR/tmp` and run it in one plain call.

`EnterWorktree` branches from `origin/main`. Check the base before you build on it. A branch that appears to stack on work that is not on `main` shows this error.

Deploy from the main checkout. The deploy reads `data/banking.db` and `rules/`, and it writes `data/dist`. All of them resolve to the shared path, so a worktree cannot do it. `vite build` refuses to run in a worktree for that reason, and the deploy builds first, so one guard covers both.

## Deploying

```bash
pnpm sb1 rebuild                # only when the rules changed
pnpm deploy                     # build, push the code and the page, upload the rules
```

`terraform -chdir=infra apply` creates the resources. `pnpm deploy` fills them. Run the deploy from the main checkout.

## Layout

`src/` is split by the side of the rule that each file is on. `net/` may make requests. `core/` may not. `web/` composes them. Ask which side of "analysis never calls the API" a new file sits on when its directory is not obvious.

`data/raw/` is the source of truth. It is the only thing that costs an API call to reproduce. The database is derived and disposable.

Both Node and the browser import everything under `src/core/`. That code must have no `node:` imports. This lets the page aggregate with the same code that `node --test` pins.

## Rules

Analysis never calls the API. `src/net/` holds the fetching. Every later step reads `data/raw/`. No file in `src/core/` may import from `src/net/`.

No page view costs a request. `/api/txns` reads only `data/banking.db`. Only `/api/refresh` calls the API, and only a press of the Refresh button reaches it. Both live in `vite.config.ts`. Never make a request on load, on a filter, on a reload or on a timer.

Deleting a raw file is how you make the bank restate one. No force flag exists. Remove `data/raw/<month>/*.json` and press Refresh. `reconcile` is what tells you a month is owed.

Dates are Oslo-local. The `date` field from the API is epoch milliseconds at Norwegian midnight. Every summer timestamp is therefore `22:00Z`. Format with `Europe/Oslo`. UTC moves the first day of the month into the previous month.

One route sends personal data off this machine, and only one. `pnpm deploy` uploads `data/dist`, `rules/*.json` and `rules/.history/` to the Azure site. `pnpm rules:pull` reads the same files back, and it sends nothing. Both hold personal data. This is deliberate, and it is the reason the gate exists. No other command may send this data anywhere. Adding a second route needs a decision, not a patch.

## Data model

- Two rules need to know which account is the credit card. Both read `card: true` from `rules/accounts.json`. These rules are `billReason` and the travel guess.
- A name alone does not mean a peer payment. A flatmate has two relationships at once: small instant payments, and a standing monthly transfer. The description is the bare name in both. `typeText` separates them. An instant or card payment is a peer payment. A giro or a plain `Overførsel` is a lump. The type shows how the money moved. It never shows why. `rules/giro.json` therefore maps the name to the meaning of its lumps.
- One payee can bill two unrelated things under one name. Only `remoteAccountNumber` separates them. This is why that field is on `Txn` and in the override haystack.
- Income and spending split on the sign, not on the category. No category can move money between the two totals. To take something out of income, exclude it in `exclude.ts`. That is a money change with a netting invariant. It is not a rules edit.
- A spending category with income in it is expected. A merchant refund is money in, filed where the money went out. `Income by category` shows this rather than hiding it. Both sides reconcile to the øre.

## Categorising

`categorize` runs its rules in this order. The order is part of the design.

1. excluded -> `overfoering`, above every other rule. `reason` says why a row is out, so the category adds nothing.
2. `rules/categories.json` — pattern -> `category/sub`.
3. `rules/giro.json`. This rule applies only when the row is a lump.
4. `rules/family.json`. It sits below the lump rule, so pocket money keeps the better label. It sits above the Vipps rules, which would call every gift a peer payment.
5. The two Vipps peer shapes. They sit above the bank's own category. A row that keeps `diverse/overforing` reads a peer payment as a transfer.
6. The bank's own pair.
7. The travel guess, on card rows only.

Every line in `rules/categories.json` works in any position. `categorize` takes the first pattern that matches, so the file _can_ act as a sequence. It must not. Two lines that claim the same row under different categories make the order load-bearing and invisible. You may sort, group or reorder the file freely, and every row must land where it landed before.

Fix a collision in the _pattern_. Do not fix it in the matcher or in the order. `rebuild` prints every offending pair and the narrowed form of the loser. One example is `/^(?!.*(?:sit kafe))(?=.*\bsit\b)/`. It holds a refusal lookahead and a requirement lookahead. Neither one consumes any characters. A collision where both lines name the same category is harmless. Leave it alone.

A name is either known or only shaped. The two never mix. `rules/payees.json` carries knowledge: NSB is Vy, and two spellings are one bookshop. `src/core/names.ts` carries the opposite. It carries the formatting that SB1 puts on every name, which is mechanical. It runs only on names that no rule claimed. Use the name from a rule exactly as written. The cleaner would return `IKEA` as `Ikea`. A rename can never move money. That property makes the file safe to edit.

The country splits the same way. `src/core/names.ts` reads the shape of the card name, and it falls back to the currency. `rules/countries.json` carries the knowledge, and it beats the shape. A country can never move money either.

`rules/family.json` names relatives. The sign decides what the entry means. The sign does not decide whether the entry applies. Money in is `innskudd/familie`. Money out to the same person is a repayment to a relative, so it is `diverse/vennebetaling`. The category enforces this.

## Editing the rules on the page

`rules/.history/` is the version control. A whole-file snapshot needs no diff format and no replay, and undo is a copy. The directory holds a `.gitignore` of `*`, because `rules/` is a git repo on the Mac and a plain directory on the volume. Versioning the versions helps nobody.

The newest version holds what the live file holds. `save` writes the snapshot and the live file together, so the two never disagree. This is what makes `undo` the second-newest version, and it is what lets `infra/rules-lib.sh` say which host is ahead without reading a rule. Keep the two writes together.

`pnpm deploy` refuses to overwrite a newer rule on the site. The site writes its own `rules/` now, so the upload is no longer a one-way copy of a file that only the Mac writes. The deploy compares the newest version on each side and stops. `pnpm rules:pull` brings the site copy back, commits it to the local `rules/` git repo, and rebuilds. The pull refuses in the other direction for the same reason. Never make either one overwrite in silence.

## Exclusions

The code flags an internal transfer. It never drops one. The excluded set must stay auditable. Both sides are present because the code syncs every account. Match on amount, date and opposite sign. Restrict the match to accounts marked `mine`.

Amount, date and opposite sign are not enough alone. They are a weak signal at these volumes. 22 kr of deposit interest matches a 22 kr coffee exactly. Every such collision removes real money from the totals. The bank must also type both legs as a transfer. Match `Txn.typeText` on the stem `overfør`. Check both legs. Never check one.

Pairing is one to one. That is not the same as "a counterpart exists". An existence check lets two +200 rows and one −200 row all answer yes. `transferPairs` decides the pairing one time each month, and it consumes each leg. The two legs must sit on different accounts.

## The page is read on a phone

A UI change is finished only after you look at it at 375 CSS px. There is no separate mobile page, and there must not be one. Use one layout that adapts. Nothing may make the page scroll sideways.

Hover and meta-click are shortcuts. They are never the only route. A phone has neither one. Every number in a tooltip must be readable somewhere else. A gesture behind a modifier key needs a plain control that does the same thing.

Wide content scrolls inside its own box. `DataTable` wraps itself in `overflow-x-auto`. Give the same treatment to anything else that cannot shrink.

## Rows only enter the database by rebuild

`rebuild` empties the table and builds it again from `data/raw/`. There is no incremental path. SB1 gives a transaction a new id every time the code fetches it. It gives another new id when a reservation books. Nothing keyed on `id` is therefore stable across syncs.
