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
import { categorize, loadOverrides } from './categorize.ts';
import { openDb, upsertMany, rebuild as rebuildDb } from './db.ts';
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
 * Steps 4-6 for one month's raw files, plus the merchant lookup.
 *
 * Exclusion runs per month because both legs of an internal transfer share a
 * date and so can never land in different months. Enrichment goes first, so the
 * merchant is available to overrides, and it writes only `counterparty`, so the
 * exclusion rules still match the source's own description.
 */
export async function pipeline(month: string): Promise<Categorized[]> {
  const accounts: Accounts = JSON.parse(await readFile('accounts.json', 'utf8'));
  const txns = enrich(normalizeMonth(`${RAW}/${month}`), readStatements());
  return categorize(exclude(txns, accounts), await loadOverrides());
}

/** Upserts the given months. Idempotent per (source, id), so re-running is free. */
export async function importMonths(months = monthsOnDisk()): Promise<number> {
  await mkdir('data', { recursive: true });
  const db = openDb(DB_FILE);
  let total = 0;
  try {
    for (const month of months) {
      const rows = await pipeline(month);
      upsertMany(db, rows);
      total += rows.length;
      console.error(`${month}: ${rows.length} rows`);
    }
  } finally {
    db.close();
  }
  return total;
}

/**
 * The database is derived and disposable: delete it and reconstruct from
 * data/raw/ alone. Unlike an upsert this also drops rows the pipeline no longer
 * produces, which an upsert would leave behind forever.
 */
export async function rebuildAll(): Promise<number> {
  rmSync(DB_FILE, { force: true });
  await mkdir('data', { recursive: true });
  const db = openDb(DB_FILE);
  try {
    const months = monthsOnDisk();
    const rows: Categorized[] = [];
    for (const month of months) rows.push(...(await pipeline(month)));
    rebuildDb(db, rows);
    console.error(`rebuilt ${DB_FILE} from ${months.length} months, ${rows.length} rows`);
    return rows.length;
  } finally {
    db.close();
  }
}
