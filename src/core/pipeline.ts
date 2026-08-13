/**
 * The offline half, in one place so the CLI and the dev server run identically.
 *
 * Nothing here imports anything under src/net/, and nothing here may: analysis never
 * calls the API. That rule is enforced by this file's import list — keep it
 * that way.
 */
import { mkdir, readFile } from 'node:fs/promises';
import { readdirSync, rmSync } from 'node:fs';
import { normalizeMonth } from './normalize.ts';
import { exclude, type Accounts } from './exclude.ts';
import {
  categorize,
  loadFamily,
  loadGiro,
  loadOverrides,
  loadPayees,
  loadSubscriptions,
  renamePayees,
} from './categorize.ts';
import { openDb, rebuild as rebuildDb } from './db.ts';
import { narrowings } from './report.ts';
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
 * One month's raw files, from normalize to categorize.
 *
 * Exclusion runs per month because both legs of an internal transfer share a
 * date and so can never land in different months.
 *
 * `rename: false` stops before `renamePayees` and hands back the names the bank
 * actually sent. Only the override report wants that, and it must have it: the
 * rename runs *after* `categorize`, so a rule is never matched against a renamed
 * name, and a report judging rules against the stored name judges a world the
 * pipeline never ran. `rules/payees.json` rewriting a payee into a string that
 * some *other* override pattern matches is enough to invert a verdict — one
 * entry on record does exactly that.
 */
export async function pipeline(month: string, { rename = true } = {}): Promise<Categorized[]> {
  const accounts: Accounts = JSON.parse(await readFile('rules/accounts.json', 'utf8'));
  const names = Object.fromEntries(
    Object.entries(accounts).flatMap(([key, a]) => (a.name ? [[key, a.name] as const] : [])),
  );
  const cards = new Set(
    Object.entries(accounts)
      .filter(([, a]) => a.card)
      .map(([key]) => key),
  );
  const rows = categorize(
    exclude(normalizeMonth(`${RAW}/${month}`, names), accounts),
    await loadOverrides(),
    await loadSubscriptions(),
    await loadGiro(),
    cards,
    await loadFamily(),
  );
  // Last, so every rule above matched the name the bank actually sent.
  return rename ? renamePayees(rows, await loadPayees()) : rows;
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
        // Un-renamed, because the ordering check below has to see the names the
        // rules were matched against. The rename is applied once, after it.
        rows.push(...(await pipeline(month, { rename: false })));
      } catch (e) {
        throw new Error(`${RAW}/${month}: ${e instanceof Error ? e.message : e}`, { cause: e });
      }
    }
    // Every line in rules/overrides.json is location-agnostic, so the file can
    // be grouped and sorted freely. Nothing else would announce that breaking:
    // two lines claiming the same row under different categories make the order
    // load-bearing, and the only symptom is rows quietly moving the next time
    // the file is tidied.
    //
    // **On the un-renamed rows, and that is load-bearing.** `rules/payees.json`
    // rewrites `ONLINE LINJ TR` to `Online Linjeforeningen`, which matches a
    // *different* override than the one that actually decided the row — judging
    // the file against a name no rule ever saw invents two collisions that are
    // not there. Warned, not thrown: the store is still right for today's order.
    const loose = narrowings(rows, await loadOverrides());
    if (loose.length) {
      console.error(
        `\nwarning: ${loose.length} line(s) in rules/overrides.json now depend on where they sit.` +
          `\nThe file can no longer be reordered safely. Run \`pnpm sb1 categories\` for the narrowed form of each.`,
      );
    }
    // Last, so no rule was ever matched against a name the bank did not send.
    rebuildDb(db, renamePayees(rows, await loadPayees()));
    console.error(`rebuilt ${DB_FILE} from ${months.length} months, ${rows.length} rows`);
    return rows.length;
  } finally {
    db.close();
  }
}
