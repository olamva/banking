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

**Step 6 — categorize.** Bank category as the base layer, `overrides.json`
(description pattern → category) on top. Overrides stay out of source. Card rows
have no bank category, so they need their own bucket rather than falling into
`ukategorisert` alongside SB1 rows that merely failed classification.

**Step 7 — report.** `report --month YYYY-MM` emitting JSON and markdown:
category totals, top counterparties, subscriptions, delta vs previous month.
State the card bucket's share of the month explicitly — it is ~40% of spending
with no merchant detail, and a report that hides that is misleading.

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
| 5 exclusions | `src/exclude.ts` | `Txn[]` | `Classified[]` |
| 6 categorize | `src/categorize.ts` | `Classified[]`, `overrides.json` | categories |
| 7 report | `src/report.ts` | all of the above | JSON + markdown |

The shared type is settled: `src/types.ts` holds `Txn` and `Classified`, so no
step needs to invent its own shape. Import from there rather than redeclaring,
and if the type genuinely has to change, say so — every other step depends on it.

`src/cli.ts` is shared. Every step adds one command to the dispatch, so touch
only your own branch of it and expect a small conflict. `src/sb1.ts` and
`src/eb.ts` should not need changes unless you are adding an API call.

Step 4 blocks the rest in practice. Steps 5, 6 and 7 can start once `Txn` is
being produced from real files — before that they have nothing to run against.
