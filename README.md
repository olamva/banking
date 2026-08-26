# banking

Personal spending analysis over my SpareBank 1 accounts and credit card. The code pulls raw transactions to disk one time. It then does everything else offline.

This is a private repo for one user. It is for personal use.

```
data/raw/  ──normalize──►  Txn  ──exclude──►  ──categorize──►  SQLite
                                (transfers)    (overrides)        │
                                                  pnpm dev ◄──────┘
```

Six bank accounts and one credit card supply the data, all from the SB1 API. The code normalises every row to one shape. It flags internal transfers and card bill payments, so that they do not count two times. It then applies the categories. The result lands in SQLite, and the dashboard reads it.

## Setup

You need Node 24 or later, because the code uses the built-in TypeScript execution and `node:sqlite`. You also need pnpm.

```bash
pnpm install
pnpm dev                            # http://localhost:4000
```

`.env.local` holds the SpareBank 1 credentials. Only the online commands use it. `pnpm dev` and every offline command run without it. It is not in git. `data/` and `rules/` are not in git either, so **a fresh clone or worktree starts empty**:

```bash
pnpm install
pnpm worktree:link                  # symlink .env.local, data and rules back
pnpm dev --port 4001                # the main checkout uses 4000
```

## Commands

**Refresh on the dashboard is how you get new transactions.** It sweeps the whole record, fetches the months that can still change, and rebuilds the database. It is the only control on the page that touches the network. A typical press is one request.

```bash
# online. These are the only commands that touch the network
pnpm sb1 login                      # BankID in the browser. Refresh token to the keychain
pnpm sb1 accounts                   # writes data/raw/accounts.json and rules/accounts.json

# offline
pnpm sb1 rebuild                    # rebuild data/banking.db from data/raw/, after a rules edit
pnpm sb1 reconcile                  # does the history explain the balances?
pnpm sb1 budget                     # what SB1 last reported as left of its limit

pnpm dev                            # the dashboard on :4000
pnpm test                           # node --test, no framework
pnpm typecheck
```

A card transaction posts late, and it arrives pending first. A month is therefore final only a few days after it ends. The code drops a pending row rather than counting it. Press Refresh again to collect the tail. A refresh always asks for the months that have not closed.

## The dashboard

`pnpm dev` runs Vite. The app is `src/web/app/`. `/api/txns` and `/api/refresh` are one plugin in `vite.config.ts`. `/api/txns` reads the database again for each request, so a `rebuild` in another terminal appears on reload. The browser computes everything, because the page imports `src/core/stats.ts` directly. The page therefore aggregates with the code that the tests pin. There is no build step and no `dist/`.

**Two views over one period.** _Dashboard_ shows the tiles and the charts. _Transactions_ shows the rows behind them. One pair of pickers chooses what both views show. A delta compares against **one year back**. Spending has a shape over a year that the month before cannot show. January against December says only that Christmas happened. A period that still runs compares against the same slice one year back. Without that, every delta would read as a collapse that the calendar drew.

**The spending chart runs on days.** _Running total_ accumulates from the start of the window. The gap between the two lines is therefore the running surplus. The crossing point is the day the surplus went below zero. _Per day_ and _per month_ plot the raw buckets. Each window offers only the grain that it can carry. The shading is the one thing that the raw daily view drops. The shading reads the vertical gap as a surplus. That is true of a whole window. It is not true of one Tuesday.

**Categories, merchants, accounts and countries each filter as two lists.** A click includes. A meta-click excludes. An exclusion wins. Click any number of them. None means all. A bar, a table cell or a menu entry filters to itself.

**The page lists subscriptions per subscription**, not per charge. Each line shows what it is, what it costs each month, what it has taken across the window, and when it last went out. _Per month_ shows the **last payment**, not the average. An old price inside an average shows what a subscription has cost. The question is what it costs now.

**Refresh pulls what can still change, and rebuilds.** It is a button in the header. It then rebuilds `data/banking.db` and reloads the page. It reports what it fetched, or why it stopped. One refresh runs at a time.

**A file written after its month closed is never fetched again.** A month closes four days after it ends, which is the window a late card row books in. Only the open months therefore cost a request. The rule reads the file, not the calendar: a month that closed while its file was captured mid-month is fetched once more, because that file is missing the rest of the month.

The rebuild is whole every time, and it is the slow half now: about a second for the record.

**To make the bank restate a month, delete it.** There is no force flag. Remove `data/raw/<month>/*.json` and press Refresh. `pnpm sb1 reconcile` is what tells you a month is owed.

**Never share the dashboard.** It holds every transaction you have, and so does a screenshot. The server binds to `127.0.0.1`. Keep it there.

### Staying inside the rate limit

**Only Refresh touches the network.** No number of tabs, reloads, filters or restarts costs a request.

The SB1 quota is 60 requests each hour for each API. Every response publishes `x-ratelimit-remaining`. The quota refills continuously. It does not hold each call against you for a full hour. `data/api-budget.json` keeps the last figure and its timestamp, and it derives the rest. `sb1.get` refuses when the bank reports zero. The 429 response is the brake when nothing is on disk.

A refresh prices the whole sweep first, and the pricing costs nothing. It stops rather than fails, and a second press resumes it. `accountKey` is repeatable, and the date range may be five years wide, so **one request covers up to five years and every account**. A span with nothing owed makes no request at all, and the request that is made asks only for the months owed. A refresh with one open month is therefore one request, whatever the record holds behind it.

## Categories

The bank labels its own transactions. It is wrong or unhelpful often enough to matter. The hand-edited rules live in `rules/`. None of them are in git.

`rules/overrides.json` maps a case-insensitive substring to a category. The code checks the substring against the description, the merchant and the account number of the payee. The rule wins over the bank:

```json
{ "Munkegata 34": "faste_utgifter/boligutgifter" }
```

A pattern inside slashes is a **regex**. Use one to match a word as a word. `"/\\bleie\\b/"` catches `Leie Juni`, and it does not catch `utleie`. Note the doubled backslash, because this is JSON. Keep a plain pattern specific. A bare street name catches every shop on that street.

**Every line must work in any position.** `categorize` takes the first pattern that matches, so the file _could_ depend on its own order. It must not. Narrow the _pattern_ to fix two lines that compete. Never move a line. A refusal lookahead and a requirement lookahead do this, and they consume nothing:

```json
{
  "/^(?!.*(?:sit kafe|sit storkiosk))(?=.*\\bsit\\b)/": "faste_utgifter/boligutgifter"
}
```

`pnpm sb1 rebuild` warns about every line that still depends on its position. It also prints the narrowed form for you to paste. The order means nothing, so the file is grouped by the category that it assigns. You may sort it again freely.

The other four files:

- `rules/giro.json` — what the _lump_ transfers of one person are. The file works per name, because the row type shows how the money moved and never why. One lump is rent from a flatmate. Another is the share of a trip from a friend.
- `rules/family.json` — relatives. **The sign decides what an entry means.** Money in is `innskudd/familie`. Money out is a repayment to that person. An entry may be an account number, for the rows where the bank names no payee.
- `rules/payees.json` — the one name that a payee goes by. A landlord who writes the month into every payment is eleven payees to any count by name.
- `rules/subscriptions.json` — a list of the same patterns. It sets `isSubscription`. This is a second axis and not a category, so YouTube Premium stays `medier_og_underholdning` and still counts as a subscription.

`src/core/names.ts` handles a name that **no** pattern claims. It takes the shape off the name: the `, CITY, COUNTRY` tail from the card, a BankAxept street and city, and ALL CAPS. `YOSHINOYA, TOKYO, JAPAN` therefore reads as `Yoshinoya` with no line written. It never touches a name that a pattern _did_ claim, because that would return `Ikea` and `H&m`. The rules file holds what a payee is called. The cleaner holds the shape that the name arrived in.

A person-to-person Vipps payment needs **no rule**. The code cannot match a bare `Vipps*` marker alone, because Vipps bills merchants too. On the card the bank files a peer row as `diverse/overforing`, which is its reading of `mcc: 4829`. On the deposit accounts Vipps doubles its own marker. Both shapes sit above the bank category and below every rule above it.

`/overrides` in Claude Code reads the database and suggests patterns to add. It looks for a merchant with real money behind it that lands in `ukategorisert`. Run `pnpm sb1 rebuild` after you accept a change.

## Layout

```
src/net/       may make requests
src/core/      may not. Both Node and the browser import it
src/web/app/   the React app
src/cli.ts     command dispatch
vite.config.ts pnpm dev: the app plus /api/txns
test/          node --test, mirroring src/
rules/         hand-edited JSON, gitignored
```

The dashboard uses React, Vite and Tailwind. Everything else uses the Node standard library, including SQLite, HTTP and TypeScript execution. There is no ORM, no chart library, no component library and no state manager. The charts are hand-written SVG. `data/raw/` is the source of truth, and the code never rewrites it in place. The database is derived, and you may delete it at any time. Analysis never calls the API. Any code that sums money leaves a test behind.

`.claude/CLAUDE.md` holds the rest, including the exclusion rules and the reasons for them.
