# Roadmap

Status of the pipeline, and what a fresh agent needs to know before picking up a
step. Read `CLAUDE.md` first, then `src/types.ts`. API contracts live in
`.claude/skills/sb1-api/` and `.claude/skills/enable-banking/`.

## Done

**Steps 0–3 — ground truth, auth, config, sync.** Endpoints verified live rather
than assumed; `login`, `accounts` and `sync --month` work, idempotent per account
per month unless `--force`.

**Card access.** `eb-login` and `eb-sync --month` pull the credit card through
Enable Banking. Feb–Jul 2026 is on disk for both sources.

## Next

Everything below is pure and testable except the storage layer. Sync stays the
only thing that touches a network.

**Step 4 — normalize.** `src/normalize.ts`: flatten `data/raw/<month>/*.json`
into `Txn[]`. Two shapes go in (see the table in `CLAUDE.md`) and one comes out.
The traps: SB1 dates are epoch millis at Oslo midnight, so format with
`Europe/Oslo` or every month boundary shifts; card amounts are positive strings
whose sign lives in `credit_debit_indicator`. Commit to booking date and never
mix in `transaction_date`.

**Step 5 — exclusions.** `src/exclude.ts`: produce `Classified[]`. Flag, never
drop, and always set `reason`. Two rules: internal transfers between accounts
marked `mine` (both sides present — match amount + date + opposite sign), and
`Kredittbanken ASA` bill payments, which are now double-counting because the
card's own rows carry the spending.

**Step 6 — categorize.** `src/categorize.ts`: produce `Categorized[]`. Bank
category as the base layer, `overrides.json` (description pattern → category) on
top. Overrides stay out of source. Card rows have no bank category, so they get
their own bucket rather than falling into `ukategorisert` alongside SB1 rows
that merely failed classification.

**Step 7 — storage.** `src/db.ts` over `node:sqlite`, no ORM. One table of
`Categorized` rows keyed by `(source, id)`, upserted so a re-sync of a month is
idempotent. Indexed by month and category, since that is what every query does.
The database is derived: `rebuild` drops it and reconstructs from `data/raw/`,
and deleting the file must never lose anything.

**Step 8 — statistics.** `src/stats.ts`: pure aggregation over `Categorized[]`
for one month and for a year. Totals in and out, per-category with share of
month, top counterparties, subscriptions and recurring, month-over-month delta,
and per-month series for a year view. Card rows are ~40% of spending with no
merchant, so every aggregate must expose that share rather than burying it.

**Step 9 — dashboard.** `src/dashboard.ts` renders one self-contained HTML file
to `data/dashboard.html`, with the data embedded as JSON. Vanilla JS, inline
SVG, no framework, no chart library, no server, no network requests. Month
browsing, a year view, and filters. It contains every transaction, so it is
local-only and never published anywhere.

## Open questions

**Credit card transactions — solved, via a second API.** SpareBank 1's own
customer API cannot reach the card: it never appears in `/accounts` even with
`includeCreditCardAccounts=true`, `/personal/banking/credit/*` 403s, and the
logged-in portal offers a customer client exactly four APIs. The issuer's own
PSD2 portal is licensed-TPP-only. But the card *is* reachable through SMN's PSD2
interface as a `CARD` account, via Enable Banking, which holds the AISP licence
on our behalf. See `.claude/skills/enable-banking/SKILL.md`.

What this changed: the bills are now excluded as internal transfers, which is
what the original plan said, and the card's own transactions are the source of
card spending. That matters more than it sounds — bills and spending diverge
badly inside a month (April 2026: 35k paid against 22k spent; July: 5.7k paid
against 14.4k spent), so the bill-as-proxy approach was wrong month by month
even though the six-month totals nearly matched.

What it did **not** solve: card rows have no merchant, no MCC, and a generic
`Varekjøp` description. Amounts and dates are right; categorisation beyond a
single card bucket is impossible. That blind spot is worth stating in the
report, and the only route to detail is a statement export from the issuer.

February's 9 card rows against 76–136 later are not truncation — that is when
the card was opened. February is complete, just quiet.

**Pagination.** `rowLimit` exists on the SB1 transactions endpoints and we have
never set it. A month that returns a suspiciously round row count is the tell.
The Enable Banking side follows `continuation_key` and is covered by a test.

**Card posting lag.** Card transactions post late, and card rows can be `PDNG`,
so a July report run on 1 Aug misses the tail of July. Run around the 5th, or
re-run with `--force` — a re-synced recent month legitimately changes.

**Consent expiry.** The Enable Banking consent runs 90 days from 8 Aug 2026, so
`eb-sync` starts failing around **6 Nov 2026**. `eb-login` renews it. Only the
`CARD` account is linked; the deposit accounts were unlinked deliberately, since
the SB1 API serves those directly and there is no reason to route them through a
third party.

## Working in parallel

Steps 4–7 are a chain — each reads the previous one's output — but they split
cleanly by file if agents stay in their own lane:

| Step | Owns | Reads | Produces |
|---|---|---|---|
| 4 normalize | `src/normalize.ts` | `data/raw/` | `Txn[]` |
| 5 exclusions | `src/exclude.ts` | `Txn[]`, `accounts.json` | `Classified[]` |
| 6 categorize | `src/categorize.ts` | `Classified[]`, `overrides.json` | `Categorized[]` |
| 7 storage | `src/db.ts` | `Categorized[]` | `data/banking.db` |
| 8 statistics | `src/stats.ts` | `Categorized[]` | aggregates |
| 9 dashboard | `src/dashboard.ts` | `src/stats.ts` output | `data/dashboard.html` |

Steps 4 to 8 are independent of each other, because `src/types.ts` already fixes
the shape every one of them passes along. They can run at the same time. Step 9
is the exception: it consumes whatever `src/stats.ts` exports, so it starts once
step 8 has landed.

**Do not touch `src/cli.ts`.** Every step exports plain functions and is wired
into the CLI afterwards, in one pass. Four agents editing the same dispatch
block is the only guaranteed conflict in this repo, and it buys nothing.

Import types from `src/types.ts` rather than redeclaring them. If a type
genuinely has to change, say so out loud — every other step depends on it.
