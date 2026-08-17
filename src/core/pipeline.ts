/**
 * The offline chain, in one place so the CLI and the dev server run
 * identically. Nothing here may import from src/net/: analysis never calls the
 * API, and this file's import list is what enforces it.
 */
import { readdirSync, rmSync } from "node:fs";
import { mkdir, readFile } from "node:fs/promises";
import {
  categorize,
  loadFamily,
  loadGiro,
  loadOverrides,
  loadPayees,
  loadSubscriptions,
  renamePayees,
} from "./categorize.ts";
import { openDb, rebuild as rebuildDb } from "./db.ts";
import { exclude, type Accounts } from "./exclude.ts";
import { narrowings } from "./narrowings.ts";
import { normalizeMonth } from "./normalize.ts";
import type { Categorized } from "./types.ts";

export const DB_FILE = "data/banking.db";
export const RAW = "data/raw";

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
 */
export async function pipeline(
  month: string,
  { rename = true } = {},
): Promise<Categorized[]> {
  const accounts: Accounts = JSON.parse(
    await readFile("rules/accounts.json", "utf8"),
  );
  const names = Object.fromEntries(
    Object.entries(accounts).flatMap(([key, a]) =>
      a.name ? [[key, a.name] as const] : [],
    ),
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
 * What each excluded reason sums to, which must be zero for all but one.
 *
 * `investment movement` is exempt: its counter-leg is booked at the fund
 * manager and is not in `data/raw/` at all, so its residue is the gain on the
 * funds. Every other reason has both legs here, so a non-zero sum is money one
 * rule took out of the totals and no rule put back.
 */
export function netByReason(rows: Categorized[]): Map<string, number> {
  const net = new Map<string, number>();
  for (const r of rows) {
    if (!r.excluded || !r.reason || r.reason === "investment movement")
      continue;
    // A card bill's two legs are one pair under two names, so netting them
    // apart would report every bill as an error forever.
    const pair = r.reason.replace(/ \(card side\)$/, "");
    net.set(pair, (net.get(pair) ?? 0) + r.amount);
  }
  return net;
}

/**
 * The database is derived and disposable: delete it and reconstruct from
 * data/raw/ alone. This is the only way rows get in — an incremental upsert
 * cannot notice a row it did not produce, and SB1 reissues a transaction under
 * a new id every time it is fetched.
 */
export async function rebuildAll(): Promise<number> {
  rmSync(DB_FILE, { force: true });
  await mkdir("data", { recursive: true });
  const db = openDb(DB_FILE);
  try {
    const months = monthsOnDisk();
    const rows: Categorized[] = [];
    for (const month of months) {
      try {
        // Un-renamed, so the check below sees the names the rules matched
        // against. The rename is applied once, after it.
        rows.push(...(await pipeline(month, { rename: false })));
      } catch (e) {
        // The month is the one piece of context this loop has and the stack
        // does not.
        throw new Error(
          `${RAW}/${month}: ${e instanceof Error ? e.message : e}`,
          { cause: e },
        );
      }
    }
    // Two lines claiming one row under different categories make the file's
    // order load-bearing, and the only symptom is rows quietly moving the next
    // time it is tidied. Warned, not thrown: today's order is still right.
    const loose = narrowings(rows, await loadOverrides());
    for (const l of loose) {
      console.error(
        `\nwarning: ${JSON.stringify(l.pattern)} only works where it sits, losing rows to ` +
          l.beaten.map((b) => JSON.stringify(b.pattern)).join(", ") +
          (l.suggest
            ? `\n  narrow it to ${JSON.stringify(l.suggest)}`
            : `\n  narrow it by hand — a winner is anchored and cannot be inlined`),
      );
    }
    // A reason that does not net is one leg excluded while its counterpart is
    // counted, which silently deletes real money from both totals.
    for (const [reason, net] of netByReason(rows)) {
      if (Math.abs(net) < 0.005) continue;
      console.error(
        `\nwarning: excluded reason "${reason}" nets to ${net.toFixed(2)}, not zero.` +
          `\nOne leg of a pair is being excluded while the other is counted.`,
      );
    }
    rebuildDb(db, renamePayees(rows, await loadPayees()));
    console.error(
      `rebuilt ${DB_FILE} from ${months.length} months, ${rows.length} rows`,
    );
    return rows.length;
  } finally {
    db.close();
  }
}
