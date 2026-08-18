# banking

Personal spending analysis over the SpareBank 1 personal banking API. Pulls raw
transactions to disk once, then analyses them offline. Private repo, single
user. Not a product.

**The commands are in `README.md`.** `pnpm test` and `pnpm typecheck` both have
to pass before anything is finished. The API contract — endpoints, auth, rate
limits, the five-year range ceiling — is the `sb1-api` skill, not this file.

## Language

Write all prose in this repo in ASD-STE100 Simplified Technical English. This
covers chat replies, code comments, documentation, commit messages and pull
request bodies.

Use short sentences of 20 words or less. Use the active voice. Use one idea for
each sentence. Use the present tense. Do not use contractions, slang or
metaphors. Keep one meaning for each word. Start each instruction with the verb.
Do not change code or identifiers.

Prose written before 2026-08-19 does not follow this rule. Convert a file when
you edit it.

## Comments

Write almost no comments. Keep a comment only when it names a trap that the code
cannot show: a unit, a sign, an order, a platform limit, or a fact about the real
data. Use 40 words or less.

Delete file-header essays. Delete a comment block on a type, a constant or a
function when it only repeats the name. Delete design rationale and history. This
file holds the invariants. Keep every `ponytail:` marker.

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

Rewording the paragraphs above is a thing the Edit classifier refuses, whoever
asked and however the request is phrased — it reads any loosening of a git
safety rule as the edit it exists to stop, and there is no override to reach
for. Do not spend three attempts discovering that. **Say so and let the account
holder make the edit by hand**, which is the right hands for it anyway.

And nothing under `rules/` or `data/` is committable at all — the whole point of
them being gitignored, and the only reason a remote is safe here. That gitignore
is now what stands between the transactions and GitHub, so treat an edit to it as
an edit to a security control: never loosen the `data` or `rules` lines, and
never `git add -f` a path under either. Push is also not a licence to publish
anything else — the dashboard rule below is untouched, and a PR body carries no
account numbers, payee names or amounts.

**`rules/` is versioned, in its own git repo, on this machine only.** It has no
remote and must never be given one, and it is deliberately **not** a submodule:
a gitlink would put `rules` back on a tracked path here.

**An edit under `rules/` is finished only when it is committed there**, in the
same turn — this repo's `git status` stays clean however much of
`overrides.json` you rewrote, so an uncommitted rules change is invisible to
every later session:

```bash
git -C rules add -A && git -C rules commit -m "chore: ..."
```

This is required, not merely allowed, and it is the one commit the global
never-commit rule does not reach. It publishes nothing.

## Working in a worktree

`pnpm install` then `pnpm worktree:link` is the whole provisioning step — the
second symlinks `.env.local`, `data` and `rules` back to the main checkout.

**A change to `rules/` or `data/` cannot be made from a worktree**, and the
symlink is not a way round it: the isolation guard resolves the link back to the
shared path and refuses the write. There is also nothing to isolate, since no
commit carries those files. **Make a rules edit in the main checkout**, and do
not enter a worktree for a task that is only a rules edit.

**The Bash guard refuses compound commands inside an isolated session** —
heredocs, redirects, `&&` chains. It is syntactic, so arguing costs more than
obeying: write the script to `$CLAUDE_JOB_DIR/tmp` and run it in one plain call.

`EnterWorktree` branches from `origin/main`. Check the base before building on
it — a branch that looks stacked on work not on `main` is that going wrong.

## Layout

`src/` is split by **which half of the rule a file is on**: `net/` may make
requests, `core/` may not, `web/` composes them. If a new file's directory is
unobvious, ask which side of "analysis never calls the API" it sits on.

```
src/net/sb1.ts        auth, keychain, get(), monthRange()
src/net/sync.ts       the network half — nothing in core/ may import this
src/net/budget.ts     the bank's own remaining-request count, cached to disk

src/core/types.ts     Txn / Classified / Categorized — the shared contract
src/core/normalize.ts data/raw/<month>/*.json -> Txn[]
src/core/exclude.ts   Txn[] -> Classified[]; flags transfers and bill payments
src/core/categorize.ts Classified[] -> Categorized[]; bank category + overrides
src/core/names.ts     the shape a channel put on a name, taken back off. Knows
                      no payees; that is payees.json
src/core/db.ts        node:sqlite store, rebuilt wholesale
src/core/stats.ts     the only money aggregation
src/core/narrowings.ts which overrides.json lines depend on their position
src/core/reconcile.ts opening + every row == the balance the bank reports
src/core/select.ts    which rows are in view; no money logic, ever
src/core/pipeline.ts  the offline chain, importable by the CLI and Vite

src/web/app/          the React app: App, FilterBar, Charts, Cards, icons
src/cli.ts            command dispatch

vite.config.ts    pnpm dev — the app, plus /api/txns. No build step, no dist/
test/             node --test, mirroring src/
data/raw/         API responses, verbatim, gitignored
data/banking.db   derived SQLite store, rebuildable from data/raw, gitignored
rules/*.json      hand-edited, gitignored — accounts, overrides, giro, family,
                  payees, subscriptions, categories
```

`data/raw/` is the source of truth: the only thing that costs an API call to
reproduce. The database is **derived and disposable**.

Everything under `src/core/` is imported by **both** Node and the browser, so it
must stay free of `node:` imports. That is what lets the page aggregate with the
exact code `node --test` pins.

## Rules

**Analysis never calls the API.** Fetching lives in `src/net/`; everything
downstream reads `data/raw/`. **Nothing in `src/core/` may import from
`src/net/`**, including indirectly. If an analysis step needs a field that isn't
in the raw JSON, extend `sync` and re-run it.

**The dev server never calls the API either.** `/api/txns` lives in
`vite.config.ts`, reads only `data/banking.db`, and no page view can cost a
request. Syncing is `pnpm sb1 sync`, run by hand.

**Raw is immutable.** Never rewrite a file under `data/raw/` in place. Re-sync
with `--force` if the bank restates a month.

**Every SB1 request is ledgered against the bank's own count.** `sb1.get` and
the token exchange call `budget.spend` before the request and `sb1.noteLimits`
after it. Anything bypassing `sb1.get` gets none of this, so don't. There is no
local cap and must not be one — the quota refills continuously, so a rolling
window of our own timestamps refuses long after the bank would say yes.

**Dates are Oslo-local.** The API's `date` is epoch millis at _Norwegian_
midnight, so every summer timestamp is `22:00Z`. Format with `Europe/Oslo`
— UTC moves the 1st of the month into the previous month.

**Nothing personal enters git, or the network.** No account numbers, keys,
names, balances or descriptions in source, tests, fixtures, commit messages or
docs. JSON and CSV output are unredacted.

The dashboard is **served on 127.0.0.1 and read locally**. Never publish it —
not as a hosted artifact, not to a gist, not to any preview or sharing service.
It embeds every transaction you have. Same rule for screenshots.

**The dependency list is short on purpose.** React, Vite, Tailwind v4 and
Hugeicons, for the dashboard and nothing else. Hugeicons is imported one icon
module at a time through `src/web/app/icons.ts` — its barrel export is 6 MB and
there is no build step to tree-shake it. Everything server-side is stdlib:
Node's built-in TS execution, `fetch`, `node:sqlite`, the macOS `security`
keychain. No ORM, no chart library, no component library, no state manager, no
router, no date library. Check first if you think another package is warranted.

**There is no build step.** `pnpm dev` is Vite, which serves the app and
`/api/txns` from one config. The page is only ever served to localhost, which is
what makes that safe. Don't add `vite build` — there is no production.

**Money logic leaves a test behind.** Anything that signs, sums, excludes or
categorises gets one `node --test` case in `test/`. No frameworks, no fixtures
built from real transactions. The React components are deliberately dumb so this
stays possible: logic worth testing belongs in `src/core/`.

## Data model

`src/core/types.ts` defines `Txn`. Read it before writing anything downstream,
and treat widening it as a cross-cutting change to announce.

One source: `data/raw/<month>/<accountKey>.json`, the credit card included.

`Txn.date` — SB1 dates a card row by the **purchase**, one to three days before
the booking, and no list endpoint carries a booking date. So card rows are
purchase-dated, deliberately, and about a dozen a month land the other side of a
month boundary. Deposit rows are booking-dated.

`Txn.account` is **the account's name**, from `rules/accounts.json`, because
`stats.ts` runs in the browser where there is no rules file to look one up in —
and a key is a local secret that must never be a label on the page.

`Txn.country` is **the terminal's country, where the row carries one**. The card
sends `NAME, CITY, COUNTRY`, so three comma segments is the whole parse and the
whole guard. Read off `cleanedDescription` in `normalize`, **before any rename**.
It is a chip and a filter axis, never a money field — and the travel guess in
`categorize` reads the name's own tail and is deliberately untouched by it.

`bookingStatus: PENDING` rows are **dropped in `normalize`**, on every account:
a reservation is reissued under a new id when it books and its amount can still
move, so keeping it is how one purchase becomes two rows.

Two rules need to know which account is the credit card, and both read
`card: true` from `rules/accounts.json`: `billReason`, and the travel guess.

Notes from the real data:

- SB1's list endpoint has no _merchant_ field — use `cleanedDescription`. It
  carries `remoteAccountName` too, the other party as the payer typed it; it is
  the fallback, never the first choice, and earns its place on the rows that
  have no `cleanedDescription` at all.
- `recurring` and `subscription` have been identical on every row so far. The
  bank sets them on standing payments and also guesses them from the merchant,
  where it is wrong as often as right — `rules/subscriptions.json` is what makes
  a subscription certain.
- A name does **not** on its own mean a peer payment. A flatmate is two
  relationships at once — small instant payments, and a standing monthly
  transfer — and the description is the bare name in both. `typeText` splits
  them: instant or card is a peer payment, a giro or plain `Overførsel` is a
  lump. But the type says how the money moved and never why, so
  `rules/giro.json` maps the name to what its lumps _are_.
- One payee can bill two unrelated things under one name, differing only in
  `remoteAccountNumber` — which is why that field is on `Txn` and in the
  override haystack.
- **SB1 sends a subcategory too, and it is where the signal is.** Every booked
  row carries `main`, `sub`, `mainI18n`, `subI18n` and a `confidence`. Categories
  are not always one entry at confidence 100 — a few hundred rows carry two or
  three candidates, sorted by confidence down, and `normalize` keeps the first.
- **Income and spending split on the sign, not on the category.** No category
  can move money between the two totals. Taking something out of income means
  excluding it in `exclude.ts`, which is a money change with a netting invariant
  — not a rules edit.
- A **spending category with income in it is expected**: a merchant refund is
  money in filed where it went out, and `Income by category` says so rather than
  hiding it. Both sides reconcile to the øre.
- **`merchant` is the page's word, `counterparty` is the data's**, and the two
  are deliberately not reconciled.
- **The bars are red for spending and green for income** — one card is one
  direction and its title says which, so the pair never has to be told apart by
  colour alone. The moment both tones share one chart, that stops being true and
  the colour needs re-picking.

## Categorising

`categorize` runs its rules in this order, and the order is the design:

1. **excluded** -> `overfoering`, above everything. `reason` says why a row is
   out, so the category has nothing to add.
2. `rules/overrides.json` — pattern -> `category/sub`.
3. `rules/giro.json`, gated on the row being a lump.
4. `rules/family.json`, below the lump rule so pocket money keeps the better
   label, above the Vipps rules which would call every gift a peer payment.
5. The two Vipps peer shapes, above the bank's own category — letting
   `diverse/overforing` stand is what files a peer payment as a transfer.
6. The bank's own pair.
7. The travel guess, card rows only.

**Every line in `rules/overrides.json` is location-agnostic.** `categorize`
takes the first pattern that matches, so the file _can_ behave as a sequence —
but it must not: two lines claiming the same row under different categories make
the order load-bearing and invisible. The rule is that **the file may be sorted,
grouped or reordered freely and every row must land exactly where it did.**

Fix it in the _pattern_, never in the matcher or the ordering. `rebuild` prints
every offending pair and the narrowed form of the loser —
`/^(?!.*(?:sit kafe))(?=.*\bsit\b)/`, a refusal lookahead and a requirement
lookahead, neither consuming anything. Collisions where both lines name the same
category are harmless and left alone.

**A name is either known or merely shaped, and the two never mix.**
`rules/payees.json` carries knowledge — that NSB is Vy, that two spellings are
one bookshop. `src/core/names.ts` carries the opposite: the formatting SB1 wraps
every name in, which is mechanical. It runs only on what no rule claimed, and a
rule's name is used exactly as written — letting the cleaner touch one would
return `IKEA` as `Ikea`. A rename can never move money, which is the property
that makes the file safe to edit.

**`rules/family.json` names relatives, and the sign is what the entry decides,
not whether it applies**: money in is `innskudd/familie`, money out to the same
person is you paying a relative back, `diverse/vennebetaling`. The category
enforces it — `innskudd` is the bank's income main, so an outgoing row filed
there would be a contradiction. An entry may be an account number as well as a
name, for the plain `Overføring` rows the bank names no payee on. **The test is
whether the counterparty is family, never the shape of the entry.**

**Every rule names both levels.** A rule that names one takes no subcategory at
all and reaches the page as that category with `Annet` under it. The bank never
sends a bare main, so that shape is ours alone. Where two readings share a
payee, narrow the pattern until each says one thing.

`src/core/labels.ts` names the slugs, from three sources in order:
`rules/categories.json`, the bank's own `mainI18n`/`subI18n` off the rows, then
the slug tidied. Mains and subs are looked up in **separate maps** — one slug
can be both and mean different things.

A category with exactly one _named_ subcategory reads as that subcategory. A
lone _unnamed_ child is not a better name and keeps the parent's.

## The page's two-level categories

**`Filters.categories` holds both levels in one list** — a bare `dagligvarer`
beside a pair `dagligvarer/andre_dagligvarer`, matching if either is listed. Two
axes would AND, asking for rows that are both at once and drawing an empty page.
A tree with checkboxes means a union, and one list gives a union for nothing.

A pair is always `category/sub`, never a bare sub: `dagligvarer` is a sub under
itself and `kollektivtransport` sits under two mains.

**Every axis is two lists, not one list and a mode** — `categories` beside
`categoriesOut`, which is what `AXES` pairs up. A mode made the two readings
exclusive, so "only `innskudd`" and "not `innskudd/familie`" could not both be
said, and the exception to a filter lives on the filter's own axis. The order is
fixed: **an exclusion wins**, and an empty include list is still every row.

**Which list a tick joins is the modifier**: a plain tick includes, ⌘/ctrl-click
excludes — the same gesture the charts and the table already use. Both lists
tick the same checkboxes and an excluded one is red; **unticking always clears**,
because a ticked box is a filter that is on. The old `_mode=exclude` spelling is
still read out of a URL and moved to the `_not` side.

**The country axis needed no fourth kind of control.** Its one difference is
that most rows have no country, so an empty list cannot mean "everywhere":
`NO_COUNTRY` is a real value in the list, and without it "only the domestic
rows" would quietly mean "only the card ones".

**`diverse` is the bank's largest main and it is kept**, subcategories and all.
It reads like a catch-all and is not one at the pair level: `vennebetaling`,
`overforing`, `renter_og_gebyrer`, `minibank`, `skatt`. `BANK_CATCH_ALL` holds
`ukategorisert` alone, and `OURS` renames exactly one main —
`faste_boutgifter`, because it is not only housing.

## Exclusions

Internal transfers are **flagged, never dropped** — the excluded set has to be
auditable. Both sides are present because every account is synced, so match on
amount + date + opposite sign, restricted to accounts marked `mine`.

**Amount + date + opposite sign is not enough on its own.** It is a weak signal
at these volumes: 22 kr of deposit interest against a 22 kr coffee is a perfect
match, and every such collision deletes real money from the totals. So **both
legs must also be typed as a transfer by the bank** — `Txn.typeText` matched on
the stem `overfør`. Check both legs, never one.

**Pairing is 1:1, and that is not the same as "a counterpart exists".** An
existence check lets two +200 rows and one −200 row all answer yes.
`transferPairs` decides the pairing once per month and consumes each leg, and
the two legs must sit on different accounts.

**A row that names one of my own accounts skips all of that.**
`remoteAccountNumber` against the `number` field in `rules/accounts.json` is
proof, not coincidence, so it needs neither a transfer type nor a counterpart
search — and it stays symmetric, since each leg carries the other's number. It
is the only rule that sees a self-transfer the bank did not type as one.

**A number on a row is not always a counterparty.** Nothing moves between an
account and itself, so the row's own number never counts. And **a cash deposit
is never a transfer** — the machine stamps `remoteAccountNumber` with whichever
of my accounts the card belonged to, and there is no second leg because the
money came from a pocket.

Credit card bill payments are **excluded**, like any internal transfer, and a
bill has **two legs that must both go**. Match the bank leg on the issuer's
collection account number, named by `issuer: true`; the name is the fallback,
and `Kredittbanken` rather than `Kredittbanken ASA`, since the issuer also books
these as `Kredittbanken - del av SpareBank 1`. The card leg is the `Innbetaling`
credit, which cannot ride on the amount+date rule: the card is not `mine`, and
the credit posts 0–3 days later. Card credits that are _not_ a payment stay in —
a merchant refund and cashback are both real. The two legs land in different
months about once a quarter, so the reason nets to zero **across the record, not
within every month**.

Buying and selling funds is **excluded as `investment movement`**, both
directions, named by `investment: true`. That reason is **one-sided by design
and exempt from the netting check**: the counter-leg is booked at the fund
manager and is not in `data/raw/` at all.

An entry may carry `sync: false`, meaning it exists for its _number_ alone;
`from`, the `YYYY-MM` that account first saw activity, which `accountKeys` skips
below; and `opening`, the kroner in the account before the first row on record —
SB1 serves no history before 2003, so an older account arrives already holding
something. `opening` is a **balance, and no money total may read it.** Its only
reader is `reconcile`.

**A floor makes itself unfalsifiable**: a `from` means no sweep ever asks below
it, so there are no empty files to prove it right. To test one, drop it and
re-sweep.

**`pnpm sb1 reconcile` is the one check that looks outside the repo** — opening
plus every row against the balance the bank reports, per account, offline.
Everything else here is the raw data agreeing with itself, and a rule that
quietly drops rows agrees with itself perfectly. It takes `Txn`, **before
anything is flagged, and counts excluded rows too**: money moved whether or not
it counts as earning or spending. A gap means, in the order worth trying: the
balances are stale, rows are missing, or an `opening` is owed.

**Every excluded reason must net to zero across its pair** — `investment
movement` excepted — and that check runs at every `rebuild`. `netByReason` sums
the excluded rows by reason and warns on anything non-zero. The two card-bill
legs fold into one bucket first: they are one pair under two names.

## The page is read on a phone

`pnpm dev` binds to 127.0.0.1, and the machine serving it is on the same wifi as
the phone in your hand. So **the narrow window is a supported width**, and every
UI change is finished only once it has been looked at at **375 CSS px**.

There is no separate mobile page and there must not be one. One layout that
bends, because two layouts is two of everything to keep in step.

**Nothing may make the page scroll sideways.** That is the single test the rest
of this section serves. Two things caused it here, and both are the same
mistake: _a width that was written down instead of asked for._

- **A grid track's minimum is a floor, and a floor wider than the phone is the
  bug.** Always `minmax(min(460px, 100%), 1fr)`. `test/web/app/layout.test.ts`
  refuses the bare form anywhere in `src/web/app/`.
- **An absolutely-positioned panel is anchored wherever its trigger wrapped
  to.** The fix is `max-sm:w-full` on the `details`, not a narrower panel —
  which only moves the width at which it breaks.

**Charts measure, they never assume.** `useWidth` is a `ResizeObserver`; every
chart reads its box through it, draws into a `viewBox` and recomputes its label
stride against `clusterW`. A hardcoded chart width, or a label gutter in fixed
pixels, is the first rule one level down.

**Any field you can focus is 16px below `sm`.** iOS Safari zooms the page in on
a control whose text is smaller and does not zoom back out. One unlayered media
query in `index.css` does it for every input and select at once; it has to stay
_outside_ `@layer`, or it loses to `text-sm` on the element. Do not reach for
`maximum-scale=1`, which fixes it by taking pinch-zoom from everyone.

**Hover and meta-click are shortcuts, never the only route.** A phone has
neither. Every number a tooltip gives must be readable somewhere else, and a
gesture behind a modifier key wants a plain control that does the same thing.

**Excluding is the standing exception, knowingly.** Meta-click and meta-Enter
are the only way to _put_ a value on an exclusion list. Exclusions still show on
the page and in the filter summary, and a plain tap clears one, so a phone can
read and undo them and only cannot author them. If that bites, the twin that
costs nothing is a plain tap cycling off -> only -> except.

**A tap is a `pointerdown` and a `pointerup` with no `pointermove` between
them**, so a chart bound only to `onPointerMove` has no reading on a phone —
which is why the plot catches `onPointerDown` too. The matching trap is the
other way round: no `touch-action: none` on a plot, or the chart eats the page's
scroll.

**Touch targets are the one thing the density does not get to win.** Widen the
hit area with a `before:absolute before:-inset-2` pseudo-element rather than by
resizing the control, so the columns stay lined up.

**Wide content scrolls inside its own box.** `DataTable` wraps itself in
`overflow-x-auto`. Anything else that cannot shrink gets the same treatment.

## Rows only enter the database by rebuild

`rebuild` wipes the table and reconstructs from `data/raw/`. There is no
incremental path, and adding one back needs more thought than it looks: **SB1
reissues a transaction under a new id every time it is fetched**, and again when
a reservation books, so nothing keyed on `id` can be stable across syncs. An
upsert has no way to notice a row it did not produce.

Deleting just the affected month would not fix it either — a directory owning
its month is a property of today's endpoints, not an invariant.

At a few thousand rows this takes a few hundred milliseconds. Revisit when that
stops being true, not before.
