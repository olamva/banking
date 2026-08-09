# banking

Personal spending analysis over the SpareBank 1 personal banking API. Pulls raw
transactions to disk once, then analyses them offline.

Private repo, single user, personal use. Not a product.

**The commands are in `README.md`** — that is the one list, keep it the one
list. `pnpm test` and `pnpm typecheck` both have to pass before anything is
finished. What follows is the part a README would not carry: the rules, and the
things the real data does that the code has to survive.

## Layout

`src/` is split by **which half of the rule a file is on**: `net/` is allowed to
make requests, `core/` is not, and `web/` composes the two. That is the layout's
whole job — if a new file's directory is unobvious, ask which side of "analysis
never calls the API" it sits on and the answer follows.

```
src/net/sb1.ts        SpareBank 1 auth, keychain, get(), monthRange()
src/net/eb.ts         Enable Banking auth and card transactions
src/net/sync.ts       the network half — nothing in core/ may import this
src/net/budget.ts     rolling-hour ledger of SB1 requests, persisted to disk

src/core/types.ts     Txn / Classified / Categorized — the shared contract
src/core/normalize.ts data/raw/<month>/*.json -> Txn[]
src/core/statement.ts issuer CSV -> the merchant on card rows
src/core/exclude.ts   Txn[] -> Classified[]; flags transfers and bill payments
src/core/categorize.ts Classified[] -> Categorized[]; bank category + overrides
src/core/db.ts        node:sqlite store, rebuilt wholesale
src/core/stats.ts     the only money aggregation — monthStats() and yearStats()
src/core/select.ts    which rows are in view; no money logic, ever
src/core/pipeline.ts  the offline chain, importable by the CLI and the server

src/web/serve.ts      pnpm dev — /api/txns, Vite middleware, the refresh policy
src/web/app/          the React app: App, FilterBar, Charts, Cards, icons
src/cli.ts            command dispatch

vite.config.ts    root is src/web/app; middleware mode only, there is no build
data/raw/         API responses, verbatim, gitignored
data/raw/card-statements/  issuer CSV exports, the only merchant source
data/banking.db   derived SQLite store, rebuildable from data/raw, gitignored
accounts.json     which accounts are mine (hand-edited), gitignored
overrides.json    substring or /regex/ -> category, gitignored
vipps.json        names of payees, as a list; folded into overrides, gitignored
subscriptions.json  the same patterns, as a list; sets isSubscription, gitignored
```

`data/raw/` stays the source of truth: it is the only thing that costs an API
call to reproduce. The database is **derived and disposable** — deleting it must
never lose anything, and `rebuild` must reconstruct it from `data/raw/` alone.

Everything under `src/core/` is imported by **both** Node and the browser, so it
must stay free of `node:` imports. That is what lets the page aggregate with the
exact code `node --test` pins instead of a copy that drifts.

## Rules

**Analysis never calls the API.** Fetching lives in `src/net/sync.ts` and the
two client modules it wraps; everything downstream reads `data/raw/`. The rule
is the directory split: **nothing in `src/core/` may import from `src/net/`**,
and that includes indirectly. If an analysis step needs a field that isn't in
the raw JSON, extend `sync`, re-run it, and commit nothing.

`pnpm dev --pull` is the one place both halves meet: it may trigger a sync
before rendering. That is the server composing the two, not analysis reaching
for the network, and every guard around it is there to keep the request count
sane — see the header of `src/web/serve.ts` before changing any of it. Without
`--pull` the server never touches the network at all, which is the default.

**Every SB1 request is ledgered.** `sb1.get` and the token exchange both call
`budget.spend`, which refuses past the hourly cap. Anything that adds a new call
path gets this for free; anything that bypasses `sb1.get` does not, so don't.

**Raw is immutable.** Never rewrite a file under `data/raw/` in place. Re-sync
with `--force` if the bank restates a month.

**Dates are Oslo-local.** The API's `date` is epoch millis at *Norwegian*
midnight, so every July timestamp is `22:00Z`. Format with
`Europe/Oslo`, never UTC — UTC shifts every transaction back one day and moves
the 1st of the month into the previous month.

**Nothing personal enters git, or the network.** No account numbers, account
keys, names, balances or descriptions in source, tests, fixtures, commit
messages or docs. `.env.local`, `data/`, `accounts.json`, `overrides.json`,
`vipps.json` and `subscriptions.json` are gitignored; keep it that way. JSON
and CSV output are unredacted — strip account numbers before anything leaves
the machine.

The dashboard is **served on 127.0.0.1 and read locally**. Never publish it —
not as a hosted artifact, not to a gist, not to any preview or sharing service.
It embeds every transaction you have. Same rule for screenshots of it.

**The dependency list is short on purpose.** React, Vite, Tailwind v4 and
Hugeicons are in, for the dashboard and nothing else. Hugeicons is imported one
icon module at a time through `src/web/app/icons.ts` — its barrel export is a
6 MB file and there is no build step to tree-shake it, so never import from
`@hugeicons/core-free-icons` directly. Everything server-side is still stdlib:
Node's built-in TS execution, `fetch`, `node:http`/`node:https`, `node:sqlite`
and the macOS `security` keychain. No ORM, no query builder, no migration tool,
no chart library, no component library, no state manager, no router, no date
library — the charts are hand-written SVG in `src/web/app/Charts.tsx` and the
state is four `useState`s. Check with me first if you think another package is
genuinely warranted.

**There is no build step.** Vite runs in middleware mode inside `src/web/
serve.ts`, so `pnpm dev` is one process on one port, and `dist/` does not exist.
The page is only ever served to localhost, which is what makes that safe. Don't
add `vite build` to make it "production-ready" — there is no production.

**Money logic leaves a test behind.** Anything that signs, sums, excludes or
categorises gets one `node --test` case in `src/*/*.test.ts`. No frameworks, no
fixtures built from real transactions. The React components are deliberately
dumb so this stays possible: logic that deserves a test belongs in `src/core/`,
where Node can reach it without a DOM.

## Data model

`src/core/types.ts` defines `Txn`, the canonical record, committed to **booking
date**. It is shared by every step — read it before writing anything downstream,
and treat widening it as a cross-cutting change to announce, not to slip in.

Two sources normalize into it and they do not agree on much:

| | SB1 (`data/raw/<month>/<accountKey>.json`) | Card (`.../eb-<uid>.json`) |
|---|---|---|
| date | epoch millis at Oslo midnight | `YYYY-MM-DD` string |
| amount | signed number | positive string + `credit_debit_indicator` |
| counterparty | `cleanedDescription` | null until the statement CSV fills it |
| category | the bank's own | none — null |
| pending | never seen | `status: PDNG` happens |

Notes from the real data, not the plan:

- SB1's list endpoint has no counterparty field. Use `cleanedDescription`;
  structured counterparty exists only on `/transactions/{id}/details`, one call
  per transaction, and is not worth it.
- `recurring` and `subscription` have been identical on every SB1 row so far.
  Keep both, expect one bit of signal. The bank sets them only on standing bank
  payments, and a card row can never carry them at all, so anything you pay by
  card is invisible to the flag until `subscriptions.json` names it.
- SB1 categories are always exactly one entry at confidence 100. `diverse` is
  the bank's catch-all and carries no more signal than no category at all, so
  `categorize` collapses it into `ukategorisert`. Together they are ~40% of
  rows, which is why `overrides.json` does real work.
- Card rows carry no category at all and are roughly 40% of monthly spending.
  The merchant now arrives from the statement export, so overrides can reach
  them. Without one, a card row is `reise` if the merchant's trailing ISO
  country is not `NOR`, and `ukategorisert` otherwise — there is no separate
  card bucket. The country rule reads a foreign *biller* as a trip (Apple bills
  from IRL, Fortnite from CHE); an override wins over it, which is where those
  belong anyway.

## Exclusions

Internal transfers are **flagged, never dropped** — the excluded set has to be
auditable. Both sides of a transfer are present because we sync every account,
so match on amount + date + opposite sign, restricted to accounts marked `mine`
in `accounts.json`.

Credit card bill payments are **excluded**, like any internal transfer. The
card's own transactions come from Enable Banking, so counting the bills as well
would double-count. Bill amounts and card spend diverge wildly within a month —
April 2026 paid 35k against 22k of spending — so the bills are worthless as a
spending proxy anyway.

A bill payment has **two legs and both must be excluded**, which the first real
run got wrong in two ways:

- Match the bank leg on `Kredittbanken`, not `Kredittbanken ASA`. The issuer
  also books these as `Kredittbanken - del av SpareBank 1`, and the narrower
  string silently missed one.
- The card leg is the `Innbetalinger` credit on the card account. It cannot ride
  on the amount+date transfer rule, because the card posts the credit 0–3 days
  after the bank debits it, and the card account is not in `accounts.json` at
  all. Excluding only the bank leg leaves the credit counted as **income**.

Card credits that are *not* `Innbetalinger` stay in: `Varekjøp` credits are
merchant refunds and `Rabatt strømmetjenester` is cashback. Both are real.

The check that catches all of this: every excluded reason must net to zero
across the pair. If it doesn't, one leg is being matched and the other isn't.

## The card's merchant

The Enable Banking API returns `creditor`, `merchant_category_code` and
`bank_transaction_code` as null on every card row, and almost every row carries
only `Varekjøp` as remittance information. The API is correct on amount and date
and silent on everything else.

The merchant comes from the issuer's own **statement CSV export**, ingested with
`pnpm sb1 statement <file.csv>` into `data/raw/card-statements/`.
`src/core/statement.ts` joins it to the card rows on booking date and amount, which
matched all 498 rows of Feb–Jul exactly.

There is no API behind this and there will not be — the export is downloaded
from the issuer's portal by hand. The command exists to make the manual step
repeatable: it files the CSV under its own booking-date range, refuses to write
over an existing one, and rebuilds. Exports overlap by design, each covering
everything since the card was opened, so duplicate lines are collapsed on read.

It is a **lookup, not a source**. Card rows still come from Enable Banking,
which has stable ids and is what `rebuild` reconstructs from; the CSV has no
transaction id, so it could never be keyed on. Enrichment writes `counterparty`
and nothing else — in particular it must never rewrite `description`, which the
exclusion rules match on.

Where several rows share a booking date and an amount, which line goes to which
row is arbitrary. That is harmless: they are equal in amount by definition, so
any permutation gives identical per-merchant totals.

Without a statement covering a month, those rows keep `counterparty: null` and
the report says how many and how much, rather than claiming those rows are
wholly opaque. A null counterparty also has no country, so such a row is never
guessed as travel.

## Operational gotchas

**Consent expiry.** The Enable Banking consent runs 90 days from 8 Aug 2026, so
`eb-sync` starts failing around **6 Nov 2026**. `eb-login` renews it. Only the
`CARD` account is linked; the deposit accounts were unlinked deliberately, since
the SB1 API serves those directly.

**Card posting lag.** Card transactions post late and can be `PDNG`, so a July
report run on 1 Aug misses the tail of July. Run a few days into the following
month, or re-run with `--force`.

**Pending card rows have no booking date** and come back in *every* month's
response regardless of the range queried. `normalize` drops them. Anything that
keeps them, or dates them from `transaction_date`, counts the same transaction
once per month synced — that is exactly how a naive read of six months of files
reports 528 card rows instead of 498.

**Re-syncing rewrites the file even when nothing changed**, because
`classificationInput.id` is a fresh UUID per response. Compare row counts and
transaction ids, never file hashes.

**Pagination.** `rowLimit` exists on the SB1 transactions endpoints and we have
never set it. Nothing has come back truncated so far and every response carries
an empty `errors` array, but that is luck, not proof. A suspiciously round row
count is the tell. The Enable Banking side follows `continuation_key` and has a
test.

## Rows only enter the database by rebuild

`rebuild` wipes the table and reconstructs from `data/raw/`. There is no
incremental path, and adding one back needs more thought than it looks.

An upsert keyed on `(source, id)` used to exist and was wrong: **SB1 reissues a
transaction under a new id when a reservation becomes booked**, so re-syncing a
month still in flight left the old id behind as a second row. A rent payment
appeared twice, 18 000 kr counted as 36 000, and re-importing could never clear
it — an upsert has no way to notice a row it did not produce.

Deleting just the affected month would not fix it either: a card row from the
July directory can book into June, so a directory does not own a month. Only a
full reconstruct is safe without tracking which file produced which row.

At a thousand rows this takes a few hundred milliseconds. Revisit when that
stops being true, not before.
