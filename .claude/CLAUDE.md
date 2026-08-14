# banking

Personal spending analysis over the SpareBank 1 personal banking API. Pulls raw
transactions to disk once, then analyses them offline.

Private repo, single user, personal use. Not a product.

**The commands are in `README.md`** — that is the one list, keep it the one
list. `pnpm test` and `pnpm typecheck` both have to pass before anything is
finished. What follows is the part a README would not carry: the rules, and the
things the real data does that the code has to survive.

## Committing

**Commit, push and PRs are authorised in this repo, standing** — commits granted
2026-08-13, push and PRs the same day, and the deliberate exception to the global
never-commit rule. Commit as the work reaches a state worth keeping, in the
repo's own style (Conventional Commits, no scope, no gitmoji, no body). Push your
own branch, and open the PR against `main` when the work is done.
`.claude/settings.json` carries the matching permissions, so none of it prompts.

Committing to `main` stays fine — it is where the work here has always landed,
and the standing commit grant above is unchanged by any of this. What the grant
does **not** cover, and still needs asking for in the conversation: **pushing**
`main` to the remote, force-pushing anything, and merging a PR. A branch and a
PR add history that can be read before it counts; those three publish or land it
unread. The settings deny list holds the three spellings of a force push and
`gh pr merge`, but a deny entry matches the front of the command only —
`git push --quiet --force` is not caught, so the rule above is the real guard
and the list is a backstop.

And nothing under `rules/` or `data/` is committable at all — the whole point of
them being gitignored, and the only reason a remote is safe here. That gitignore
is now what stands between the transactions and GitHub, so treat an edit to it as
an edit to a security control: never loosen the `data` or `rules` lines, and
never `git add -f` a path under either. Push is also not a licence to publish
anything else — the dashboard rule below is untouched, and a PR body carries no
account numbers, payee names or amounts.

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
src/core/report.ts    what rules/overrides.json still earns against the bank's
                      own subcategory; prints, never writes
src/core/select.ts    which rows are in view; no money logic, ever — `AXES` is
                      the three list filters, one control repeated
src/core/pipeline.ts  the offline chain, importable by the CLI and the server

src/web/serve.ts      pnpm dev — /api/txns and Vite middleware, offline always
src/web/app/          the React app: App, FilterBar, Charts, Cards, icons
src/cli.ts            command dispatch

vite.config.ts    root is src/web/app; middleware mode only, there is no build
data/raw/         API responses, verbatim, gitignored
data/banking.db   derived SQLite store, rebuildable from data/raw, gitignored
rules/accounts.json     which accounts are mine, and which is the card
                        (hand-edited), gitignored
rules/overrides.json    substring or /regex/ -> `category` or `category/sub`,
                        gitignored; both value forms are read, so the file
                        migrates a line at a time
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

**The server never calls the API either.** `src/web/serve.ts` imports from
`src/core/` alone and reads only `data/banking.db`, so no page view can cost a
request. A `--pull` flag once let it sync a stale current month before
rendering, with four guards around it to keep the request count sane — staleness
on disk, single-flight, a budget check, a failed attempt still counted. It was
removed in favour of not having the path at all, and the reasoning is in that
file's header. Syncing is `pnpm sb1 sync`, run by hand.

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

**Every line in `rules/overrides.json` is location-agnostic.** `categorize`
takes the first pattern that matches, so the file _can_ behave as a sequence —
but it must not. Any two lines that claim the same row and name different
categories make the file's order load-bearing and invisible: a line added at the
top quietly takes rows from one below it, and nobody is told. Shuffling the file
moved 12 to 132 rows before this was fixed.

The rule is that **the file may be sorted, grouped or reordered freely and every
row must land exactly where it did.** It is currently true — 200 random shuffles
of all 103 lines move nothing — which is what lets the file be grouped by
category for reading.

Fix it in the _pattern_, never in the matcher or the ordering. `pnpm sb1
categories` names every offending pair and prints the narrowed form of the
loser: `/^(?!.*(?:sit kafe|sit storkiosk))(?=.*\bsit\b)/`, a refusal lookahead
and a requirement lookahead, neither consuming anything, so `compile`'s `.test`
over the haystack behaves the same wherever the line sits. `rebuild` warns when
the list stops being empty. Collisions where both lines name the same category
are harmless and left alone — the order decides nothing there.

**Dates are Oslo-local.** The API's `date` is epoch millis at _Norwegian_
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
any other and returns _more_ per row than Enable Banking ever did: the merchant
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

Two rules still need to know _which_ account is the credit card, and both read
`card: true` from `rules/accounts.json` rather than guessing: `billReason`,
because a bill is worded one way on the card and another on the account paying
it, and the travel guess in `categorize`, which must never see a deposit row.

Two things every account sends that the card sends differently:

|                     | deposit accounts                     | the card                          |
| ------------------- | ------------------------------------ | --------------------------------- |
| typeText            | `VISA Varekjøp`, `Overførsel`, …     | `Transaksjon`, `Kredittkort`      |
| remoteAccountNumber | the other party's, when there is one | `-1` on all but the bill          |
| pending             | 2 rows in 2026                       | 7 rows in the current month alone |

`bookingStatus: PENDING` rows are **dropped in `normalize`**, on every account.
A reservation is reissued under a new id when it books and its amount can still
move, so keeping it is how one purchase becomes two rows. There is no
`isPending` on `Txn`: everything in the store is booked.

Notes from the real data, not the plan:

- SB1's list endpoint has no _merchant_ field — use `cleanedDescription`. It
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
- A name does **not** on its own mean `vipps`. A flatmate is two
  relationships at once — dozens of small instant payments, and a standing
  monthly transfer for rent — and the description is the bare name in both, so
  no pattern separates them. `typeText` does: instant or card is a peer payment,
  a giro or a plain `Overførsel` is a lump. Not separating them filed 293 000 kr
  of rent under `vipps`. But the type says how the money moved and never why, so
  `rules/giro.json` maps the name to what its lumps _are_ — rent from a flatmate,
  a share of a trip from a friend, and those two are identical on the row.
  A name absent from it keeps the peer reading; `Overførsel mellom egne kontoer`
  is excluded outright as a family transfer.
- One payee can bill two unrelated things under one name, with the same row type
  and the same bank category. SiT's rent and SiT's gym differ _only_ in
  `remoteAccountNumber`, which is why that field is on `Txn` and in the override
  haystack — an account number ahead of the name pattern is the only way to
  split them.
- **SB1 sends a subcategory too, and it is where the signal is.** Every one of
  8 547 booked rows carries `main`, `sub`, `mainI18n`, `subI18n` and a
  `confidence`, in 68 distinct pairs, with no gaps anywhere on record. All five
  are on `Txn` and in the store.
- `diverse` reads like a catch-all at the _main_ level and is not one at the
  pair level: it is the largest main, and its 2 482 rows split into
  `vennebetaling` (1 119), `overforing` (1 178), `renter_og_gebyrer`,
  `renter_innskudd`, `medlemskap_veldedighet`, `minibank`, `kurs_utdanning`,
  `skatt` and `kredittkort`. Only `ukategorisert/annet` (1 184 rows) is a real
  shrug. `categorize` still collapses `diverse` into `ukategorisert` — undoing
  it costs 68 rows a worse label until a display name exists — but that is a
  _labelling_ debt now, not a claim about the data.
- **Categories are not always one entry at confidence 100.** 7 802 of 8 547 rows
  are at 100 and 441 rows carry two or three candidates, always sorted by
  confidence down; `normalize` keeps the first. Low confidence marks a bank
  guess made from a merchant name it does not know — 31 rows of a student
  society's kiosk arrive as `faste_boutgifter/alarm` at confidence 25. Nothing
  gates on it; it is stored so the report can weigh what the bank claims.
- **`rules/overrides.json` went from 175 patterns to 100** against this report,
  with every row's category verified unchanged at each step and the money totals
  identical to the øre. Whole slugs were migrated at once rather than line by
  line — a slug means one pair or it fragments, and rewriting only the lines the
  report flagged would have split `uteliv` across two categories. `uteliv` ->
  `kafe_og_restaurant/utesteder`, `stroem` -> `faste_utgifter/stroem`, `husleie`
  -> `faste_utgifter/boligutgifter` (in `rules/giro.json` too), plus two subs
  that are ours alone: `kafe_og_restaurant/linjeforening_kiosk` and
  `innskudd/linjeforening_refusjon`. The five slugs whose bank pair sits under
  `diverse` — `avgifter`, `renter_og_fordeler`, `medlemskap_og_veldedighet`,
  `kontantuttak`, `skatt` — were deliberately left alone: they read better than
  `diverse` does until a display name exists.
- **Income and spending split on the sign, not on the category** —
  `aggregateCents` picks the side with `cents > 0 ? agg.in : agg.out` and adds
  the magnitude to it. So no
  category can move money between the two totals, and filing Lånekassen as
  `annet_lan_og_gjeld/studielan` labels 618 915 kr as debt while the income
  total still counts every øre of it. Taking something out of income means
  excluding it in `exclude.ts`, which is a money change with a netting invariant
  — not a rules edit. Decided 2026-08-13 to leave Lånekassen in income: the
  money did arrive and it did get spent.
- The dashboard draws that split as **six cards, three per direction**, named
  `Spending by …` and `Income by …` over category, counterparty and account.
  `monthStats` carries both sides because `aggregateCents` now keeps a `SideAgg`
  per sign rather than spending alone, and the income breakdowns are the same
  three functions over the other map. So a **spending category with income in
  it is expected, not a bug**: 14 of the mains have some, because a merchant
  refund is money in filed where it went out, and `Income by category` says so
  rather than hiding it. Both sides reconcile — the income categories and the
  income accounts each sum to `totalIn` to the øre.
- Much of `rules/overrides.json` predates knowing the sub existed and
  re-derives it by hand. `pnpm sb1 categories` measures that by counterfactual —
  it deletes each line, re-runs the real `categorize` over that line's own rows,
  and reports what changed. On the record: **51 lines deletable outright**, 13
  that are only our name for the pair the bank sends, 13 where the bank makes a
  different claim, 22 part-and-part, 76 load-bearing. `rules/vipps.json` was the
  same story and did not survive it — 1 053 of 1 231 peer rows were already
  `diverse/vennebetaling`, and the bank found 62 peers the list missed.
- **A better subcategory and a different claim are not the same thing**, and the
  report must not offer the second as a line to paste. `"eletra": "stroem"`
  against `faste_boutgifter/stroem` is our name for the bank's own pair.
  `"bit oslo lufthavn": "kafe_og_restaurant"` against `reise/annen_reise` is the
  bank calling a bakery a trip. The test needs no alias map and reads the corpus
  instead: a slug that **is** a bank main (`kafe_og_restaurant`, `reise`) agrees
  when the bank's main matches, since a rewrite there only adds a level; a slug
  that is **ours** (`uteliv`, `stroem`, `husleie`) must match the whole pair it
  resolves to elsewhere, because the main agreeing says nothing — `barrock`
  arrives as `kafe_og_restaurant/restaurant`, same main, and it is a bar.
- `reise/annen_reise` is the bank's catch-all _inside_ travel and it is filled by
  where the terminal stands, not by what was sold: duty-free, inflight food, an
  airport bakery. It is a real subcategory and stays one — but it is why an
  override over an airport payee is worth keeping, and why the bank suggesting
  it is never on its own a reason to hand a row over.
- **`rules/overrides.json` used to depend on its own line order**, invisibly.
  It no longer may — see the location-agnostic rule above, which is where the
  mechanism and the fix are written down. The file is now **grouped by the
  category it assigns**: sorted by main, then subcategory, then pattern, with
  one blank line at every change of subcategory and two at every change of
  main. That grouping is only safe because the order means nothing, and it is
  the reason to keep it meaning nothing.
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

## The page's two-level categories

`Categorized` carries `category` and `subcategory`, and **`Filters.categories`
holds both levels in one list** — a bare `dagligvarer` beside a pair
`dagligvarer/andre_dagligvarer`, matching if either is listed. It was two axes
for about an hour, and two axes ANDed: `cat=annet_lan_og_gjeld` with
`sub=dagligvarer/andre_dagligvarer` asked for rows that were both at once and
drew an empty page. A tree with checkboxes means a union, and one list gives a
union for nothing — while excluding a parent still takes its children, because
the bare slug is one of the candidates tested.

A pair is always `category/sub`, never a bare sub: `dagligvarer` is a sub under
itself and `kollektivtransport` sits under two mains.

**`diverse` is the bank's largest main and it is kept**, subcategories and all.
It reads like a second catch-all and is not one: its 2 482 rows split into
`vennebetaling`, `overforing`, `renter_og_gebyrer`, `medlemskap_veldedighet`,
`minibank`, `kurs_utdanning`, `skatt`. Collapsing it — which this repo did until
2026-08-13 — threw that away one level above where the signal was, and is the
only reason `rules/vipps.json` ever had to name 176 people the bank had already
recognised. `BANK_CATCH_ALL` now holds `ukategorisert` alone, and `OURS` renames
exactly one main: `faste_boutgifter`, because it is not only housing.

That took `rules/vipps.json` from 176 names to 33 and `rules/overrides.json`
from 175 patterns to 93, every row landing identically and the totals unchanged
to the øre. `avgifter`, `kontantuttak`, `renter_og_fordeler`,
`medlemskap_og_veldedighet` and `skatt` are gone as slugs of ours — they were
hand-written names for pairs the bank sends.

**`rules/vipps.json` is gone entirely**, as of 2026-08-13, and the 32 names it
still held went with it. It was carrying three different jobs at once and only
one of them ever needed a person: 9 entries were doing what the card row already
says, 11 were doing what the doubled marker already says, one decided nothing at
all, and the remaining 11 moved into `rules/overrides.json` and
`rules/family.json`, which is where a pattern and a relative respectively
belong. All 8 547 rows were diffed across the change: 5 moved, income and
spending identical to the øre. Four are incoming rows from a relative whose
account number is now on the family list, `diverse/vennebetaling` ->
`innskudd/familie`; the fifth is a card peer payment the old list had never
been told about, which is the bug that started this.

**A `Vipps*` marker in the description is not a peer payment.** Vipps pays
merchants too, and one pattern over it moved 271 correctly-filed rows — 139
canteen lunches, 41 tram fares — into `vennebetaling`. Two shapes add the second
signal the bare marker lacks, and between them they retired the name list:

- **The bank's own pair, on the card.** A card row is `diverse/overforing` when
  the bank reads `mcc: 4829`, _MONEY TRANSF_, off it — the card network's word
  for a merchant that moves money, which is what Vipps is to it when the payee
  is a person. The 28 card rows carrying `Vipps*` split exactly there: the 16 at
  `diverse/overforing` are all people, and the other 12 arrive as `RESTAURANTS`,
  `FURNITURE/EQ`, `Bus Lines` and `Motion Pictu` with a real category to match.
  No deposit row matches the pair at all. Read off `bankCategory`/`bankSub`
  rather than the MCC, deliberately: the bank has already done that read, `mcc`
  is not on `Txn`, and widening it would buy nothing this does not already get.
- **The doubled `Vipps*Vipps*` form**, which is conclusive on its own: 18 rows
  on record, all peers, no false positives. Vipps doubles its marker when a
  payment settles as `Straksbetaling - ekstern betalingstjeneste` rather than
  over the card rails, and the bank has no category for those at all.

Both sit **below** the override, lump and family rules — a flatmate's rent and a
relative's gift are Vipps payments too, and each already has a better name by
then — and **above** the bank's own category, which is the whole point: letting
`diverse/overforing` stand is what filed a peer payment as a transfer.

**A standing agreement is a lump**, so `LUMP_TYPE` matches `Avtale` and
`rules/giro.json` can say what one is. Pocket money from family arrives that way
— 123 rows, 18 450 kr — and no other payee on record has a single `Avtale` row.

**`rules/family.json` names relatives**, and **the sign is what the entry
decides, not whether it applies**: money in is `innskudd/familie` (187 rows,
97 629 kr), money out to the same person is you paying a relative back, which is
`diverse/vennebetaling` and nothing else (57 rows, 63 672 kr). Both readings live
on one list because both need the same fact — that this person is a relative —
and that fact is on no row. `rules/vipps.json` used to carry a second copy of
three of them purely to catch the outgoing half.

The category enforces the split by itself: `innskudd` is the bank's income main,
so an outgoing row filed there would be a contradiction. The rule needs to exist
because neither neighbour can express it — `rules/giro.json` is gated on the row
being a lump and most family money arrives as `Straksbetaling` like any other
instant payment, and an override cannot see the sign. It runs _below_ the lump
rule, so pocket money keeps the better label giro.json already gave it, and
_above_ the Vipps rules, which would otherwise call every gift a peer payment.

**An entry may be an account number as well as a name.** The bank names no payee
at all on a plain `Overføring`, so the number is the only thing on the row that
says who the other party was — and a number is safe here in a way it is not in
`rules/overrides.json`, which runs above `rules/giro.json` and would swallow the
same relative's standing pocket-money transfers. Both numbers on the list are
11-digit account numbers, and each belongs to a relative the list already names:
the number only adds the rows the name cannot reach.

**The test is whether the counterparty is family, never the shape of the entry.**
A _flatmate_'s truncated name was tried here on the strength of looking like the
other two — it is one of the few entries that is not a full name, because SB1
truncates long ones — and it is wrong: none of its 131 rows is family, 129 are
the rent `rules/giro.json` already places, and filing it here moved 50 incoming
peer payments to `innskudd/familie`. It is a narrow `rules/overrides.json`
pattern instead.

`src/core/labels.ts` names them, from three sources in order — a gitignored
`rules/categories.json`, the bank's own `mainI18n`/`subI18n` read off the rows,
then the slug tidied. Mains and subs are looked up in **separate maps**: one slug
can be both and mean different things, `dagligvarer` being a main the bank calls
`Dagligvarer` and a sub it calls `Matvarer`. Tidying is right for most of what we
invent, which is what keeps that file down to five entries.

**A rule that names one level keeps the bank's subcategory**, when the bank
agrees about the category. Most of `rules/overrides.json` still names one level,
and discarding the second with it threw away a level the bank had already
supplied: `/\bSAS[\d ]/` says `reise` and the bank says `reise/flybilletter`.
The category matching is the guard — `PAYPAL BOOKING HOTEL` is a trip to us and
`hobby_og_fritid/digital_markedsplass` to the bank, and grafting that sub under
`reise` would invent a pair neither meant. Where the mains disagree the rule has
overruled the bank outright and its subcategory goes too. An excluded row takes
no sub at all: `reason` already says why it is out.

So a subcategory of **Annet** on the page means _our own rules named only one
level and the bank disagreed about the other_ — never that the bank sent nothing.
It has one on all 8 547 rows.

A category with exactly one _named_ subcategory reads as that subcategory —
`annet_lan_og_gjeld` is `Studielån` and nothing else, so the parent is the vaguer
of two names for one set of rows. A lone _unnamed_ child is not a better name and
keeps the parent's: `vipps` must not read as `Annet`.

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
  SB1 words the row after the _channel_ when the bill is paid by hand, and
  `Mobilgiro m/KID, forfall i dag` names no payee at all. The issuer is on that
  row only as `remoteAccountName`, which `normalize` drops wherever a
  `cleanedDescription` exists, so 4 941 kr read as spending against an excluded
  card credit.
- The card leg is the `Innbetaling` credit on the card account — singular, as
  SB1 words it; Enable Banking said `Innbetalinger`. It cannot ride on the
  amount+date transfer rule: the card is not a `mine` account, and the credit
  posts 0–3 days after the bank debits it anyway. Excluding only the bank leg
  leaves the credit counted as **income**.

Card credits that are _not_ a payment stay in: a `Varekjøp` credit is a merchant
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

An entry may also carry `sync: false`, meaning it exists for its _number_ alone —
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
It was the last fallback once, which left the bank's word for the _payment_ on
rows where the money never moved: a card bill filed as `Avgifter` on the giro
paying it and `Annet lån og gjeld` on the credit settling it. `reason` says why
a row is out, so the category has nothing to add. The toggle in `select.ts` is
the only thing that lists these, and every sum in `stats.ts` skips them before
it adds anything up, so the slug is a label for the audit view and never a
bucket money lands in.

## The card's own fields

Everything the statement CSV used to supply now arrives on the row, and more:

| field                             | what it is                                                                  |
| --------------------------------- | --------------------------------------------------------------------------- |
| `cleanedDescription`              | the merchant, `NAME, CITY, COUNTRY`, on every row                           |
| `description`                     | the same with the terminal number still on the front                        |
| `categories`                      | the bank's own `main`/`sub`, both i18n names and a confidence, on every row |
| `mcc` / `mccGroup`                | the merchant category, `-2` on the issuer's own rows                        |
| `currencyAmount` + `currencyCode` | what it cost in the currency it was paid in                                 |
| `remoteAccountNumber`             | `-1` except on the bill, where it names the paying account                  |

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
needed: SB1 reissues a reservation under a _new_ id once it books, and its
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
