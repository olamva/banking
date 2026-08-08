/**
 * The issuer's own statement export — the only place the card's merchant
 * appears. Enable Banking returns `creditor`, `merchant_category_code` and
 * `bank_transaction_code` as null on every card row, so the API can tell us
 * what a card transaction cost and when, but never what it was.
 *
 * This is a merchant lookup, not a source. Card rows still come from Enable
 * Banking, which has stable ids and is what `rebuild` reconstructs from; the
 * CSV has no transaction id at all, so it could never be keyed on. It only
 * fills in `counterparty`, which is null on card rows until it runs.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { Txn } from './types.ts';

export type StatementRow = {
  /** Posteringsdato — booking date, the same date Txn commits to. */
  date: string;
  /** Signed, negative is money out, matching Txn. */
  amount: number;
  merchant: string;
};

/** `-1 234,56` — Norwegian decimal comma, sometimes with thin-space grouping. */
function parseAmount(field: string): number {
  return Number(field.replace(/[\s ]/g, '').replace(',', '.'));
}

/**
 * The export is semicolon-separated with every field quoted and no embedded
 * separators, so a split is enough — a quote-aware parser would be dead code.
 * Columns: Kjøpsdato, Posteringsdato, Beskrivelse, Beløp, Kortholders fornavn.
 */
export function parseStatement(csv: string): StatementRow[] {
  const text = csv.charCodeAt(0) === 0xfeff ? csv.slice(1) : csv;
  return text
    .split(/\r?\n/)
    .slice(1)
    .filter((line) => line.trim())
    .map((line) => {
      const cells = line.split(';').map((c) => c.replace(/^"|"$/g, ''));
      return { date: cells[1]!, amount: parseAmount(cells[3]!), merchant: cells[2]! };
    });
}

/** Every CSV under the directory, so a fresh export is dropped in, not merged over. */
export function readStatements(dir = 'data/raw/card-statements'): StatementRow[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((name) => name.endsWith('.csv'))
    .flatMap((name) => parseStatement(readFileSync(join(dir, name), 'utf8')));
}

const key = (date: string, amount: number) => `${date}|${amount.toFixed(2)}`;

/**
 * Fills `counterparty` on card rows by matching booking date and amount, which
 * joins the two sources exactly — every card row on disk has a statement line.
 *
 * Where several rows share a date and an amount the assignment within that
 * group is arbitrary, and harmlessly so: the rows are equal in amount by
 * definition, so any permutation gives identical per-merchant totals. Only the
 * row-level pairing could differ, and nothing reports at that grain.
 *
 * `description` is deliberately left alone. It is the source's own wording and
 * the exclusion rules match on it — rewriting it here would quietly change
 * which rows count as bill payments.
 */
export function enrich(txns: Txn[], statement: StatementRow[]): Txn[] {
  const groups = new Map<string, string[]>();
  for (const row of statement) {
    const k = key(row.date, row.amount);
    const group = groups.get(k);
    if (group) group.push(row.merchant);
    else groups.set(k, [row.merchant]);
  }
  const used = new Map<string, number>();
  return txns.map((t) => {
    if (t.source !== 'card' || t.counterparty !== null) return t;
    const k = key(t.date, t.amount);
    const group = groups.get(k);
    if (!group) return t;
    const i = used.get(k) ?? 0;
    used.set(k, i + 1);
    const merchant = group[i] ?? group[group.length - 1]!;
    return { ...t, counterparty: merchant };
  });
}
