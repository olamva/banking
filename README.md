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
pnpm dev                            # http://localhost:4000
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
pnpm sb1 statement <file.csv>       # ingest a card statement export, then rebuild
pnpm sb1 import                     # every month on disk into data/banking.db
pnpm sb1 import --month YYYY-MM     # just the one
pnpm sb1 rebuild                    # drop the database, reconstruct from data/raw/
pnpm sb1 report --month YYYY-MM     # totals, categories, counterparties, card share
pnpm sb1 report --year YYYY         # per-month series and year categories
pnpm sb1 dashboard                  # renders data/dashboard.html, a static snapshot

# the living app
pnpm dev                            # serve on :4000, auto-refreshing stale data
pnpm sb1 budget                     # SB1 requests used this hour

pnpm test                           # node --test, no framework
pnpm typecheck
```

`import` is idempotent per `(source, id)`, so re-running a month is free.
`report` and `dashboard` read the database, so `import` has to have run first.

## The dashboard

```bash
pnpm dev          # then open http://localhost:4000
```

Every request re-reads the database and re-renders, so an `import` in another
terminal shows up on reload. Month and year views, filtering by category,
source, text and amount range, all re-computed in the browser.

There is still a static form if you want a file rather than a server:

```bash
pnpm sb1 dashboard && open data/dashboard.html
```

**Never share either one.** They embed every transaction you have, and so does a
screenshot. The server binds to `127.0.0.1` and the file is gitignored; keep it
that way.

### Auto-refresh, and not tripping the rate limit

If the data is more than six hours old, loading the page re-syncs the current
month first — plus the previous month during its first week, while card
transactions are still posting.

SpareBank 1 allows **60 requests an hour** and one refresh costs one per
account, so the obvious ways to burn that are all defended:

| Risk | Defence |
|---|---|
| `--watch` restarting on every save | staleness is recorded on disk, not in memory |
| Two tabs, or a reload during a pull | one refresh at a time; the others join it |
| Anything at all | every call is ledgered; `sb1.get` refuses past the cap |
| A dead token retrying forever | a failed attempt still counts as an attempt |
| Editing the page offline | `--no-pull` |

The cap is 40, leaving headroom so a hand-run `sync` still works afterwards.
Raise it with `SB1_HOURLY_CAP` if you really mean to. `pnpm sb1 budget` shows
where you are.

```bash
pnpm dev --no-pull            # never touch the network
pnpm dev --max-age 60         # refresh if older than an hour
pnpm dev --port 5000
```

## A typical month

Mostly, nothing: leave `pnpm dev` running and it keeps the current month
current. By hand, if you want a report in the terminal:

```bash
pnpm sb1 sync --month 2026-08 && pnpm sb1 eb-sync --month 2026-08
pnpm sb1 import --month 2026-08
pnpm sb1 report --month 2026-08
```

Card transactions post late and can arrive pending, so a month is only really
final a few days after it ends. Re-run with `--force` to pick up the tail.

## Card merchants

Card rows arrive from the API with an amount and a date and nothing else. The
merchant only exists in the statement CSV you download from the issuer's portal
— there is no API for it, so this step stays manual:

```bash
pnpm sb1 statement ~/Downloads/transactions.csv
```

That files the export under its own booking-date range in
`data/raw/card-statements/` and rebuilds the database. Re-running with an export
you have already ingested is a no-op, and it will refuse to write over an
existing file, because `data/raw/` is immutable.

Each export covers everything since the card was opened, so they overlap; the
duplicate lines are collapsed on read. Just ingest the newest one — the older
files can stay where they are.

Any month not covered by an export keeps `counterparty: null` on its card rows,
and `report` says how many and how much rather than pretending otherwise.

## Categories

The bank labels its own transactions and is wrong or unhelpful often enough to
matter. `overrides.json` in the repo root maps a case-insensitive substring to a
category, checked against both the description and the merchant, and wins over
the bank:

```json
{ "Munkegata 34": "faste_boutgifter" }
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
src/pipeline.ts    the offline chain; imports nothing that touches a network
src/sync.ts        the network half: SB1 and card fetching
src/budget.ts      rolling-hour ledger of SB1 requests
src/serve.ts       pnpm dev: the living page, and when to auto-refresh
src/cli.ts         command dispatch
docs/              privacy policy and terms, required to register the
                   Enable Banking application — also published as a gist,
                   see docs/README.md before editing either
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
