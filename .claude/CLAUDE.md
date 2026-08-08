# banking

Personal spending analysis over the SpareBank 1 personal banking API. Pulls raw
transactions to disk once, then analyses them offline.

Private repo, single user, personal use. Not a product.

**The commands are in `README.md`** — that is the one list, keep it the one
list. `pnpm test` and `pnpm typecheck` both have to pass before anything is
finished. What follows is the part a README would not carry: the rules, and the
things the real data does that the code has to survive.

## Layout

```
src/sb1.ts        SpareBank 1 auth, keychain, get(), monthRange()
src/eb.ts         Enable Banking auth and card transactions
src/types.ts      Txn / Classified / Categorized — the shared contract
src/normalize.ts  data/raw/<month>/*.json -> Txn[]
src/statement.ts  issuer CSV -> the merchant on card rows
src/exclude.ts    Txn[] -> Classified[]; flags transfers and bill payments
src/categorize.ts Classified[] -> Categorized[]; bank category + overrides.json
src/db.ts         node:sqlite store, upsert by (source, id)
src/stats.ts      the only money aggregation — monthStats() and yearStats()
src/dashboard.ts  renders data/dashboard.html; embeds stats.ts, adds no maths
src/cli.ts        command dispatch
data/raw/         API responses, verbatim, gitignored
data/raw/card-statements/  issuer CSV exports, the only merchant source
data/dashboard.html  generated, local-only, gitignored
data/banking.db   derived SQLite store, rebuildable from data/raw, gitignored
accounts.json     which accounts are mine (hand-edited), gitignored
overrides.json    description/merchant pattern -> category, gitignored
```

`data/raw/` stays the source of truth: it is the only thing that costs an API
call to reproduce. The database is **derived and disposable** — deleting it must
never lose anything, and `rebuild` must reconstruct it from `data/raw/` alone.

## Rules

**Analysis never calls the API.** `sync` is the only thing that talks to the
bank. Everything downstream reads `data/raw/`. If an analysis command needs a
field that isn't in the raw JSON, extend `sync`, re-run it, and commit nothing.

**Raw is immutable.** Never rewrite a file under `data/raw/` in place. Re-sync
with `--force` if the bank restates a month.

**Dates are Oslo-local.** The API's `date` is epoch millis at *Norwegian*
midnight, so every July timestamp is `22:00Z`. Format with
`Europe/Oslo`, never UTC — UTC shifts every transaction back one day and moves
the 1st of the month into the previous month.

**Nothing personal enters git, or the network.** No account numbers, account
keys, names, balances or descriptions in source, tests, fixtures, commit
messages or docs. `.env.local`, `data/`, `accounts.json` and `overrides.json`
are gitignored; keep it that way. JSON and CSV output are unredacted — strip
account numbers before anything leaves the machine.

The dashboard is a **local file, opened locally**. Never publish it — not as a
hosted artifact, not to a gist, not to any preview or sharing service. It embeds
every transaction you have. Same rule for screenshots of it.

**Zero runtime dependencies.** Node's built-in TS execution, `fetch`,
`node:http`/`node:https`, `node:sqlite` and the macOS `security` keychain cover
the whole job. devDeps are typescript and @types/node only. No ORM, no query
builder, no migration tool, no chart library, no frontend framework — all of
those are a few lines of stdlib or hand-written SVG here. Check with me first if
you think a package is genuinely warranted.

**Money logic leaves a test behind.** Anything that signs, sums, excludes or
categorises gets one `node --test` case in `src/*.test.ts`. No frameworks, no
fixtures built from real transactions.

## Data model

`src/types.ts` defines `Txn`, the canonical record, committed to **booking
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
  Keep both, expect one bit of signal.
- SB1 categories are always exactly one entry at confidence 100. `diverse` +
  `ukategorisert` is ~40% of rows, so `overrides.json` does real work.
- Card rows carry no category at all and are roughly 40% of monthly spending.
  The merchant now arrives from the statement export, so overrides can reach
  them; without one they fall into a single card bucket.

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

The merchant comes from the issuer's own **statement CSV export**, dropped into
`data/raw/card-statements/`. `src/statement.ts` joins it to the card rows on
booking date and amount, which matched all 498 rows of Feb–Jul exactly.

It is a **lookup, not a source**. Card rows still come from Enable Banking,
which has stable ids and is what `rebuild` reconstructs from; the CSV has no
transaction id, so it could never be keyed on. Enrichment writes `counterparty`
and nothing else — in particular it must never rewrite `description`, which the
exclusion rules match on.

Where several rows share a booking date and an amount, which line goes to which
row is arbitrary. That is harmless: they are equal in amount by definition, so
any permutation gives identical per-merchant totals.

Without a statement covering a month, those rows keep `counterparty: null` and
the report says how many and how much, rather than claiming the card bucket is
wholly opaque.

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
