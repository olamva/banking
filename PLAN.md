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

**Are credit card transactions missing?** July has a `-5738.00` payment to
`Kredittbanken ASA`, which reads like a credit card bill — not spending in
itself. But no card account comes back from `/accounts` even with
`includeCreditCardAccounts=true`, and both `/personal/banking/credit/*`
endpoints 403. So either there is no card (the payment is a loan or similar and
nothing is missing), or the card's own transactions are unreachable and every
report undercounts. Until this is settled, a report that excludes the bill must
say so on its face rather than quietly dropping it.

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
