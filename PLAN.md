# Roadmap

Status of the pipeline, and what a fresh agent needs to know before picking up a
step. Read `CLAUDE.md` first; the API contract lives in
`.claude/skills/sb1-api/SKILL.md`.

## Done

**Steps 0–3 — ground truth, auth, config, sync.** Endpoints verified live rather
than assumed; `login`, `accounts` and `sync --month` work. `sync` is idempotent
per account per month and skips existing files unless `--force`.

## Next

**Step 4 — normalize.** Flatten `data/raw/<month>/*.json` into the canonical
record in `CLAUDE.md`. Commit to booking date, formatted in `Europe/Oslo`, and
do not mix date fields later.

**Step 5 — exclusions.** Flag internal transfers, never drop them; the excluded
set has to be auditable. Both sides are present in the raw data.

**Step 6 — categorize.** Bank category as the base layer, `overrides.json`
(description pattern → category) on top. Overrides stay out of source.

**Step 7 — report.** `report --month YYYY-MM` emitting JSON and markdown:
category totals, top counterparties, subscriptions, delta vs previous month.

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

Also unresolved: February returns only 9 card rows against 76–136 in later
months. Either the card saw little use then or PSD2 history is truncated.
Worth a look before trusting any month that early.

**Pagination.** `rowLimit` exists on the transactions endpoints and we have never
set it. A month that returns a suspiciously round row count is the tell.

**Card posting lag.** Card transactions post late, so a July report run on 1 Aug
misses the tail of July. Run around the 5th, or re-run with `--force`.

## Working in parallel

Steps 4–7 are a chain — each reads the previous one's output — but they split
cleanly by file if agents stay in their own lane:

| Step | Owns | Reads |
|---|---|---|
| 4 normalize | `src/normalize.ts` | `data/raw/` |
| 5 exclusions | `src/exclude.ts` | canonical records |
| 6 categorize | `src/categorize.ts` | canonical records, `overrides.json` |
| 7 report | `src/report.ts` | all of the above |

`src/cli.ts` is shared — every step adds a command to it, so touch only your own
branch of the dispatch and expect to resolve it. `src/sb1.ts` should not need to
change unless you are adding an API call.

Agree the canonical record's exact TypeScript type before steps 5–7 start in
parallel, or they will each invent their own.
