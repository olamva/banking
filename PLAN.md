# Roadmap

Status of the pipeline, and what a fresh agent needs to know before picking up
work. Read `.claude/CLAUDE.md` first, then `src/types.ts`. API contracts live in
`.claude/skills/sb1-api/` and `.claude/skills/enable-banking/`.

## Done

**Steps 0–3 — ground truth, auth, config, sync.** Endpoints verified live rather
than assumed; `login`, `accounts` and `sync --month` work, idempotent per account
per month unless `--force`.

**Card access.** `eb-login` and `eb-sync --month` pull the credit card through
Enable Banking. Feb–Jul 2026 is on disk for both sources.

**Steps 4–9 — the offline pipeline.** `normalize` → `exclude` → `categorize` →
`db` → `stats` → `dashboard`, wired into the CLI as `import`, `rebuild`,
`report` and `dashboard`. Built in parallel worktrees and merged in one pass.

`src/stats.ts` is the single implementation of every money aggregation.
`src/dashboard.ts` contains none of its own: it embeds `STATS_FNS` into the
page with `.toString()`, so the browser re-filters using the same code
`node --test` pins. Add a helper to `stats.ts` and it must go in `STATS_FNS`
too, or the page throws a `ReferenceError` that no Node test would catch —
`dashboard.test.ts` evaluates the embedded source to keep that honest.

## Verified against the real data

First full run over Feb–Jul 2026, 1067 rows. What it caught:

- **Both legs of a card bill payment have to be excluded.** Only the bank leg
  was, so the card's `Innbetalinger` credit was counted as income — six months
  of income overstated by the full bill total. See the exclusions section of
  `CLAUDE.md`; the rule is now description-based on both sides because the legs
  post 0–3 days apart and cannot be paired on amount+date.
- **The bank leg matches on `Kredittbanken`, not `Kredittbanken ASA`.** The
  narrower string missed the rows the issuer books under its other name.
- **Card rows with `booking_date: null` must be dropped, not dated from
  `transaction_date`.** The same handful of pending rows comes back in every
  month's response regardless of the query range, so anything that keeps them
  counts them once per month synced.

Invariants worth re-checking after any change to `exclude.ts`: every excluded
row has a reason, internal transfers net to zero, and each bill-payment pair
nets to zero. If a pair does not, one leg is being matched and the other is not.

## Open questions

**Categorisation is the remaining hole, and it is bigger than the card.**
Roughly 60% of bank-account spending lands in `ukategorisert`, and it is not a
long tail — a handful of large recurring payments dominate it, all from one
counterparty the bank spells two different ways. `overrides.json` matches on a
case-insensitive substring of `description`, so one entry collapses most of it.
The file does not exist yet; it is hand-edited and gitignored.

Card rows are a separate bucket and never fall into `ukategorisert` — the two
blind spots do not overlap, they add up.

**Card detail is unreachable.** Card rows have no merchant, no MCC, and a
generic `Varekjøp` description. Amounts and dates are right; categorisation
beyond a single card bucket is impossible. The only route to detail is a
statement export from the issuer.

**Pagination.** `rowLimit` exists on the SB1 transactions endpoints and we have
never set it. No month has come back truncated so far — the largest single
account-month is well under any plausible default, and every response carries an
empty `errors` array — but that is luck, not proof. A suspiciously round row
count is the tell. The Enable Banking side follows `continuation_key` and is
covered by a test.

**Card posting lag.** Card transactions post late, and card rows can be `PDNG`,
so a July report run on 1 Aug misses the tail of July. Run around the 5th, or
re-run with `--force` — a re-synced recent month legitimately changes.

Re-syncing an SB1 month with `--force` rewrites the file even when nothing
changed: `classificationInput.id` is a fresh UUID per response. Compare row
counts and ids, not file hashes.

**Consent expiry.** The Enable Banking consent runs 90 days from 8 Aug 2026, so
`eb-sync` starts failing around **6 Nov 2026**. `eb-login` renews it. Only the
`CARD` account is linked; the deposit accounts were unlinked deliberately, since
the SB1 API serves those directly and there is no reason to route them through a
third party.
