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
src/net/sync.ts       the network half — nothing in core/ may import this
src/net/budget.ts     the bank's own remaining-request count, cached to disk

src/core/types.ts     Txn / Classified / Categorized — the shared contract
src/core/normalize.ts data/raw/<month>/*.json -> Txn[]
src/core/exclude.ts   Txn[] -> Classified[]; flags transfers and bill payments
src/core/categorize.ts Classified[] -> Categorized[]; bank category + overrides
src/core/db.ts        node:sqlite store, rebuilt wholesale
src/core/stats.ts     the only money aggregation — monthStats() and yearStats()
src/core/select.ts    which rows are in view; no money logic, ever — `AXES` is
                      the three list filters, one control repeated
src/core/pipeline.ts  the offline chain, importable by the CLI and the server

src/web/serve.ts      pnpm dev — /api/txns, Vite middleware, the refresh policy
src/web/app/          the React app: App, FilterBar, Charts, Cards, icons
src/cli.ts            command dispatch

vite.config.ts    root is src/web/app; middleware mode only, there is no build
data/raw/         API responses, verbatim, gitignored
data/eb-archive/  the retired Enable Banking files and statement CSVs, kept
                  out of data/raw/ so rebuild cannot double-count them
data/banking.db   derived SQLite store, rebuildable from data/raw, gitignored
rules/accounts.json     which accounts are mine, and which is the card
                        (hand-edited), gitignored
rules/overrides.json    substring or /regex/ -> category, gitignored
rules/vipps.json        names of payees, as a list; its own rule, gitignored
rules/giro.json         name -> what that person's lump transfers are, gitignored
rules/payees.json       pattern -> the one name a payee goes by, gitignored
rules/subscriptions.json  the same patterns, as a list; sets isSubscription, gitignored
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

**Every SB1 request is ledgered, against the bank's own count.** `sb1.get` and
the token exchange both call `budget.spend` before the request and
`sb1.noteLimits` after it: `spend` counts down from what the bank last reported
in `x-ratelimit-remaining` and refuses at zero, `noteLimits` replaces that
estimate with what the response actually said. Anything that adds a new call
path gets this for free; anything that bypasses `sb1.get` does not, so don't.

**There is no local cap, deliberately.** An `SB1_HOURLY_CAP` over a rolling hour
of our own timestamps used to sit in front of this, and its window was wrong: it
held each request against you for a full 60 minutes after firing it. SB1's quota
is 60 an hour **per API** (its FAQ says so) and it behaves as a bucket refilling
at one request a minute, so an hour of our own history refuses long after the
bank would say yes. Do not reintroduce one.

`budget.ts` therefore stores two numbers — the last figure reported and when —
and credits elapsed time back at 1/minute up to 60. That needs no expiry, which
is the point: a `0` seen an hour ago is a full bucket now, and a 429 clears
itself at one probe a minute rather than waiting out a window nobody can see.
The remaining rule is **unknown means yes**: nothing on disk, so the 429 is the
brake. Because the quota is per API, the token exchange spends but does not
`note` — writing its counter here would overstate what `/transactions` has left.

**Raw is immutable.** Never rewrite a file under `data/raw/` in place. Re-sync
with `--force` if the bank restates a month.

**Dates are Oslo-local.** The API's `date` is epoch millis at *Norwegian*
midnight, so every July timestamp is `22:00Z`. Format with
`Europe/Oslo`, never UTC — UTC shifts every transaction back one day and moves
the 1st of the month into the previous month.

**Nothing personal enters git, or the network.** No account numbers, account
keys, names, balances or descriptions in source, tests, fixtures, commit
messages or docs. `.env.local`, `data/` and the whole of `rules/` are
gitignored; keep it that way. JSON
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
state is five `useState`s. Check with me first if you think another package is
genuinely warranted.

**There is no build step.** Vite runs in middleware mode inside `src/web/
serve.ts`, so `pnpm dev` is one process on one port, and `dist/` does not exist.
The page is only ever served to localhost, which is what makes that safe. Don't
add `vite build` to make it "production-ready" — there is no production.

`pnpm dev` also runs without `node --watch`, and putting it back hangs the
command: loading the Vite config writes
`node_modules/.vite-temp/vite.config.ts.timestamp-*.mjs`, `--watch` sees a new
file and restarts, and the restart loads the config again. The page hot-reloads
through Vite anyway, so the flag buys nothing the server does not already do.

**Money logic leaves a test behind.** Anything that signs, sums, excludes or
categorises gets one `node --test` case in `src/*/*.test.ts`. No frameworks, no
fixtures built from real transactions. The React components are deliberately
dumb so this stays possible: logic that deserves a test belongs in `src/core/`,
where Node can reach it without a DOM.

## Data model

`src/core/types.ts` defines `Txn`, the canonical record. It is shared by every
step — read it before writing anything downstream, and treat widening it as a
cross-cutting change to announce, not to slip in.

**One source now**, `data/raw/<month>/<accountKey>.json`, the credit card
included. The card came through Enable Banking until `GET /accounts` turned out
to hide it behind `includeCreditCardAccounts`, which — like all five `include*`
flags — defaults to false. `/transactions/classified` answers for its key like
any other and returns *more* per row than Enable Banking ever did: the merchant
on 541/541, a category on 541/541, `mcc`/`mccGroup` on 534, the original
currency on 533. That retired the EB client, the 90-day consent and the manual
statement CSV in one go. The old files are in `data/eb-archive/`.

`Txn.date` is the field that paid for it. SB1 dates a card row by the
**purchase**, one to three days before the booking, and no list endpoint carries
a booking date — only `/transactions/{id}/details`, one request per row. So card
rows are purchase-dated, deliberately; about a dozen a month land the other side
of a month boundary from where Enable Banking put them, and the largest month
moved 5 700 kr. Deposit rows are booking-dated as before.

`Txn.account` is **the account's name**, from `rules/accounts.json`, and it is
what the page groups and labels by — there was a `source` of `bank | card`
while there were two APIs, and one source needs no such field. The key stays on
the row as `accountKey`; the name rides along because `stats.ts` runs in the
browser, where there is no rules file to look one up in, and because a key is a
local secret that must never be a label on the page.

Two rules still need to know *which* account is the credit card, and both read
`card: true` from `rules/accounts.json` rather than guessing: `billReason`,
because a bill is worded one way on the card and another on the account paying
it, and the travel guess in `categorize`, which must never see a deposit row.

Two things every account sends that the card sends differently:

| | deposit accounts | the card |
|---|---|---|
| typeText | `VISA Varekjøp`, `Overførsel`, … | `Transaksjon`, `Kredittkort` |
| remoteAccountNumber | the other party's, when there is one | `-1` on all but the bill |
| pending | 2 rows in 2026 | 7 rows in the current month alone |

`bookingStatus: PENDING` rows are **dropped in `normalize`**, on every account.
A reservation is reissued under a new id when it books and its amount can still
move, so keeping it is how one purchase becomes two rows. There is no
`isPending` on `Txn`: everything in the store is booked.

Notes from the real data, not the plan:

- SB1's list endpoint has no *merchant* field — use `cleanedDescription`. It
  does carry `remoteAccountName`, the other party of a transfer or a
  payment-with-message as the payer typed it, on 391 of 4043 rows. It is the
  counterparty fallback, never the first choice: where both exist they disagree
  on 117 rows and `cleanedDescription` is the better string. It earns its place
  on the 10 rows that have no `cleanedDescription` at all, where it is the only
  name on the row. A structured merchant still exists only on
  `/transactions/{id}/details`, one call per transaction, and is not worth it.
- `recurring` and `subscription` have been identical on every SB1 row so far.
  Keep both, expect one bit of signal. The bank sets them on standing payments
  (AvtaleGiro, KID) and also guesses them from the merchant on its own
  `VISA Varekjøp` rows, where it is wrong as often as right — a one-off bag, a
  bar and a membership fee are flagged, next to HelloFresh which really is a
  subscription. The card carries them too, and guessed the same way — 2 of 71
  rows in a month — so `rules/subscriptions.json` is still what makes a
  subscription certain.
- A name in `rules/vipps.json` does **not** on its own mean `vipps`. A flatmate is two
  relationships at once — dozens of small instant payments, and a standing
  monthly transfer for rent — and the description is the bare name in both, so
  no pattern separates them. `typeText` does: instant or card is a peer payment,
  a giro or a plain `Overførsel` is a lump. Not separating them filed 293 000 kr
  of rent under `vipps`. But the type says how the money moved and never why, so
  `rules/giro.json` maps the name to what its lumps *are* — rent from a flatmate,
  a share of a trip from a friend, and those two are identical on the row.
  A name absent from it keeps the peer reading; `Overførsel mellom egne kontoer`
  is excluded outright as a family transfer.
- One payee can bill two unrelated things under one name, with the same row type
  and the same bank category. SiT's rent and SiT's gym differ *only* in
  `remoteAccountNumber`, which is why that field is on `Txn` and in the override
  haystack — an account number ahead of the name pattern is the only way to
  split them.
- SB1 categories are always exactly one entry at confidence 100. `diverse` is
  the bank's catch-all and carries no more signal than no category at all, so
  `categorize` collapses it into `ukategorisert` — as it does the bank's own
  literal `ukategorisert`, which it sends on ~500 rows and which is the same
  shrug by another name. Together they are ~40% of rows, which is why
  `rules/overrides.json` does real work.
- Card rows are roughly 40% of monthly spending and arrive fully classified —
  merchant, category and MCC on every one — so there is no separate card bucket
  and no card-shaped hole. `diverse` and `ukategorisert` are still ~17% of them.
- A card merchant ends with the terminal's country, and inconsistently: spelled
  out (`LAWSON, TOKYO, JAPAN`, `SLOVAKIA (Slovak Republic)`), sometimes as a
  three-letter code (`GRC`), and on six Greek rows only the town. So the travel
  guess is "the last comma-separated word is not Norway", and the comma is the
  whole guard — a Norwegian payee with no country on it (`ELETRA ENERGY AS`,
  `DUTY-FREE GARDERMOEN`) has no comma to match against.
  It sits **below the bank's category**, not above it, which is the difference
  between the old rule and this one: a supermarket in Vienna is groceries that
  happened abroad, and `Telenor Norge AS, Mobil` only looks foreign. Only a row
  the bank shrugged at reaches the guess. `mccGroup` is the honest version of
  the same signal and needs `Txn` widened first.

## Exclusions

Internal transfers are **flagged, never dropped** — the excluded set has to be
auditable. Both sides of a transfer are present because we sync every account,
so match on amount + date + opposite sign, restricted to accounts marked `mine`
in `rules/accounts.json`.

**Amount + date + opposite sign is not enough on its own.** It is a weak signal
at these volumes and it collided three times in two years: 22 kr of deposit
interest against a 22 kr coffee, 42 kr against a tram ticket, and a 2000 kr
payment from another person against an unrelated 2000 kr move between two of my
own accounts. Every one of those deleted real money from the totals — and the
income side is the half nobody notices. So **both legs must also be typed as a
transfer by the bank**: `Txn.typeText` is SB1's own name for the row kind
(`VISA Varekjøp`, `Kreditrente`, `Overførsel mellom egne kontoer`), matched on
the stem `overfør`, which covers all four spellings it uses. A purchase cannot
pass that however well its number lines up. Card rows carry no `typeText` at
all, which correctly makes them ineligible.

Check both legs, never one: a row excluded while its counterpart stays in breaks
the netting invariant below, which is the only thing that catches this class.

**A row that names one of my own accounts skips all of that.** `remoteAccountNumber`
against the `number` field in `rules/accounts.json` is proof, not a coincidence,
so it needs neither a transfer type nor a counterpart search — and it stays
symmetric, since each leg carries the other account's number. It is the only rule
that sees a self-transfer the bank did not type as one: a giro between my own
accounts books as `NettGiro m/melding` against `Betaling med melding`, and
`Småsparing` round-ups are the same shape. That was 240 rows counted as both
income and spending, 5 572 kr of it in one pair. An account with no `number` falls
back to amount + date + type, exactly as before.

Credit card bill payments are **excluded**, like any internal transfer. The
card's own transactions are synced, so counting the bills as well would
double-count. Bill amounts and card spend diverge wildly within a month —
April 2026 paid 35k against 22k of spending — so the bills are worthless as a
spending proxy anyway.

The card account is in `rules/accounts.json` as `card: true` and deliberately
**not** `mine`: `mine` means "a deposit account both legs of an internal
transfer can sit in", which the card is not, and `transferReason` returns early
for anything not `mine`. Both bill legs are caught by description regardless.

A bill payment has **two legs and both must be excluded**, which the first real
run got wrong in two ways:

- Match the bank leg on the issuer's **collection account number**, named in
  `rules/accounts.json` by `issuer: true` — the same shape as the fund manager's
  settlement account, an entry that exists for its number alone. It is not an
  account of mine, so the `mine` number rule can never see this pair; it needs
  its own flag. All 23 bank legs on record carry that number.
  The name is the fallback, and `Kredittbanken`, not `Kredittbanken ASA`: the
  issuer also books these as `Kredittbanken - del av SpareBank 1`, and the
  narrower string silently missed one. The name alone was not enough either —
  SB1 words the row after the *channel* when the bill is paid by hand, and
  `Mobilgiro m/KID, forfall i dag` names no payee at all. The issuer is on that
  row only as `remoteAccountName`, which `normalize` drops wherever a
  `cleanedDescription` exists, so 4 941 kr read as spending against an excluded
  card credit.
- The card leg is the `Innbetaling` credit on the card account — singular, as
  SB1 words it; Enable Banking said `Innbetalinger`. It cannot ride on the
  amount+date transfer rule: the card is not a `mine` account, and the credit
  posts 0–3 days after the bank debits it anyway. Excluding only the bank leg
  leaves the credit counted as **income**.

Card credits that are *not* a payment stay in: a `Varekjøp` credit is a merchant
refund and `Rabatt strømmetjenester` is cashback. Both are real.

The two legs land in different months about once a quarter — a bank debit on the
28th against a card credit on the 1st — so the reason nets to zero **across the
record, not within every month**. 23 pairs, 114 844.35 kr, netting exactly.

Buying and selling funds is **excluded as `investment movement`**, in both
directions. Money crossing the fund manager's settlement account is capital
changing form, not earning or spending: fund purchases left the deposit accounts
reading as 5 000 kr of shopping, and the settlements arriving in the share
savings account read as 5 179 kr of income, where they were the other half of
withdrawals already excluded. The settlement account is named in
`rules/accounts.json` by `investment: true` — it is not mine and never will be,
so `mine` cannot express it.

That reason is **one-sided by design and exempt from the netting check below**:
the counter-leg is booked at the fund manager and is not in `data/raw/` at all.
Its residue is the gain on the funds, and it is the only reason allowed a
residue.

An entry may also carry `sync: false`, meaning it exists for its *number* alone —
there is no key `/transactions` answers for. `accountKeys` skips those.

The check that catches all of this: every excluded reason must net to zero
across the pair — `investment movement` excepted. If it doesn't, one leg is
being matched and the other isn't.

**A number rule must ignore the row's own account.** Cash into a deposit machine
books as `Innskudd automat` stamped with the number of the account it landed in,
and reading that as "the other party is mine" excluded real income against no
second leg. Nothing moves between an account and itself.

An excluded row is `overfoering`, and that decision sits **above every other
rule in `categorize`** — above the overrides and above the bank's own category.
It was the last fallback once, which left the bank's word for the *payment* on
rows where the money never moved: a card bill filed as `Avgifter` on the giro
paying it and `Annet lån og gjeld` on the credit settling it. `reason` says why
a row is out, so the category has nothing to add. The toggle in `select.ts` is
the only thing that lists these, and every sum in `stats.ts` skips them before
it adds anything up, so the slug is a label for the audit view and never a
bucket money lands in.

## The card's own fields

Everything the statement CSV used to supply now arrives on the row, and more:

| field | what it is |
|---|---|
| `cleanedDescription` | the merchant, `NAME, CITY, COUNTRY`, on every row |
| `description` | the same with the terminal number still on the front |
| `categories` | the bank's own, on every row |
| `mcc` / `mccGroup` | the merchant category, `-2` on the issuer's own rows |
| `currencyAmount` + `currencyCode` | what it cost in the currency it was paid in |
| `remoteAccountNumber` | `-1` except on the bill, where it names the paying account |

`mcc`, `mccGroup` and `currencyAmount` are worth putting on `Txn` and are not
there yet — widening `Txn` is its own change, not a rider on the source swap.

The `-1` and `-2` are placeholders, not values. `normalize` maps
`remoteAccountNumber: '-1'` to null; anything that starts reading `mcc` has to
do the same for `-2`, or the override haystack fills with sentinels.

## Operational gotchas

**A five-year ceiling on the range.** `fromDate`..`toDate` may not span more
than five years — longer is a `400 BadRequest`, `Date interval cannot exceed 5
years`. It is not a row limit and says nothing about pagination.

**Card posting lag.** Card transactions post late and arrive `PENDING` first, so
a July report run on 1 Aug misses the tail of July. Run a few days into the
following month, or re-run with `--force`.

**Pending rows are dropped in `normalize`**, on the deposit accounts as well as
the card. They carry a date, so this is not the missing-date rule Enable Banking
needed: SB1 reissues a reservation under a *new* id once it books, and its
amount can still move, so a kept pending row is how one purchase becomes two.

**Re-syncing rewrites the file even when nothing changed**, because
`classificationInput.id` is a fresh UUID per response. Compare row counts and
transaction ids, never file hashes.

**Pagination.** `rowLimit` exists on the SB1 transactions endpoints and we have
never set it. Nothing has come back truncated so far and every response carries
an empty `errors` array, but that is luck, not proof. A suspiciously round row
count is the tell.

## Rows only enter the database by rebuild

`rebuild` wipes the table and reconstructs from `data/raw/`. There is no
incremental path, and adding one back needs more thought than it looks.

An upsert keyed on the id used to run incrementally and was wrong: **SB1 reissues a
transaction under a new id when a reservation becomes booked**, so re-syncing a
month still in flight left the old id behind as a second row. A rent payment
appeared twice, 18 000 kr counted as 36 000, and re-importing could never clear
it — an upsert has no way to notice a row it did not produce.

Deleting just the affected month would not fix it either. Every account is now
queried on the same date field `Txn` is keyed on, so a directory does happen to
own its month — but that is a property of today's endpoints, not an invariant,
and a full reconstruct is safe without tracking which file produced which row.

At a thousand rows this takes a few hundred milliseconds. Revisit when that
stops being true, not before.
