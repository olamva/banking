import type { Accounts } from "./exclude.ts";
import type { Txn } from "./types.ts";

export type Line = {
  key: string;
  name: string;
  opening: number;
  rows: number;
  expected: number;
  actual: number;
  gap: number;
  count: number;
};

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
      gap: Number((actual - expected).toFixed(2)) || 0,
      count: count.get(key) ?? 0,
    });
  }
  return out;
}

export const unexplained = (lines: Line[]): Line[] =>
  lines.filter((l) => l.gap !== 0);
