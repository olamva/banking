# banking

Personal spending analysis over my SpareBank 1 accounts and credit card. Pulls
raw transactions to disk once, then does everything else offline.

Private repo, single user, personal use.

```
data/raw/  ──normalize──►  Txn  ──exclude──►  ──categorize──►  SQLite
                                (transfers)    (overrides)        │
                                                  pnpm dev ◄──────┘
```

Six bank accounts and one credit card, all from the SB1 API. Every row is
normalised to one shape, internal transfers and card bill payments are flagged
so they don't double-count, categories are applied, and the result lands in
SQLite for the dashboard to read.

## Setup

Needs Node 24+ (built-in TypeScript execution and `node:sqlite`) and pnpm.

```bash
pnpm install
pnpm dev                            # http://localhost:4000
```

`.env.local` holds the SpareBank 1 credentials, for the online commands only —
`pnpm dev` and everything offline runs without it. It is not in git, and neither
are `data/` or `rules/`, so **a fresh clone or worktree starts empty**:

```bash
pnpm install
pnpm worktree:link                  # symlinks .env.local, data and rules back
pnpm dev --port 4001                # 4000 is the main checkout's
```

## Commands

```bash
# online — the only commands that touch the network
pnpm sb1 login                      # BankID in the browser, refresh token to the keychain
pnpm sb1 accounts                   # writes data/raw/accounts.json + rules/accounts.json
pnpm sb1 sync --month YYYY-MM       # one file per account, skips existing
pnpm sb1 sync --month YYYY-MM --force
pnpm sb1 sync --month YYYY-MM --stale 60  # a force that resumes: keeps files < 60 min old
pnpm sb1 sync --from 2022 --to 2026  # a whole span; either end may be YYYY-MM
pnpm sb1 sync --from 2022            # --to defaults to this month
                                     # a span is ONE request per five years, all accounts at once

# offline
pnpm sb1 rebuild                    # rebuild data/banking.db from data/raw/
pnpm sb1 reconcile                  # does the history explain the balances?
pnpm sb1 budget                     # what SB1 last said was left of its limit

pnpm dev                            # the dashboard on :4000, offline
pnpm test                           # node --test, no framework
pnpm typecheck
```

A typical month:

```bash
pnpm sb1 sync --month 2026-08
pnpm sb1 rebuild
```

Card transactions post late and arrive pending first, so a month is only final a
few days after it ends. Pending rows are dropped rather than counted, so re-run
with `--force` to pick up the tail.

## The dashboard

`pnpm dev` is Vite. The app is `src/web/app/`, and `/api/txns` is a plugin in
`vite.config.ts` that re-reads the database per request — a `rebuild` in another
terminal shows up on reload. Everything is computed in the browser by importing
`src/core/stats.ts` directly, so the page aggregates with the code the tests
pin. There is no build step and no `dist/`.

**Two views over one period.** _Dashboard_ is the tiles and the charts,
_transactions_ is the rows behind them, and one pair of pickers chooses what
both are looking at. Deltas compare against **a year back**, because spending
has a shape over a year that the month before it cannot see: January against
December says only that Christmas happened. A period still running compares
against the same slice a year back, or every delta would read as a collapse
drawn by the calendar.

**The spending chart runs on days.** _Running total_ accumulates from the start
of the window, so the gap between the two lines is the running surplus and where
they cross is the day it went under. _Per day_ and _per month_ plot the buckets
raw; each window offers only the one it can carry. The shading is the only thing
the raw daily view drops — it reads the vertical gap as a surplus, which is true
of a whole window and not of a Tuesday.

**Categories, merchants, accounts and countries each filter as two lists**: a
click includes, meta-click excludes, and an exclusion wins. Click any number of
them; none means all. A bar, a table cell or a menu entry filters to itself.

**Subscriptions are listed per subscription**, not per charge — one line for
what it is, what it costs a month, what it has taken across the window, and when
it last went out. _Per month_ is the **last payment**, not the average: an old
price averaged in says what a subscription has cost, and the question is what it
costs now.

**Never share it.** It embeds every transaction you have, and so does a
screenshot. The server binds to `127.0.0.1`; keep it that way.

### Not tripping the rate limit

**`pnpm dev` never touches the network.** Syncing is a command you run, so no
number of tabs, reloads or restarts costs a request.

SB1's quota is 60 requests an hour per API, published as `x-ratelimit-remaining`
on every response, and it refills _as it goes_ rather than holding each call
against you for a full hour. `data/api-budget.json` keeps the last figure and
its timestamp and derives the rest; `sb1.get` refuses at the bank's zero. With
nothing on disk the 429 is the brake.

`sync --from …` prices the whole span up front and says how far it expects to
get. It stops rather than failing, and re-running is a resume. It is rarely
close to the limit: `accountKey` is repeatable and the date range may be five
years wide, so **a span is one request per five years covering every account** —
the whole record from 2018 is two requests rather than 455.

## Categories

The bank labels its own transactions and is wrong or unhelpful often enough to
matter. The hand-edited rules live in `rules/`, none of them in git.

`rules/overrides.json` maps a case-insensitive substring to a category, checked
against the description, the merchant and the payee's account number, and wins
over the bank:

```json
{ "Munkegata 34": "faste_utgifter/boligutgifter" }
```

A pattern wrapped in slashes is a **regex**, which is how you match a word as a
word: `"/\\bleie\\b/"` catches `Leie Juni` but not `utleie`. Note the doubled
backslash — it is JSON. Keep plain patterns specific: a bare street name catches
every shop on that street.

**Every line has to work wherever it sits.** `categorize` takes the first
pattern that matches, so the file _could_ be made to depend on its own order —
and must not. The fix for two lines competing is to narrow the _pattern_, never
to move it; a refusal lookahead and a requirement lookahead do it without
consuming anything:

```json
{
  "/^(?!.*(?:sit kafe|sit storkiosk))(?=.*\\bsit\\b)/": "faste_utgifter/boligutgifter"
}
```

`pnpm sb1 rebuild` warns about every line that still depends on where it sits,
and prints the narrowed form to paste. Because the order means nothing, the file
is grouped by the category it assigns and can be re-sorted freely.

The other four:

- `rules/giro.json` — what a given person's _lump_ transfers are. Per name,
  because the row type says how the money moved and never why: one lump is rent
  from a flatmate and another is a friend's share of a trip.
- `rules/family.json` — relatives, where **the sign decides what an entry
  means**: money in is `innskudd/familie`, money out is you paying them back. An
  entry may be an account number, for the rows the bank names no payee on.
- `rules/payees.json` — the one name a payee should go by. A landlord who writes
  the month into every payment is eleven payees to anything counting by name.
- `rules/subscriptions.json` — a list of the same patterns, setting
  `isSubscription`. A second axis rather than a category, so YouTube Premium
  stays `medier_og_underholdning` and is still counted as a subscription.

A name **no** pattern claims is not left raw: `src/core/names.ts` takes the
shape off it instead — the card's `, CITY, COUNTRY` tail, a BankAxept street and
city, ALL CAPS — so `YOSHINOYA, TOKYO, JAPAN` reads as `Yoshinoya` with no line
written. It never touches a name a pattern _did_ claim, which would hand back
`Ikea` and `H&m`. The file is for what a payee is called, the cleaner for what
shape it arrived in.

Person-to-person Vipps payments need **no rule at all**. A bare `Vipps*` marker
cannot be matched on its own — Vipps bills merchants too — but on the card the
bank files a peer row as `diverse/overforing` (its reading of `mcc: 4829`), and
on the deposit accounts Vipps doubles its own marker. Both sit above the bank's
category and below every rule above it.

`/overrides` in Claude Code reads the database and suggests patterns worth
adding, where a merchant with real money behind it is landing in
`ukategorisert`. Run `pnpm sb1 rebuild` after accepting a change.

## Layout

```
src/net/       may make requests
src/core/      may not — imported by both Node and the browser
src/web/app/   the React app
src/cli.ts     command dispatch
vite.config.ts pnpm dev: the app plus /api/txns
test/          node --test, mirroring src/
rules/         hand-edited JSON, gitignored
```

React, Vite and Tailwind for the dashboard; Node's stdlib for everything else,
including SQLite, HTTP and TypeScript execution. No ORM, no chart library, no
component library, no state manager — the charts are hand-written SVG.
`data/raw/` is the source of truth and is never rewritten in place; the database
is derived and can be deleted at any time. Analysis never calls the API.
Anything that sums money leaves a test behind.

The rest, including the exclusion rules and why they are what they are, is in
`.claude/CLAUDE.md`.
