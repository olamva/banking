# banking

Personal spending analysis over the SpareBank 1 personal banking API. Pulls raw
transactions to disk once, then analyses them offline.

Private repo, single user, personal use. Not a product.

## Commands

```bash
pnpm sb1 login                      # BankID in the browser, stores refresh token in keychain
pnpm sb1 accounts                   # writes data/raw/accounts.json + accounts.json
pnpm sb1 sync --month YYYY-MM       # writes data/raw/YYYY-MM/<accountKey>.json, skips existing
pnpm sb1 sync --month YYYY-MM --force
pnpm test                           # node --test, no framework
pnpm typecheck
```

## Layout

```
src/sb1.ts        auth, keychain, get(), monthRange()
src/cli.ts        command dispatch and the sync/accounts commands
data/raw/         API responses, verbatim, gitignored
accounts.json     which accounts are mine (hand-edited), gitignored
overrides.json    description pattern -> category, gitignored
```

## Rules

**Analysis never calls the API.** `sync` is the only thing that talks to the
bank. Everything downstream reads `data/raw/`. If an analysis command needs a
field that isn't in the raw JSON, extend `sync`, re-run it, and commit nothing.

**Raw is immutable.** Never rewrite a file under `data/raw/` in place. Re-sync
with `--force` if the bank restates a month.

**Dates are Oslo-local.** The API's `date` is epoch millis at *Norwegian*
midnight, so every July timestamp is `22:00Z`. Format with
`Europe/Oslo`, never UTC — UTC shifts every transaction back one day and moves
the 1st of the month into the previous month.

**Nothing personal enters git.** No account numbers, account keys, names,
balances or descriptions in source, tests, fixtures, commit messages or docs.
`.env.local`, `data/`, `accounts.json` and `overrides.json` are gitignored;
keep it that way. JSON and CSV output are unredacted — strip account numbers
before anything leaves the machine.

**Zero runtime dependencies.** Node's built-in TS execution, `fetch`,
`node:http` and the macOS `security` keychain cover the whole job. devDeps are
typescript and @types/node only. Don't add a package for something a few lines
of stdlib does; check with me first if you think one is genuinely warranted.

**Money logic leaves a test behind.** Anything that signs, sums, excludes or
categorises gets one `node --test` case in `src/*.test.ts`. No frameworks, no
fixtures built from real transactions.

## Data model

The canonical record, committed to **booking date**:

```
id, accountKey, date, amount (signed), description, counterparty,
bankCategory, isRecurring, isSubscription
```

Notes from the real data, not the plan:

- There is no counterparty field on the list endpoint. Use `cleanedDescription`.
  Structured counterparty exists only on `/transactions/{id}/details`, one call
  per transaction — not worth it.
- `recurring` and `subscription` have been identical on every row so far. Keep
  both, expect one bit of signal.
- Categories are always exactly one entry at confidence 100. `diverse` +
  `ukategorisert` is ~40% of rows, so `overrides.json` does real work.

## Exclusions

Internal transfers are **flagged, never dropped** — the excluded set has to be
auditable. Both sides of a transfer are present because we sync every account,
so match on amount + date + opposite sign, restricted to accounts marked `mine`
in `accounts.json`.

Credit card bill payments (`Kredittbanken ASA`) are **excluded**, like any
internal transfer. The card's own transactions come from Enable Banking, so
counting the bills as well would double-count. Bill amounts and card spend
diverge wildly within a month — April 2026 paid 35k against 22k of spending —
so the bills are worthless as a spending proxy anyway.

Card spending has **no merchant**: `creditor`, `merchant_category_code` and
`bank_transaction_code` are null on every row, and 68 of 76 July rows carry only
`Varekjøp` as remittance information. So card rows are correct in amount and
date but cannot be categorised beyond a single card bucket. The report should
say what share of the month that bucket is, since it is the blind spot.
