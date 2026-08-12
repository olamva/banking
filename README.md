# banking

Personal spending analysis over my SpareBank 1 accounts and credit card. Pulls
raw transactions to disk once, then does everything else offline.

Private repo, single user, personal use. Not a product, not accepting issues.

## What it does

One source goes in and one picture comes out:

| Account | Gives |
|---|---|
| 6 bank accounts | amount, date, description, the bank's own category |
| 1 credit card | the same, plus the merchant's MCC and the original currency |

All of it comes from the SpareBank 1 API. The card used to need Enable Banking
and a manual statement export for the merchant; `GET /accounts` turned out to
hide it behind an `includeCreditCardAccounts` flag that defaults to false, and
the ordinary transactions endpoint answers for it with more on every row than
Enable Banking ever returned. The one thing lost is the booking date: SB1 dates
a card row by the purchase, one to three days earlier. See `Txn.date`.

Everything is normalised to one record shape, internal transfers and card bill
payments are flagged so they don't double-count, categories are applied, and the
result lands in SQLite. Every row carries the name of the account it is on, from
`rules/accounts.json`, which is what the dashboard splits spending by. The
dashboard reads from there.

```
data/raw/  ──normalize──►  Txn  ──exclude──►  ──categorize──►  SQLite
                                (transfers)    (overrides)        │
                                                  pnpm dev ◄──────┘
```

## Setup

Needs Node 24+ (built-in TypeScript execution and `node:sqlite`) and pnpm.

```bash
pnpm install
pnpm dev                            # http://localhost:4000
```

You also need `.env.local` with the SpareBank 1 credentials. It is not in git.

## Commands

```bash
# online — the only commands that touch the network
pnpm sb1 login                      # BankID in the browser, refresh token to the keychain
pnpm sb1 accounts                   # writes data/raw/accounts.json + rules/accounts.json
pnpm sb1 sync --month YYYY-MM       # one file per account, skips existing
pnpm sb1 sync --month YYYY-MM --force
pnpm sb1 sync --month YYYY-MM --stale 60  # a force that resumes: keeps files < 60 min old
pnpm sb1 sync --from 2022 --to 2026  # a whole span; either end may be YYYY-MM

# offline — reads data/raw/ or the database
pnpm sb1 rebuild                    # rebuild data/banking.db from data/raw/
pnpm sb1 peers | pbcopy             # clipboard rows -> the names rules/vipps.json lacks
pnpm sb1 merchants                  # one shop under many names -> lines for rules/payees.json

# the living app
pnpm dev                            # serve the dashboard on :4000, offline
pnpm dev --pull                     # ...and refresh stale months from the API
pnpm sb1 budget                     # what SB1 last said was left of its limit

pnpm test                           # node --test, no framework
pnpm typecheck
```

`rebuild` reconstructs the whole database from `data/raw/` — a few hundred
milliseconds, and the only way rows get in. `pnpm dev` reads the database, so it
has to have run first.

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
so what the dashboard shows follows the window. Deltas compare against **a year
back** — this February against last February, this year against last year —
because spending has a shape over a year that the month before it cannot see:
January against December says only that Christmas happened, while January
against last January says something. They disappear when there is nothing to
compare against: all time has nothing before it, and neither does the first
period in the archive. The "per month" averages appear once the window spans
more than one month.

**The spending chart runs on days.** *Running total* accumulates from the start
of the window, so the two lines climb to the window's own totals and the gap
between them is the running surplus — where they cross is the day it went under.
Accumulated the line is monotonic, which is what lets a point per day stay
readable across a whole year. *Per day* plots the days raw, for "what happened
on the 14th"; *per month* plots the months. Each window offers the raw bucket it
can carry and no other — a month has no months in it to plot, and a year has 365
days to fit across a thousand pixels — so a month offers per day, a year offers
per month, and all time offers only that.

The shading between the lines is the only thing the raw daily view drops. It
reads the vertical gap as a surplus, and that is only true of a whole window:
income lands on about a third of days, so day by day it would call almost every
one of them an overspend. Both lines are still drawn.

The window still running compares against **the same slice** a year back — nine
days of August against the first nine days of last August, not against the whole
month, or every delta on the page would read as a collapse drawn by the
calendar. Finished windows compare whole, and the tile says which it did.

**Spending splits by account too**, not only by category — one bar per account,
named by `rules/accounts.json`. The card is just another account there; it is
only a bar of its own because a credit card is where a third of the money goes.
The card once had a meter to itself, back when its rows arrived with no merchant
and no category and the number was really a measure of how much was unreadable.

**Subscriptions are listed per subscription**, not per charge: one line for what
it is, what it costs a month, what it has taken across the window, how many
times, and when it last went out. Sortable, searchable and windowed, like the
transactions table.

*Per month* is the **last payment**, not the average — an old price averaged in
says what a subscription has cost, and the question here is what it costs now.
A yearly bill therefore reads as its yearly amount, since nothing on a row says
how often it recurs.

Categories, merchants and accounts each filter as **chips: click any number of
them**, none means all — one control repeated three times, and the same gesture
everywhere. A bar, a table cell or a menu entry filters to itself; meta-click
excludes it instead, and accumulates. Pick exactly one category and the category
breakdown drops out — a bar chart of a single category is a bar chart of itself.

**Never share it.** It embeds every transaction you have, and so does a
screenshot. The server binds to `127.0.0.1`; keep it that way.

### Auto-refresh, and not tripping the rate limit

`pnpm dev` is offline by default. With `--pull`, loading the page re-syncs the
current month first if the data is more than six hours old — plus the previous
month during its first week, while card transactions are still posting.

One refresh costs one request per account, so the obvious ways to burn through
the bank's limit are all defended:

| Risk | Defence |
|---|---|
| Restarting the server | staleness is recorded on disk, not in memory |
| Two tabs, or a reload during a pull | one refresh at a time; the others join it |
| Anything at all | every call is ledgered; `sb1.get` refuses at the bank's zero |
| A dead token retrying forever | a failed attempt still counts as an attempt |
| Just wanting to look at the data | the network is opt-in; no `--pull`, no calls |

**The budget is the bank's, and there is no local cap.** SB1's quota is 60
requests an hour per API — stated in its FAQ, not the reference — published as
`x-ratelimit-remaining` on every response, with a 429 at zero. Crucially it
refills *as it goes*, roughly a request a minute, rather than holding each call
against you for a full 60 minutes the way "hourly limit" sounds.

So `data/api-budget.json` keeps the last figure and its timestamp, and derives
the rest: `spend` counts down for calls still in flight, the next response
overwrites the estimate with fact, and elapsed time credits back at 1/minute up
to 60. A `SB1_HOURLY_CAP` over a rolling hour of our own timestamps used to sit
in front of all this and refused long after the bank would have said yes.

Nothing expires, which is the point — a 0 seen an hour ago is a full bucket now,
and a 429 clears itself at one probe a minute. The one gap is the first call
ever: with no figure on disk, the 429 is the brake. `pnpm sb1 budget` prints
what SB1 last said, or tells you it has not said recently.

`sync --from … --to …` prices the whole span up front against that figure and
says how far it expects to get. It stops rather than failing, and re-running is
a resume: a month already on disk costs nothing without `--force`. It can also
outlast its own estimate, since the bucket refills while the sweep runs.

```bash
pnpm dev                      # never touches the network
pnpm dev --pull               # refresh if older than six hours
pnpm dev --pull --max-age 60  # refresh if older than an hour
pnpm dev --port 5000
```

## A typical month

Mostly, nothing: leave `pnpm dev --pull` running and it keeps the current month
current. By hand:

```bash
pnpm sb1 sync --month 2026-08
pnpm sb1 rebuild
```

Card transactions post late and arrive pending first, so a month is only really
final a few days after it ends. Pending rows are dropped rather than counted —
the bank reissues them under a new id once they book — so re-run with `--force`
to pick up the tail.

## Categories

The bank labels its own transactions and is wrong or unhelpful often enough to
matter. The hand-edited rules all live in `rules/`, none of them in git.
`rules/overrides.json` maps a case-insensitive substring to a category, checked
against both the description and the merchant, and wins over the bank:

```json
{
  "Munkegata 34": "husleie",
  "/\\bleie\\b/": "husleie"
}
```

A pattern wrapped in slashes is a **regex**, which is how you match a word as a
word: `\bleie\b` catches `Leie Juni & Juli` but not `utleie` or `leiebil`. Note
the doubled backslash — it is JSON.

Patterns also see the **payee's account number**, which is how one name can bill
two different things: SiT sends the rent and the gym both as `Sit`, same row
type and same bank category, and the account behind them is the only field that
differs. Put the account number ahead of the name pattern and the specific one
wins.

Keep plain patterns specific. A bare street name catches every shop on that
street, which is how `Munkegata` first swallowed a supermarket.

A card merchant ends with the terminal's country — `LAWSON, TOKYO, JAPAN` — so a
card row that neither a pattern nor the bank has placed falls to `reise` when
that country is not Norway, and to `ukategorisert` when it is. It sits *below*
the bank's own category on purpose: a supermarket in Vienna is groceries that
happened abroad. The bank's catch-alls — `diverse`, and `ukategorisert` spelled
out on the row — collapse into `ukategorisert` too, so there is one opaque
bucket, not three.

An **excluded** row with nothing else to go on lands in `overfoering` rather
than that bucket: both legs of a transfer and both legs of a card bill are a
transfer, and the toggle that lists them is the only place they are ever seen.
No sum can see it — `stats.ts` skips excluded rows before it adds anything up.

`rules/vipps.json` is a list of names, in the same pattern language:

```json
["ola nordmann", "kari nordmann"]
```

A name alone is not enough, because a flatmate is two relationships at once:
dozens of small instant payments for a coffee or a taxi, and a standing monthly
transfer for rent. The description is the bare name in both, so no pattern in
`rules/overrides.json` can separate them without swallowing both — **the bank's own
`typeText` can**. A Vipps payment settles instantly (`Straksbetaling`) or rides
the card; the other kind is a giro or a plain `Overførsel`, set up once and left
running, or pushed across in one lump.

`rules/giro.json` says what a given person's lump transfers are:

```json
{ "ola nordmann": "husleie", "kari nordmann": "reise" }
```

The category is per name rather than always rent, because the row type says how
the money moved and never why — two of these turned out to be friends' shares of
a trip, transferred in a lump exactly like a month's rent and identical to it on
the row. A name absent from `rules/giro.json` keeps its peer-payment reading, and
`Overførsel mellom egne kontoer` is excluded outright as the bank's wording for
a family transfer. An explicit entry in `rules/overrides.json` beats all of it, being
checked first.

Person-to-person payments are the one category with a name per payee rather than
a pattern per merchant, so they outgrew `rules/overrides.json` and got their own file.
It is folded into the overrides on load, after them, so an explicit entry in
`rules/overrides.json` still wins a collision.

`rules/payees.json` maps a pattern to the one name a payee should go by:

```json
{ "simen leie": "Simen leie" }
```

A landlord who writes the month into every payment is eleven payees to anything
counting by name — `SIMEN LEIE Februar Husleie` and `SIMEN LEIE Mars Husleie`
share nothing a grouping can see — so the subscriptions card listed one standing
rent eleven times over. Renaming beats grouping at the point of use, because
`merchantOf` is what the table, the bars, the chips and the subscriptions card
all agree on; a name synthesised inside one of them would filter to nothing in
the others. It rewrites `counterparty` only and runs after every other rule, so
nothing is matched against a name it did not see, and the month stays in
`description`, which is what the search box reads.

`rules/subscriptions.json` is a list of the same patterns, and it is a second axis
rather than a category:

```json
["telenor", "youtubepremium", "claude"]
```

A match sets `isSubscription`, so YouTube Premium stays
`medier_og_underholdning` and is still counted as a subscription. SB1 sets the
flag itself, on the card as well as the bank accounts, and a pattern only ever
adds to it. The bank guesses it from the merchant and is wrong about as often as
right, so a pattern here is what makes a subscription certain.

`/overrides` in Claude Code reads the database and `rules/overrides.json` and suggests
patterns worth adding — only where a merchant with real money behind it is
landing in `ukategorisert`. It sends merchant
names to the model, which is the one place this repo talks to the network on
purpose. Run `pnpm sb1 rebuild` after accepting a change.

## Layout

`src/` is split by which half of the one rule a file is on — `net/` may make
requests, `core/` may not, `web/` composes them.

```
src/net/sb1.ts       SpareBank 1 auth, keychain, get(), monthRange()
src/net/sync.ts      the network half — one file per account per month
src/net/budget.ts    the bank's own remaining-request count, cached to disk

src/core/types.ts     Txn / Classified / Categorized — the shared contract
src/core/normalize.ts data/raw/<month>/*.json -> Txn[]
src/core/exclude.ts   flags internal transfers and card bill payments
src/core/categorize.ts bank category + overrides, peers and subscriptions
src/core/db.ts        node:sqlite store, rebuilt wholesale
src/core/stats.ts     the only money aggregation
src/core/select.ts    which rows are in view — filters, months, categories
src/core/pipeline.ts  the offline chain; imports nothing that touches a network

src/web/serve.ts     pnpm dev: /api/txns, Vite middleware, when to auto-refresh
src/web/app/         the React app — App, FilterBar, Charts, Cards
src/cli.ts           command dispatch

rules/             the hand-edited JSON rules — accounts, overrides, vipps,
                   giro, payees, subscriptions; gitignored, see Categories
```

`src/core/` runs in both Node and the browser, so the page aggregates with the
exact code `node --test` pins.

Everything holding personal data is gitignored: `data/`, `rules/` and
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
