---
name: banking-cli
description: The `banking` command line interface over the offline transaction store — commands, filters, output shape and the traps in the filter values. Use when you answer a question about the money from a shell, when you script a report, or when a command returns fewer rows than you expect.
---

# The banking CLI

`src/bank.ts` reads `data/banking.db` and `rules/`. It writes JSON to stdout.

**It never calls SpareBank 1 or Azure.** It spends no API quota. It shows the
data of the last rebuild and nothing newer. Press Refresh on the dashboard to
fetch new transactions, or run `pnpm sb1 rebuild` after a rules edit.

```bash
pnpm bank <command>      # in this checkout
banking <command>        # after the README link, from any directory
```

The global command reads this checkout, whatever directory is current.

## Commands

| Command            | Result                                             |
| ------------------ | -------------------------------------------------- |
| `balances`         | the cached account balances                        |
| `transactions`     | the matching rows                                  |
| `transaction <id>` | one row                                            |
| `totals`           | `totalIn`, `totalOut`, `net` and an `excluded` pair |

`transactions`, `transaction` and `totals` take the filters. `transaction` takes
the id first.

**`balances` ignores every filter, and it reports no error.** It reads a
snapshot, `data/raw/accounts.json`, which `pnpm sb1 accounts` writes. The
`capturedAt` field gives the age of that snapshot. A refresh does not update it.

## Filters

| Option               | Effect                                            |
| -------------------- | ------------------------------------------------- |
| `--from YYYY-MM-DD`  | on or after this date                             |
| `--to YYYY-MM-DD`    | on or before this date                            |
| `--account NAME`     | repeat to add more accounts                       |
| `--category MAIN[/SUB]` | repeat to add more categories                  |
| `--search TEXT`      | substring of the description or the counterparty  |
| `--include-excluded` | keep the transfers and the bill payments          |
| `--limit N`          | `transactions` only                               |

Repeating an option makes a union. Two different options make an intersection.

```bash
banking totals --from 2026-01-01 --to 2026-08-31
banking transactions --category dagligvarer --limit 20
banking transactions --account "Some name" --search coop --include-excluded
```

## The traps

**A filter value is an exact string, and the match is case sensitive.** Only
`--search` is a substring, and only `--search` ignores case.

**`--account` takes the account name, not the key.** `rules/accounts.json` holds
the pair. `Txn.account` carries the name.

**A category value is `main` or `main/sub`. A bare sub matches nothing.**
`dagligvarer` matches every row of that main. `dagligvarer/andre_dagligvarer`
matches one pair. A row with no subcategory reads as `main/`, so `--category
diverse/` is how you ask for it.

**`--limit N` returns the LAST N rows, not the first.** The rows arrive in the
order of `queryRange`, so a limit gives you the most recent ones.

**An excluded row is out of every total by default.** An internal transfer, a
credit card bill and a fund movement are all flagged, not deleted.
`--include-excluded` puts them back, and it makes `totals` count money that
never left. Use it to audit, never to report.

**`--from` and `--to` compare the date string.** Dates are Oslo-local, so a
month boundary needs no timezone care here.

**A card row carries the purchase date, not the booking date.** About twelve
rows each month therefore fall in the month beside the one on the statement.

## Output

`transactions` and `transaction` write `Categorized` rows. Read
`src/core/types.ts` for the fields. `amount` is signed, and a negative amount is
money out.

The filters come from `src/core/select.ts` and the sums from `src/core/stats.ts`.
The dashboard imports the same two files, so a CLI number and a page number
agree.

**The output is unredacted.** It holds payee names, amounts and account numbers.
Never paste it into a commit message, a PR body, an issue or a chat with a third
party.
