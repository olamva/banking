/**
 * Does the transaction history explain the money that is actually there?
 *
 * Every row on an account, added to what the account held before the record
 * begins, must equal the balance the bank reports. This is the one check that
 * looks *outside* the repo for its answer: everything else here is the raw data
 * agreeing with itself, and a rule that quietly drops rows agrees with itself
 * perfectly. It is how a 27 950 kr cash deposit filed as an internal transfer
 * would have been caught in 2018 rather than in 2026.
 *
 * **Every row, excluded ones included.** This is a balance question, not a
 * spending one — money moved whether or not it counts as earning or spending,
 * so the exclusions are irrelevant here and using the counted rows alone would
 * make every internal transfer look like a hole.
 *
 * Pure and free of `node:` imports like the rest of `core/`: the caller supplies
 * the balances, which is also what keeps this offline. They come from
 * `data/raw/accounts.json`, written by `pnpm sb1 accounts`.
 */
import type { Accounts } from "./exclude.ts";
import type { Txn } from "./types.ts";

export type Line = {
  key: string;
  name: string;
  /** What the account held before the first row on record. */
  opening: number;
  /** Sum of every row we hold for it. */
  rows: number;
  /** What the balance should therefore be. */
  expected: number;
  /** What the bank says it is. */
  actual: number;
  /** `actual - expected`. Zero is the whole point. */
  gap: number;
  /** Rows counted, so a line with none is obviously a line with none. */
  count: number;
};

/**
 * One line per account the bank reported a balance for.
 *
 * An account with no `opening` is treated as having started at zero, which is
 * right for every account whose first transaction is its first transaction. It
 * is wrong only where the bank's history does not reach the account's opening —
 * SB1 serves nothing before 2003, so an account older than that arrives with
 * money already in it and no rows to explain it.
 */
export function reconcile(
  txns: Txn[],
  accounts: Accounts,
  balances: Map<string, number>,
): Line[] {
  const rows = new Map<string, number>();
  const count = new Map<string, number>();
  for (const t of txns) {
    rows.set(t.accountKey, (rows.get(t.accountKey) ?? 0) + t.amount);
    count.set(t.accountKey, (count.get(t.accountKey) ?? 0) + 1);
  }

  const out: Line[] = [];
  for (const [key, a] of Object.entries(accounts)) {
    const actual = balances.get(key);
    if (actual === undefined) continue;
    const opening = a.opening ?? 0;
    const summed = rows.get(key) ?? 0;
    const expected = opening + summed;
    out.push({
      key,
      name: a.name ?? key,
      opening,
      rows: summed,
      expected,
      actual,
      // Rounded to the øre: these are sums of floats, and a 0.000000001 residue
      // is not a discrepancy anyone should be told about. `|| 0` is not
      // decoration — rounding a tiny negative residue gives **-0**, which
      // prints as "−0,00" and reads as a hole that is not there.
      gap: Number((actual - expected).toFixed(2)) || 0,
      count: count.get(key) ?? 0,
    });
  }
  return out;
}

/** The lines that do not add up. Empty is a clean bill. */
export const unexplained = (lines: Line[]): Line[] =>
  lines.filter((l) => l.gap !== 0);
