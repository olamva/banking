# banking

Personal spending analysis over the SpareBank 1 personal banking API. Pulls raw
transactions to disk once, then analyses them offline.

Private repo, single user, personal use. Not a product.

## Commands

```bash
# online — these are the only commands that touch the network
pnpm sb1 login                      # BankID in the browser, stores refresh token in keychain
pnpm sb1 accounts                   # writes data/raw/accounts.json + accounts.json
pnpm sb1 sync --month YYYY-MM       # writes data/raw/YYYY-MM/<accountKey>.json, skips existing
pnpm sb1 sync --month YYYY-MM --force
pnpm sb1 eb-login                   # Enable Banking consent, 90 days, card only
pnpm sb1 eb-sync --month YYYY-MM    # writes data/raw/YYYY-MM/eb-<uid>.json

# offline — everything below reads data/raw/ or the database
pnpm sb1 import                     # normalize -> exclude -> categorize -> upsert, all months on disk
pnpm sb1 import --month YYYY-MM     # just the one month
pnpm sb1 rebuild                    # drop data/banking.db, reconstruct from data/raw/ alone
pnpm sb1 report --month YYYY-MM     # month totals, categories, counterparties, card share
pnpm sb1 report --year YYYY         # per-month series and year categories
pnpm sb1 dashboard                  # renders data/dashboard.html — local file, never share it

pnpm test                           # node --test, no framework
pnpm typecheck
```

`import` is idempotent per `(source, id)`, so re-running a month is free.
`report` and `dashboard` read the database, so `import` has to have run first.

## Layout

```
src/sb1.ts        SpareBank 1 auth, keychain, get(), monthRange()
src/eb.ts         Enable Banking auth and card transactions
src/types.ts      Txn / Classified / Categorized — the shared contract
src/normalize.ts  data/raw/<month>/*.json -> Txn[]
src/exclude.ts    Txn[] -> Classified[]; flags transfers and bill payments
src/categorize.ts Classified[] -> Categorized[]; bank category + overrides.json
src/db.ts         node:sqlite store, upsert by (source, id)
src/stats.ts      the only money aggregation — monthStats() and yearStats()
src/dashboard.ts  renders data/dashboard.html; embeds stats.ts, adds no maths
src/cli.ts        command dispatch
data/raw/         API responses, verbatim, gitignored
data/dashboard.html  generated, local-only, gitignored
data/banking.db   derived SQLite store, rebuildable from data/raw, gitignored
accounts.json     which accounts are mine (hand-edited), gitignored
overrides.json    description pattern -> category, gitignored
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
| counterparty | `cleanedDescription` | none — null |
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
- Card rows carry no category at all, which is a bigger hole: they are roughly
  40% of monthly spending.

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

Card spending has **no merchant**: `creditor`, `merchant_category_code` and
`bank_transaction_code` are null on every row, and 68 of 76 July rows carry only
`Varekjøp` as remittance information. So card rows are correct in amount and
date but cannot be categorised beyond a single card bucket. The report should
say what share of the month that bucket is, since it is the blind spot.
