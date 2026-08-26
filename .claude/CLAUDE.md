# banking

Personal spending analysis over the SpareBank 1 personal banking API. The code pulls raw transactions to disk one time. It then analyses them offline. This is a private repo for one user. It is not a product.

**The commands are in `README.md`.** `pnpm test` and `pnpm typecheck` must both pass before you finish any work. The `sb1-api` skill holds the API contract. That contract covers the endpoints, the authentication, the rate limits and the five-year range ceiling. This file does not.

## Language

Write all prose in this repo in ASD-STE100 Simplified Technical English. This covers chat replies, code comments, documentation, commit messages and pull request bodies.

Use short sentences of 20 words or less. Use the active voice. Use one idea for each sentence. Use the present tense. Do not use contractions, slang or metaphors. Keep one meaning for each word. Start each instruction with the verb. Do not change code or identifiers.

Some prose written before 2026-08-19 does not follow this rule. Convert a file when you edit it.

## Comments

Write almost no comments. Keep a comment only when it names a trap that the code cannot show: a unit, a sign, an order, a platform limit, or a fact about the real data. Use 40 words or less.

Delete file-header essays. Delete a comment block on a type, a constant or a function when it only repeats the name. Delete design rationale and history. This file holds the invariants. Keep every `ponytail:` marker.

## Committing

Commit, push and PRs are authorised in this repo. Commit when the work reaches a state worth keeping. Push your own branch. Open the PR against `main` when the work is done. `.claude/settings.json` holds the matching permissions, so none of these actions prompts.

Never commit anything under `rules/` or `data/`. The gitignore keeps them out, and that is the only reason a remote is safe here. The gitignore is the control that separates the transactions from GitHub. Treat an edit to it as an edit to a security control. Never weaken the `data` or `rules` lines. Never run `git add -f` on a path under either one. Push does not permit you to publish anything else. The dashboard rule below still applies. A PR body holds no account numbers, no payee names and no amounts.

**`rules/` is versioned in its own git repo, on this machine only.** It has no remote. Never give it one. It is deliberately **not** a submodule, because a gitlink would put `rules` back on a tracked path here.

**An edit under `rules/` is finished only after you commit it there**, in the same turn. The `git status` of this repo stays clean however much of `overrides.json` you rewrite. An uncommitted rules change is therefore invisible to every later session:

The last paragraph, below the code block, becomes:

```bash
git -C rules add -A && git -C rules commit -m "chore: ..."
```

This commit is required, not only permitted. It is the one commit that the global never-commit rule does not cover. It publishes nothing.

## Working in a worktree

Run `pnpm install`, then run `pnpm worktree:link`. These two commands are the whole provisioning step. The second command makes symlinks to `.env.local`, `data` and `rules` in the main checkout.

**You cannot change `rules/` or `data/` from a worktree.** The symlink does not avoid this rule. The isolation guard resolves the link to the shared path and refuses the write. There is also nothing to isolate, because no commit carries those files. **Make a rules edit in the main checkout.** Do not enter a worktree for a task that only edits rules.

**The Bash guard refuses a compound command inside an isolated session.** This covers heredocs, redirects and `&&` chains. The guard is syntactic. Write the script to `$CLAUDE_JOB_DIR/tmp` and run it in one plain call.

`EnterWorktree` branches from `origin/main`. Check the base before you build on it. A branch that appears to stack on work that is not on `main` shows this error.

**Deploy from the main checkout.** The deploy reads `data/banking.db` and writes `data/dist/`. Both resolve to the shared path, so a worktree cannot do it.

## Deploying

```bash
pnpm sb1 sync --month YYYY-MM   # only when new rows are wanted
pnpm sb1 rebuild
pnpm deploy:web                 # export, build, upload .vercel/output
```

`pnpm deploy:web` is the only command that sends transactions off this machine. Run it from the main checkout. Vercel holds four variables, and the deployment refuses every request while any of them is missing:

| Variable               | What it is                                          |
| ---------------------- | --------------------------------------------------- |
| `GOOGLE_CLIENT_ID`     | the OAuth client of the Google Cloud project        |
| `GOOGLE_CLIENT_SECRET` | its secret                                          |
| `SESSION_SECRET`       | 32 random bytes. It signs the session cookie        |
| `ALLOWED_EMAILS`       | the addresses that may sign in, separated by commas |

Set the authorised redirect URI of the Google client to `https://<domain>/api/auth/callback`. It must match the deployment domain exactly, or Google refuses the sign-in.

Changing `SESSION_SECRET` signs every open session out. That is the way to revoke access at once. Removing an address from `ALLOWED_EMAILS` stops the next sign-in, and it does not end a session that already runs.

## Layout

`src/` is split by the side of the rule that each file is on. `net/` may make requests. `core/` may not. `web/` composes them. Ask which side of "analysis never calls the API" a new file sits on when its directory is not obvious.

```
src/net/sb1.ts        auth, keychain, get(), monthRange()
src/net/sync.ts       the network half. No file in core/ may import this
src/net/budget.ts     the remaining-request count from the bank, cached to disk

src/core/types.ts     Txn / Classified / Categorized. The shared contract
src/core/normalize.ts data/raw/<month>/*.json -> Txn[]
src/core/exclude.ts   Txn[] -> Classified[]. Flags transfers and bill payments
src/core/categorize.ts Classified[] -> Categorized[]. Bank category + overrides
src/core/names.ts     the shape that a channel put on a name, taken off again.
                      It knows no payees. payees.json holds those
src/core/db.ts        node:sqlite store, rebuilt whole
src/core/stats.ts     the only money aggregation
src/core/narrowings.ts which overrides.json lines depend on their position
src/core/reconcile.ts opening + every row == the balance that the bank reports
src/core/select.ts    which rows are in view. No money logic, ever
src/core/pipeline.ts  the offline chain. The CLI and Vite both import it

src/web/app/          the React app: App, FilterBar, Charts, Cards, icons
src/auth/session.ts   the hosted gate: cookie, HMAC session, allowlist, id token.
                      Pure. It makes no request, so node --test pins all of it
src/cli.ts            command dispatch

middleware.ts     the Vercel gate. It runs before every request but the sign-in
api/auth/         login, callback, logout. Edge functions, Vercel only
vite.config.ts    pnpm dev. The app, plus /api/txns. Also the build, to deploy
vercel.json       framework, build command, the /api/txns rewrite, headers
types/            declaration stubs for what a dependency fails to bring
test/             node --test, mirroring src/
data/raw/         API responses, verbatim, gitignored
data/banking.db   derived SQLite store, rebuildable from data/raw, gitignored
data/web/         the exported payload for the hosted build, gitignored
data/dist/        the built site, holding every transaction, gitignored
rules/*.json      hand-edited, gitignored: accounts, overrides, giro, family,
                  payees, subscriptions, categories
```

`data/raw/` is the source of truth. It is the only thing that costs an API call to reproduce. The database is **derived and disposable**.

Both Node and the browser import everything under `src/core/`. That code must have no `node:` imports. This lets the page aggregate with the same code that `node --test` pins.

## Rules

**Analysis never calls the API.** `src/net/` holds the fetching. Every later step reads `data/raw/`. **No file in `src/core/` may import from `src/net/`.** This includes an indirect import. Extend `sync` and run it again when an analysis step needs a field that the raw JSON does not hold.

**The dev server never calls the API.** `/api/txns` lives in `vite.config.ts`. It reads only `data/banking.db`. No page view can cost a request. Run `pnpm sb1 sync` by hand to sync.

**Raw data is immutable.** Never rewrite a file under `data/raw/` in place. Sync again with `--force` when the bank restates a month.

**The code ledgers every SB1 request against the count from the bank.** `sb1.get` and the token exchange call `budget.spend` before the request. They call `sb1.noteLimits` after it. Code that avoids `sb1.get` gets none of this, so always use `sb1.get`. There is no local cap and there must not be one. The quota refills continuously. A rolling window of our own timestamps refuses a request long after the bank permits it.

**Dates are Oslo-local.** The `date` field from the API is epoch milliseconds at Norwegian midnight. Every summer timestamp is therefore `22:00Z`. Format with `Europe/Oslo`. UTC moves the first day of the month into the previous month.

**No personal data enters git.** Do not put account numbers, keys, names, balances or descriptions in source, tests, fixtures, commit messages or documentation. The JSON and CSV output is unredacted.

**One route sends personal data off this machine, and only one.** `pnpm deploy:web` uploads `data/dist/` to Vercel, and that directory holds every transaction. This is deliberate, and it is the reason the sign-in gate exists. No other command may send this data anywhere. Adding a second route needs a decision, not a patch.

**The dashboard has exactly two homes: 127.0.0.1, and the private Vercel deployment behind Google sign-in.** There is no third one. Do not publish it as a hosted artifact, to a gist, or to any preview or sharing service. It holds every transaction you have. The same rule applies to screenshots.

**The Vercel deployment is private, and one gate makes it private.** `middleware.ts` runs before every request that is not a sign-in route. It refuses a request that carries no valid session cookie. The page bundle and `txns.json` are both static files, so the CDN would serve them to anybody without that gate. Treat `middleware.ts` and its `matcher` as a security control. Never narrow the matcher to let a path through. Never add a path that skips it.

**The allowlist is the whole access rule.** `ALLOWED_EMAILS` holds the addresses that may sign in. An empty or missing variable denies everybody, which is the correct failure. Never make a missing variable open the door. A Google account proves only who somebody is. The allowlist decides whether that person may read the money.

**The dependency list is short on purpose.** The dashboard uses React, Vite, Tailwind v4 and Hugeicons. Nothing else uses a dependency. Import Hugeicons one icon module at a time through `src/web/app/icons.ts`. Its barrel export is 6 MB, and no build step removes the unused parts. All server-side code uses the standard library: the built-in TS execution in Node, `fetch`, `node:sqlite` and the macOS `security` keychain. `@vercel/functions` is the one exception, and it supplies `next()` alone. Vercel middleware cannot continue a request without it. Do not add an ORM, a chart library, a component library, a state manager, a router or a date library. Ask first when you think the work needs another package.

**The sign-in uses no auth library.** It is one OAuth code exchange and one HMAC cookie, in `src/auth/session.ts`, on Web Crypto. Do not add Auth.js, Passport or a JWT package. The whole gate is under 200 lines, and `test/auth/session.test.ts` pins every refusal.

**The build step exists only to deploy.** `pnpm dev` runs Vite and serves the app and `/api/txns` from one config. It reads the database live, so a `rebuild` in another terminal appears on reload. Never make local work depend on a build. `vite build` runs only inside `pnpm deploy:web`.

**The hosted `/api/txns` is a file, not a function.** The page reads one payload and aggregates in the browser, so the endpoint takes no parameters and there is no query to run in production. `pnpm sb1 export` writes `data/web/txns.json`, the build copies it, and `vercel.json` rewrites `/api/txns` to it. A Vercel function may return 4.5 MB. The payload passed 6.7 MB in August 2026, so it must never go back to being a function.

**The deploy builds here and uploads the output alone.** `pnpm deploy:web` runs `vercel build` and then `vercel deploy --prebuilt`. Only `.vercel/output` leaves this machine. `data/raw/`, `data/banking.db` and `rules/` never do. Never deploy from git and never let Vercel build the project itself, because a remote build would need the raw data uploaded to reach it.

**Every file that holds transactions sits under `data/`.** This includes `data/web/txns.json` and the whole build output at `data/dist/`. The gitignore already refuses `data`, so no build output can land on a tracked path. Keep `outputDirectory` and `publicDir` inside `data/`. Moving either one out of `data/` puts every transaction one `git add` away from GitHub.

**Money logic leaves a test behind.** Add one `node --test` case in `test/` for any code that signs, sums, excludes or categorises. Use no frameworks. Do not build fixtures from real transactions. The React components are deliberately simple to keep this possible. Put logic that needs a test in `src/core/`.

## Data model

`src/core/types.ts` defines `Txn`. Read it before you write any later step. Announce a change that widens it, because it crosses the whole codebase.

There is one source: `data/raw/<month>/<accountKey>.json`. This includes the credit card.

`Txn.date` — SB1 dates a card row by the **purchase**. The purchase is one to three days before the booking. No list endpoint carries a booking date. Card rows are therefore purchase-dated, and this is deliberate. About twelve rows each month fall on the other side of a month boundary. Deposit rows are booking-dated.

`Txn.account` is **the name of the account**, from `rules/accounts.json`. `stats.ts` runs in the browser, where no rules file is available to look up a name. A key is also a local secret, so it must never appear as a label on the page.

`Txn.country` is **the country of the terminal, where the row carries one**. The card sends `NAME, CITY, COUNTRY`. Three comma segments are the whole parse and the whole guard. Read the country off `cleanedDescription` in `normalize`, **before any rename**. The country is a chip and a filter axis. It is never a money field. The travel guess in `categorize` reads the tail of the name, and it does not use this field.

`normalize` **drops every row with `bookingStatus: PENDING`**, on every account. SB1 gives a reservation a new id when it books, and its amount can still change. A kept reservation makes one purchase into two rows.

Two rules need to know which account is the credit card. Both read `card: true` from `rules/accounts.json`. These rules are `billReason` and the travel guess.

Notes from the real data:

- The SB1 list endpoint has no _merchant_ field. Use `cleanedDescription`. The endpoint also carries `remoteAccountName`, which is the other party as the payer typed it. Use it only as a fallback. It earns its place on the rows that have no `cleanedDescription`.
- `recurring` and `subscription` are identical on every row so far. The bank sets them on standing payments. The bank also guesses them from the merchant, and that guess is wrong as often as right. `rules/subscriptions.json` makes a subscription certain.
- A name alone does **not** mean a peer payment. A flatmate has two relationships at once: small instant payments, and a standing monthly transfer. The description is the bare name in both. `typeText` separates them. An instant or card payment is a peer payment. A giro or a plain `Overførsel` is a lump. The type shows how the money moved. It never shows why. `rules/giro.json` therefore maps the name to the meaning of its lumps.
- One payee can bill two unrelated things under one name. Only `remoteAccountNumber` separates them. This is why that field is on `Txn` and in the override haystack.
- **SB1 sends a subcategory, and it holds the signal.** Every booked row carries `main`, `sub`, `mainI18n`, `subI18n` and a `confidence`. A row does not always carry one entry at confidence 100. A few hundred rows carry two or three candidates, sorted by falling confidence. `normalize` keeps the first candidate.
- **Income and spending split on the sign, not on the category.** No category can move money between the two totals. To take something out of income, exclude it in `exclude.ts`. That is a money change with a netting invariant. It is not a rules edit.
- **A spending category with income in it is expected.** A merchant refund is money in, filed where the money went out. `Income by category` shows this rather than hiding it. Both sides reconcile to the øre.
- **`merchant` is the word on the page. `counterparty` is the word in the data.** The two are deliberately not reconciled.
- **The bars are red for spending and green for income.** One card shows one direction, and its title says which. A reader therefore never needs colour alone to tell the pair apart. That stops being true when both tones share one chart. Pick the colours again at that point.

## Categorising

`categorize` runs its rules in this order. The order is part of the design.

1. **excluded** -> `overfoering`, above every other rule. `reason` says why a row is out, so the category adds nothing.
2. `rules/overrides.json` — pattern -> `category/sub`.
3. `rules/giro.json`. This rule applies only when the row is a lump.
4. `rules/family.json`. It sits below the lump rule, so pocket money keeps the better label. It sits above the Vipps rules, which would call every gift a peer payment.
5. The two Vipps peer shapes. They sit above the bank's own category. A row that keeps `diverse/overforing` reads a peer payment as a transfer.
6. The bank's own pair.
7. The travel guess, on card rows only.

**Every line in `rules/overrides.json` works in any position.** `categorize` takes the first pattern that matches, so the file _can_ act as a sequence. It must not. Two lines that claim the same row under different categories make the order load-bearing and invisible. **You may sort, group or reorder the file freely, and every row must land where it landed before.**

Fix a collision in the _pattern_. Do not fix it in the matcher or in the order. `rebuild` prints every offending pair and the narrowed form of the loser. One example is `/^(?!.*(?:sit kafe))(?=.*\bsit\b)/`. It holds a refusal lookahead and a requirement lookahead. Neither one consumes any characters. A collision where both lines name the same category is harmless. Leave it alone.

**A name is either known or only shaped. The two never mix.** `rules/payees.json` carries knowledge: NSB is Vy, and two spellings are one bookshop. `src/core/names.ts` carries the opposite. It carries the formatting that SB1 puts on every name, which is mechanical. It runs only on names that no rule claimed. Use the name from a rule exactly as written. The cleaner would return `IKEA` as `Ikea`. A rename can never move money. That property makes the file safe to edit.

**`rules/family.json` names relatives. The sign decides what the entry means. The sign does not decide whether the entry applies.** Money in is `innskudd/familie`. Money out to the same person is a repayment to a relative, so it is `diverse/vennebetaling`. The category enforces this. `innskudd` is the income main of the bank, so an outgoing row filed there is a contradiction. An entry may be an account number as well as a name. Use a number for the plain `Overføring` rows where the bank names no payee. **The test is whether the counterparty is family. The test is never the shape of the entry.**

**Every rule names both levels.** A rule that names one level takes no subcategory. It reaches the page as that category with `Annet` below it. The bank never sends a bare main, so this shape is ours alone. Narrow the pattern until each reading says one thing, where two readings share a payee.

`src/core/labels.ts` names the slugs. It uses three sources in this order: `rules/categories.json`, then the `mainI18n` and `subI18n` fields off the rows, then the tidied slug. It looks up mains and subs in **separate maps**. One slug can be both, with a different meaning in each.

A category with exactly one _named_ subcategory reads as that subcategory. A single _unnamed_ child is not a better name, so the category keeps the parent name.

## The page's two-level categories

**`Filters.categories` holds both levels in one list.** A bare `dagligvarer` sits beside a pair `dagligvarer/andre_dagligvarer`. A row matches when the list holds either one. Two axes would AND. That asks for rows that are both at once, and it draws an empty page. A tree with checkboxes means a union, and one list gives a union at no cost.

A pair is always `category/sub`. It is never a bare sub. `dagligvarer` is a sub below itself, and `kollektivtransport` sits below two mains.

**Every axis is two lists. It is not one list and a mode.** `categories` sits beside `categoriesOut`, and `AXES` pairs them. A mode made the two readings exclusive. A reader could not say "only `innskudd`" and "not `innskudd/familie`" at the same time. The exception to a filter lives on the axis of that filter. The order is fixed. **An exclusion wins.** An empty include list still means every row.

**The modifier decides which list a tick joins.** A plain tick includes. A ⌘/ctrl-click excludes. This is the same gesture that the charts and the table use. Both lists tick the same checkboxes, and an excluded option is red. **Unticking always clears.** A ticked box is a filter that is on. The code still reads the old `_mode=exclude` spelling out of a URL, and it moves that value to the `_not` side.

**The country axis needs no fourth kind of control.** Most rows have no country, so an empty list cannot mean "everywhere". `NO_COUNTRY` is a real value in the list. Without it, "only the domestic rows" would mean "only the card rows".

**`diverse` is the largest main of the bank, and the code keeps it**, with all its subcategories. It reads as a catch-all, and it is not one at the pair level. Its pairs are `vennebetaling`, `overforing`, `renter_og_gebyrer`, `minibank` and `skatt`. `BANK_CATCH_ALL` holds `ukategorisert` alone. `OURS` renames exactly one main, `faste_boutgifter`, because that main is not only housing.

## Exclusions

The code **flags an internal transfer. It never drops one.** The excluded set must stay auditable. Both sides are present because the code syncs every account. Match on amount, date and opposite sign. Restrict the match to accounts marked `mine`.

**Amount, date and opposite sign are not enough alone.** They are a weak signal at these volumes. 22 kr of deposit interest matches a 22 kr coffee exactly. Every such collision removes real money from the totals. **The bank must also type both legs as a transfer.** Match `Txn.typeText` on the stem `overfør`. Check both legs. Never check one.

**Pairing is one to one. That is not the same as "a counterpart exists".** An existence check lets two +200 rows and one −200 row all answer yes. `transferPairs` decides the pairing one time each month, and it consumes each leg. The two legs must sit on different accounts.

**A row that names one of my own accounts skips all of that.** Match `remoteAccountNumber` against the `number` field in `rules/accounts.json`. That match is proof, not coincidence. It needs no transfer type and no counterpart search. It stays symmetric, because each leg carries the number of the other. It is the only rule that finds a self-transfer that the bank did not type as one.

**A number on a row is not always a counterparty.** Nothing moves between an account and itself, so the number of the row itself never counts. **A cash deposit is never a transfer.** The machine stamps `remoteAccountNumber` with the account that the card belonged to. There is no second leg, because the money came from a pocket.

The code **excludes a credit card bill payment**, like any internal transfer. A bill has **two legs, and both must go**. Match the bank leg on the collection account number of the issuer, named by `issuer: true`. Use the name as a fallback. Use `Kredittbanken`, not `Kredittbanken ASA`, because the issuer also books these as `Kredittbanken - del av SpareBank 1`. The card leg is the `Innbetaling` credit. It cannot use the amount and date rule. The card is not `mine`, and the credit posts 0 to 3 days later. Keep a card credit that is _not_ a payment. A merchant refund and cashback are both real. The two legs land in different months about one time each quarter. The reason therefore nets to zero **across the record, not within every month**.

The code **excludes a fund purchase and a fund sale as `investment movement`**, in both directions. `investment: true` names the account. That reason is **one-sided by design, and it is exempt from the netting check**. The fund manager books the counter-leg, and `data/raw/` does not hold it.

An entry may carry `sync: false`. That means the entry exists for its _number_ alone. An entry may carry `from`, the `YYYY-MM` when the account first saw activity. `accountKeys` skips every month below it. An entry may carry `opening`, the kroner in the account before the first row on record. SB1 serves no history before 2003, so an older account arrives with a balance already. `opening` is a **balance. No money total may read it.** Only `reconcile` reads it.

**A floor makes itself unfalsifiable.** A `from` value stops every sweep from asking below it. No empty files exist to prove it right. To test one, remove it and sweep again.

**`pnpm sb1 reconcile` is the one check that looks outside the repo.** It compares the opening balance plus every row against the balance that the bank reports. It runs per account, and it runs offline. Every other check here shows the raw data agreeing with itself. A rule that quietly drops rows agrees with itself perfectly. `reconcile` takes `Txn` **before any flag is set, and it counts excluded rows**. Money moved whether or not it counts as earning or spending. Try these causes for a gap, in this order: the balances are stale, rows are missing, or an `opening` value is missing.

**Every excluded reason must net to zero across its pair.** `investment movement` is the one exception. That check runs at every `rebuild`. `netByReason` sums the excluded rows by reason, and it warns on any non-zero result. The two card-bill legs fold into one bucket first, because they are one pair with two names.

## The page is read on a phone

`pnpm dev` binds to 127.0.0.1. The machine that serves the page is on the same wifi as the phone in your hand. **The narrow window is therefore a supported width.** A UI change is finished only after you look at it at **375 CSS px**.

There is no separate mobile page, and there must not be one. Use one layout that adapts. Two layouts mean two of everything to keep in step.

**Nothing may make the page scroll sideways.** That is the single test that the rest of this section serves. Two things caused it here. Both are the same error: _a width that someone wrote down instead of measuring._

- **A minimum on a grid track is a floor. A floor wider than the phone is the bug.** Always write `minmax(min(460px, 100%), 1fr)`. `test/web/app/layout.test.ts` refuses the bare form anywhere in `src/web/app/`.
- **An absolutely-positioned panel anchors where its trigger wrapped to.** Add `max-sm:w-full` to the `details`. Do not make the panel narrower. A narrower panel only moves the width at which it breaks.

**Charts measure. They never assume.** `useWidth` is a `ResizeObserver`. Every chart reads its box through it, draws into a `viewBox`, and computes its label stride against `clusterW`. A hardcoded chart width repeats the rule above. A label gutter in fixed pixels is the same error.

**Every field that can take focus is 16px below `sm`.** iOS Safari zooms in on a control with smaller text, and it does not zoom out again. One unlayered media query in `index.css` covers every input and select at once. Keep it _outside_ `@layer`, or `text-sm` on the element wins. Do not use `maximum-scale=1`. That removes pinch-zoom from every user.

**Hover and meta-click are shortcuts. They are never the only route.** A phone has neither one. Every number in a tooltip must be readable somewhere else. A gesture behind a modifier key needs a plain control that does the same thing.

**Excluding is the standing exception, and it is deliberate.** Meta-click and meta-Enter are the only way to _add_ a value to an exclusion list. An exclusion still shows on the page and in the filter summary. A plain tap clears one. A phone can therefore read and undo an exclusion. It can only not create one. Make a plain tap cycle through off, only and except when that becomes a problem. That twin costs nothing.

**A tap is a `pointerdown` and a `pointerup` with no `pointermove` between them.** A chart bound only to `onPointerMove` therefore gives no reading on a phone. The plot catches `onPointerDown` for that reason. The opposite error also exists. Do not put `touch-action: none` on a plot, or the chart consumes the page scroll.

**Touch targets are the one thing that density does not win against.** Widen the hit area with a `before:absolute before:-inset-2` pseudo-element. Do not resize the control. The columns then stay aligned.

**Wide content scrolls inside its own box.** `DataTable` wraps itself in `overflow-x-auto`. Give the same treatment to anything else that cannot shrink.

## Rows only enter the database by rebuild

`rebuild` empties the table and builds it again from `data/raw/`. There is no incremental path. Adding one back needs more thought than it appears to need. **SB1 gives a transaction a new id every time the code fetches it.** It gives another new id when a reservation books. Nothing keyed on `id` is therefore stable across syncs. An upsert cannot detect a row that it did not produce.

Deleting only the affected month does not fix this either. A directory that owns its month is a property of the current endpoints. It is not an invariant.

At a few thousand rows this takes a few hundred milliseconds. Revisit it when that stops being true, and not before.
