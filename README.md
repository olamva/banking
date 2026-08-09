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
                                                               pnpm dev ◄──────┘
```

## Setup

Needs Node 24+ (built-in TypeScript execution and `node:sqlite`) and pnpm.

```bash
pnpm install
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
pnpm sb1 rebuild                    # rebuild data/banking.db from data/raw/
pnpm sb1 report --month YYYY-MM     # totals, categories, counterparties, card share
pnpm sb1 report --year YYYY         # per-month series and year categories

# the living app
pnpm dev                            # serve the dashboard on :4000, offline
pnpm dev --pull                     # ...and refresh stale months from the API
pnpm sb1 budget                     # SB1 requests used this hour

pnpm test                           # node --test, no framework
pnpm typecheck
```

`rebuild` reconstructs the whole database from `data/raw/` — a few hundred
milliseconds, and the only way rows get in. `report` and `pnpm dev` read the
database, so it has to have run first.

## The dashboard

```bash
pnpm dev          # then open http://localhost:4000
```

A React app served by Vite in middleware mode inside the same process, so one
command gives you the page on one port with hot reload and no build step. The
server exposes exactly one endpoint, `/api/txns`, which re-reads the database
per request — a `rebuild` in another terminal shows up on reload. Everything is
computed in the browser by importing `src/core/stats.ts` directly.

**Two views over one period.** *Dashboard* is the tiles and the charts,
*transactions* is the rows behind them, and one pair of pickers chooses what
both are looking at: a year, then a month inside it or the whole of it. All time
sits above the years and drops the month picker, having no year to be inside.
Month and year were never two layouts — the same tiles over two window lengths —
so what the dashboard shows follows the window. Deltas compare against the
window before, the previous month or the previous year, and disappear for all
time, which has nothing before it; the month-by-month chart and the "per month"
averages appear once the window spans more than one month.

The window still running compares against **the same slice** of the one before —
nine days of August against nine days of July, not against the whole of it, or
every delta on the page would read as a collapse drawn by the calendar. Finished
windows still compare whole, and the tile says which it did.

**Subscriptions are listed per subscription**, not per charge: one line for what
it is, what it costs a month, what it has taken across the window, how many
times, and when it last went out. Sortable, searchable and windowed, like the
transactions table.

*Per month* is the **last payment**, not the average — an old price averaged in
says what a subscription has cost, and the question here is what it costs now.
A yearly bill therefore reads as its yearly amount, since nothing on a row says
how often it recurs.

Categories filter as **chips: click any number of them**, none means all. Pick
exactly one and the category breakdown drops out — a bar chart of a single
category is a bar chart of itself. Meta-click a bar to exclude it instead.

**Never share it.** It embeds every transaction you have, and so does a
screenshot. The server binds to `127.0.0.1`; keep it that way.

### Auto-refresh, and not tripping the rate limit

`pnpm dev` is offline by default. With `--pull`, loading the page re-syncs the
current month first if the data is more than six hours old — plus the previous
month during its first week, while card transactions are still posting.

SpareBank 1 allows **60 requests an hour** and one refresh costs one per
account, so the obvious ways to burn that are all defended:

| Risk | Defence |
|---|---|
| Restarting the server | staleness is recorded on disk, not in memory |
| Two tabs, or a reload during a pull | one refresh at a time; the others join it |
| Anything at all | every call is ledgered; `sb1.get` refuses past the cap |
| A dead token retrying forever | a failed attempt still counts as an attempt |
| Just wanting to look at the data | the network is opt-in; no `--pull`, no calls |

The cap is 40, leaving headroom so a hand-run `sync` still works afterwards.
Raise it with `SB1_HOURLY_CAP` if you really mean to. `pnpm sb1 budget` shows
where you are.

```bash
pnpm dev                      # never touches the network
pnpm dev --pull               # refresh if older than six hours
pnpm dev --pull --max-age 60  # refresh if older than an hour
pnpm dev --port 5000
```

## A typical month

Mostly, nothing: leave `pnpm dev --pull` running and it keeps the current month
current. By hand, if you want a report in the terminal:

```bash
pnpm sb1 sync --month 2026-08 && pnpm sb1 eb-sync --month 2026-08
pnpm sb1 rebuild
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
{
  "Munkegata 34": "husleie",
  "/\\bleie\\b/": "husleie"
}
```

A pattern wrapped in slashes is a **regex**, which is how you match a word as a
word: `\bleie\b` catches `Leie Juni & Juli` but not `utleie` or `leiebil`. Note
the doubled backslash — it is JSON.

Keep plain patterns specific. A bare street name catches every shop on that
street, which is how `Munkegata` first swallowed a supermarket.

A card row that no pattern matches falls to `reise` when the merchant's trailing
ISO country is not `NOR`, and to `ukategorisert` when it is. The bank's own
catch-alls — `diverse`, and `ukategorisert` spelled out on the row — collapse
into `ukategorisert` too, so there is one opaque bucket, not three.

An **excluded** row with nothing else to go on lands in `overfoering` rather
than that bucket: both legs of a transfer and both legs of a card bill are a
transfer, and the toggle that lists them is the only place they are ever seen.
No sum can see it — `stats.ts` skips excluded rows before it adds anything up.

`vipps.json` is a list of names, in the same pattern language, and every one of
them means the `vipps` category:

```json
["ola nordmann", "kari nordmann"]
```

Person-to-person payments are the one category with a name per payee rather than
a pattern per merchant, so they outgrew `overrides.json` and got their own file.
It is folded into the overrides on load, after them, so an explicit entry in
`overrides.json` still wins a collision.

`subscriptions.json` is a list of the same patterns, and it is a second axis
rather than a category:

```json
["telenor", "youtubepremium", "claude"]
```

A match sets `isSubscription`, so YouTube Premium stays
`medier_og_underholdning` and is still counted as a subscription. SB1 sets the
flag itself on standing bank payments, and a pattern only ever adds to it. Card
rows need a pattern to be seen at all, because Enable Banking has no such field.

`/overrides` in Claude Code reads the database and `overrides.json` and suggests
patterns worth adding — only where a merchant with real money behind it is
landing in `ukategorisert`. It sends merchant
names to the model, which is the one place this repo talks to the network on
purpose. Run `pnpm sb1 rebuild` after accepting a change.

## Layout

`src/` is split by which half of the one rule a file is on — `net/` may make
requests, `core/` may not, `web/` composes them.

```
src/net/sb1.ts       SpareBank 1 auth, keychain, get(), monthRange()
src/net/eb.ts        Enable Banking auth and card transactions
src/net/sync.ts      the network half: SB1 and card fetching
src/net/budget.ts    rolling-hour ledger of SB1 requests

src/core/types.ts     Txn / Classified / Categorized — the shared contract
src/core/normalize.ts data/raw/<month>/*.json -> Txn[]
src/core/statement.ts the issuer CSV -> the merchant on card rows
src/core/exclude.ts   flags internal transfers and card bill payments
src/core/categorize.ts bank category + overrides, peers and subscriptions
src/core/db.ts        node:sqlite store, rebuilt wholesale
src/core/stats.ts     the only money aggregation
src/core/select.ts    which rows are in view — filters, months, categories
src/core/pipeline.ts  the offline chain; imports nothing that touches a network

src/web/serve.ts     pnpm dev: /api/txns, Vite middleware, when to auto-refresh
src/web/app/         the React app — App, FilterBar, Charts, Cards
src/cli.ts           command dispatch

docs/              privacy policy and terms, required to register the
                   Enable Banking application — also published as a gist,
                   see docs/README.md before editing either
```

`src/core/` runs in both Node and the browser, so the page aggregates with the
exact code `node --test` pins.

Everything holding personal data is gitignored: `data/`, `accounts.json`,
`overrides.json`, `vipps.json`, `subscriptions.json`, `secrets/`,
`.env.local`.

## Design rules

React, Vite and Tailwind v4 for the dashboard; Node's stdlib for everything else,
including SQLite, HTTP and TypeScript execution. No ORM, no chart library, no
component library, no state manager — the charts are hand-written SVG and the
state is four `useState`s. There is no build step: Vite runs in middleware mode
inside the server, so `pnpm dev` is one process on one port and `dist/` does not
exist. `data/raw/` is the source of truth and is never rewritten in place; the
database is derived and can be deleted at any time. Analysis never calls the
API. Anything that sums money leaves a test behind.

The rest, including the exclusion rules and why they are what they are, is in
`.claude/CLAUDE.md`.
