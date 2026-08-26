import { readdirSync, rmSync } from "node:fs";
import { mkdir, readFile } from "node:fs/promises";
import {
  categorize,
  loadFamily,
  loadGiro,
  loadNotSubscriptions,
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
export const WEB = "data/web";

export function monthsOnDisk(): string[] {
  return readdirSync(RAW, { withFileTypes: true })
    .filter((e) => e.isDirectory() && /^\d{4}-\d{2}$/.test(e.name))
    .map((e) => e.name)
    .sort();
}

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
    await loadNotSubscriptions(),
  );
  return rename ? renamePayees(rows, await loadPayees()) : rows;
}

export function netByReason(rows: Categorized[]): Map<string, number> {
  const net = new Map<string, number>();
  for (const r of rows) {
    if (!r.excluded || !r.reason || r.reason === "investment movement")
      continue;
    // The two legs of a card bill are one pair with two names. Net them together,
    // or every bill reports an error.
    const pair = r.reason.replace(/ \(card side\)$/, "");
    net.set(pair, (net.get(pair) ?? 0) + r.amount);
  }
  return net;
}

export async function rebuildAll(): Promise<number> {
  rmSync(DB_FILE, { force: true });
  await mkdir("data", { recursive: true });
  const db = openDb(DB_FILE);
  try {
    const months = monthsOnDisk();
    const rows: Categorized[] = [];
    for (const month of months) {
      try {
        rows.push(...(await pipeline(month, { rename: false })));
      } catch (e) {
        throw new Error(
          `${RAW}/${month}: ${e instanceof Error ? e.message : e}`,
          { cause: e },
        );
      }
    }
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
    // A reason that does not net to zero has one excluded leg and one counted leg.
    // This removes real money from both totals.
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
