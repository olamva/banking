# banking

Personal spending analysis over my SpareBank 1 accounts and credit card. Pulls
raw transactions to disk once, then does everything else offline.

Private repo, single user, personal use. Not a product, not accepting issues.

## What it does

Three sources go in and one picture comes out:

| Source | Reached by | Gives |
|---|---|---|
| 5 bank accounts | SpareBank 1 API | amount, date, description, the bank's own category |
| 1 credit card | Enable Banking (PSD2) | amount, date — and nothing else |
| Card statement | manual CSV export | the merchant, which no API returns |

The card is invisible to SpareBank 1's own API, so it comes through Enable
Banking, who hold the AISP licence. That gets the transactions but not the
merchant, so the issuer's CSV export fills that in by matching on booking date
and amount.

Everything is then normalised to one record shape, internal transfers and card
bill payments are flagged so they don't double-count, categories are applied,
and the result lands in SQLite. Reports and the dashboard read from there.

```
data/raw/  ──normalize──►  Txn  ──enrich──►  ──exclude──►  ──categorize──►  SQLite
                                (merchant)   (transfers)    (overrides)        │
                                                                 report ◄──────┤
                                                              dashboard ◄──────┘
```

## Setup

Needs Node 24+ (built-in TypeScript execution and `node:sqlite`) and pnpm.

```bash
pnpm install                        # typescript and @types/node, nothing else
```

You also need `.env.local` with the SpareBank 1 and Enable Banking credentials,
and the signing key under `secrets/`. Neither is in git.

## Commands

```bash
# online — the only commands that touch the network
pnpm sb1 login                      # BankID in the browser, refresh token to the keychain
pnpm sb1 accounts                   # writes data/raw/accounts.json + accounts.json
pnpm sb1 sync --month YYYY-MM       # one file per account, skips existing
pnpm sb1 sync --month YYYY-MM --force
pnpm sb1 eb-login                   # Enable Banking consent, 90 days, card only
pnpm sb1 eb-sync --month YYYY-MM    # card transactions

# offline — reads data/raw/ or the database
pnpm sb1 import                     # every month on disk into data/banking.db
pnpm sb1 import --month YYYY-MM     # just the one
pnpm sb1 rebuild                    # drop the database, reconstruct from data/raw/
pnpm sb1 report --month YYYY-MM     # totals, categories, counterparties, card share
pnpm sb1 report --year YYYY         # per-month series and year categories
pnpm sb1 dashboard                  # renders data/dashboard.html

pnpm test                           # node --test, no framework
pnpm typecheck
```

`import` is idempotent per `(source, id)`, so re-running a month is free.
`report` and `dashboard` read the database, so `import` has to have run first.

## Viewing the dashboard

```bash
pnpm sb1 dashboard && open data/dashboard.html
```

It opens as a local file — no server, no build step, no network requests. Month
and year views, filtering by category, source, text and amount range, all
re-computed in the browser.

**Never share it.** It embeds every transaction you have, so the same goes for
screenshots of it. It is gitignored and it stays that way.

## A typical month

```bash
pnpm sb1 sync --month 2026-08 && pnpm sb1 eb-sync --month 2026-08
pnpm sb1 import --month 2026-08
pnpm sb1 report --month 2026-08
```

Card transactions post late and can arrive pending, so run this a few days into
the following month, or re-run with `--force`.

For merchant detail on card rows, export the statement CSV from the issuer and
drop it in `data/raw/card-statements/`, then `pnpm sb1 rebuild`.

## Categories

The bank labels its own transactions and is wrong or unhelpful often enough to
matter. `overrides.json` in the repo root maps a case-insensitive substring to a
category, checked against both the description and the merchant, and wins over
the bank:

```json
{ "Munkegata 34": "bolig" }
```

Keep patterns specific — a bare street name will also catch every shop on that
street.

## Layout

```
src/sb1.ts         SpareBank 1 auth, keychain, get(), monthRange()
src/eb.ts          Enable Banking auth and card transactions
src/types.ts       Txn / Classified / Categorized — the shared contract
src/normalize.ts   data/raw/<month>/*.json -> Txn[]
src/statement.ts   the issuer CSV -> the merchant on card rows
src/exclude.ts     flags internal transfers and card bill payments
src/categorize.ts  bank category + overrides.json
src/db.ts          node:sqlite store, upsert by (source, id)
src/stats.ts       the only money aggregation
src/dashboard.ts   renders the HTML; embeds stats.ts, adds no maths
src/cli.ts         command dispatch
docs/              privacy policy and terms, required to register the
                   Enable Banking application
```

Everything holding personal data is gitignored: `data/`, `accounts.json`,
`overrides.json`, `secrets/`, `.env.local`.

## Design rules

Zero runtime dependencies — Node's stdlib covers the whole job, including
SQLite and TypeScript execution. `data/raw/` is the source of truth and is never
rewritten in place; the database is derived and can be deleted at any time.
Analysis never calls the API. Anything that sums money leaves a test behind.

The rest, including the exclusion rules and why they are what they are, is in
`.claude/CLAUDE.md`.
