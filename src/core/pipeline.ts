/**
 * The offline half, in one place so the CLI and the dev server run identically.
 *
 * Nothing here imports sb1.ts or eb.ts, and nothing here may: analysis never
 * calls the API. That rule is enforced by this file's import list — keep it
 * that way.
 */
import { mkdir, readFile } from 'node:fs/promises';
import { readdirSync, rmSync } from 'node:fs';
import { normalizeMonth } from './normalize.ts';
import { enrich, readStatements } from './statement.ts';
import { exclude, type Accounts } from './exclude.ts';
import {
  categorize,
  loadGiro,
  loadOverrides,
  loadPayees,
  loadPeers,
  loadSubscriptions,
  renamePayees,
} from './categorize.ts';
import { openDb, rebuild as rebuildDb } from './db.ts';
import type { Categorized } from './types.ts';

export const DB_FILE = 'data/banking.db';
export const RAW = 'data/raw';

/** Every YYYY-MM directory under data/raw/, ascending. */
export function monthsOnDisk(): string[] {
  return readdirSync(RAW, { withFileTypes: true })
    .filter((e) => e.isDirectory() && /^\d{4}-\d{2}$/.test(e.name))
    .map((e) => e.name)
    .sort();
}

/**
 * One month's raw files, from normalize to categorize, plus the merchant lookup.
 *
 * Exclusion runs per month because both legs of an internal transfer share a
 * date and so can never land in different months. Enrichment goes first, so the
 * merchant is available to overrides, and it writes only `counterparty`, so the
 * exclusion rules still match the source's own description.
 */
export async function pipeline(month: string): Promise<Categorized[]> {
  const accounts: Accounts = JSON.parse(await readFile('rules/accounts.json', 'utf8'));
  const txns = enrich(normalizeMonth(`${RAW}/${month}`), readStatements());
  const rows = categorize(
    exclude(txns, accounts),
    await loadOverrides(),
    await loadSubscriptions(),
    await loadPeers(),
    await loadGiro(),
  );
  // Last, so every rule above matched the name the bank actually sent.
  return renamePayees(rows, await loadPayees());
}

/**
 * The database is derived and disposable: delete it and reconstruct from
 * data/raw/ alone.
 *
 * This is the only way rows get in, and deliberately so. An incremental upsert
 * keyed on `(source, id)` used to exist alongside it, and it was wrong: SB1
 * reissues a transaction under a *new* id when a reservation becomes booked, so
 * re-syncing a month still in flight left the old id behind as a second row.
 * One 18 000 kr rent payment showed up twice, and no amount of re-importing
 * cleared it, because an upsert has no way to notice a row it did not produce.
 *
 * A full reconstruct is a few hundred milliseconds at this size and has no such
 * failure mode. Revisit only when that stops being true.
 */
export async function rebuildAll(): Promise<number> {
  rmSync(DB_FILE, { force: true });
  await mkdir('data', { recursive: true });
  const db = openDb(DB_FILE);
  try {
    const months = monthsOnDisk();
    const rows: Categorized[] = [];
    for (const month of months) {
      // A row the pipeline chokes on throws from wherever it was read, which
      // names neither the month nor the file — `rebuild` reported a bare
      // "Cannot read properties of undefined" over 4000 rows. The month is the
      // one piece of context this loop has and the stack does not.
      try {
        rows.push(...(await pipeline(month)));
      } catch (e) {
        throw new Error(`${RAW}/${month}: ${e instanceof Error ? e.message : e}`, { cause: e });
      }
    }
    rebuildDb(db, rows);
    console.error(`rebuilt ${DB_FILE} from ${months.length} months, ${rows.length} rows`);
    return rows.length;
  } finally {
    db.close();
  }
}
