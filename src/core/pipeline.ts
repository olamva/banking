import { existsSync, readdirSync, rmSync } from "node:fs";
import { mkdir, readdir, readFile } from "node:fs/promises";
import { basename, dirname } from "node:path";
import {
  categorize,
  loadCategories,
  loadCountries,
  loadFamily,
  loadGiro,
  loadNotSubscriptions,
  loadPayees,
  loadPreferences,
  loadSubscriptions,
  renamePayees,
  setCountries,
} from "./categorize.ts";
import { openDb, rebuild as rebuildDb } from "./db.ts";
import { exclude, type Accounts } from "./exclude.ts";
import { narrowings } from "./narrowings.ts";
import { DATA_DIR, DB_FILE, RULES_DIR } from "./paths.ts";
import { normalizeMonth } from "./normalize.ts";
import {
  mailReceipt,
  matchReceipts,
  remaReceipt,
  trumfReceipt,
  type Found,
} from "./receipts.ts";
import type { Categorized } from "./types.ts";

const debug = (...args: unknown[]): void => {
  if (process.env.DEBUG === "1") console.error(...args);
};

export { DB_FILE };
export const RAW = `${DATA_DIR}/raw`;

export function monthsOnDisk(): string[] {
  if (!existsSync(RAW)) return [];
  return readdirSync(RAW, { withFileTypes: true })
    .filter((e) => e.isDirectory() && /^\d{4}-\d{2}$/.test(e.name))
    .map((e) => e.name)
    .sort();
}

const mails = new Map<string, Promise<Found>>();

const READERS: Record<string, (file: string) => Promise<Found | null>> = {
  rema: async (file) => remaReceipt(JSON.parse(await readFile(file, "utf8"))),
  trumf: async (file) => trumfReceipt(JSON.parse(await readFile(file, "utf8"))),
  gmail: (file) => {
    if (!mails.has(file))
      mails.set(
        file,
        readFile(file).then((raw) => mailReceipt(basename(file, ".eml"), raw)),
      );
    return mails.get(file)!;
  },
};

export async function receiptsOnDisk(): Promise<Found[]> {
  const found: Found[] = [];
  for (const [source, read] of Object.entries(READERS)) {
    const dir = `${RAW}/receipts/${source}`;
    if (!existsSync(dir)) continue;
    for (const name of (await readdir(dir)).sort()) {
      const hit = await read(`${dir}/${name}`).catch((e: unknown) => {
        console.error(
          `skipped ${dir}/${name}: ${e instanceof Error ? e.message : e}`,
        );
        return null;
      });
      if (hit && Number.isFinite(hit.receipt.at)) found.push(hit);
    }
  }
  return found;
}

export async function loadRules() {
  const accounts: Accounts = JSON.parse(
    await readFile(`${RULES_DIR}/accounts.json`, "utf8"),
  );
  const [
    countries,
    categories,
    subscriptions,
    giro,
    family,
    notSubscriptions,
    preferences,
    payees,
  ] = await Promise.all([
    loadCountries(),
    loadCategories(),
    loadSubscriptions(),
    loadGiro(),
    loadFamily(),
    loadNotSubscriptions(),
    loadPreferences(),
    loadPayees(),
  ]);
  return {
    accounts,
    names: Object.fromEntries(
      Object.entries(accounts).flatMap(([key, a]) =>
        a.name ? [[key, a.name] as const] : [],
      ),
    ),
    cards: new Set(
      Object.entries(accounts)
        .filter(([, a]) => a.card)
        .map(([key]) => key),
    ),
    countries,
    categories,
    subscriptions,
    giro,
    family,
    notSubscriptions,
    preferences,
    payees,
  };
}

export async function pipeline(
  month: string,
  { rename = true } = {},
  rules?: Awaited<ReturnType<typeof loadRules>>,
): Promise<Categorized[]> {
  const r = rules ?? (await loadRules());
  const rows = categorize(
    exclude(
      setCountries(
        await normalizeMonth(`${RAW}/${month}`, r.names, r.cards),
        r.countries,
      ),
      r.accounts,
    ),
    r.categories,
    r.subscriptions,
    r.giro,
    r.cards,
    r.family,
    r.notSubscriptions,
    r.preferences,
  );
  return rename ? renamePayees(rows, r.payees) : rows;
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
  await mkdir(dirname(DB_FILE), { recursive: true });
  const db = openDb(DB_FILE);
  try {
    const months = monthsOnDisk();
    const rules = await loadRules();
    const rows = (
      await Promise.all(
        months.map((month) =>
          pipeline(month, { rename: false }, rules).catch((e: unknown) => {
            throw new Error(
              `${RAW}/${month}: ${e instanceof Error ? e.message : e}`,
              { cause: e },
            );
          }),
        ),
      )
    ).flat();
    const loose = narrowings(rows, rules.categories);
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
    for (const [, net] of netByReason(rows)) {
      if (Math.abs(net) < 0.005) continue;
      console.error(
        `\nwarning: excluded reason nets to a non-zero value.` +
          `\nOne leg of a pair is being excluded while the other is counted.`,
      );
    }
    const receipts = matchReceipts(rows, await receiptsOnDisk());
    rebuildDb(
      db,
      renamePayees(
        rows.map((r) =>
          receipts.has(r) ? { ...r, receipt: receipts.get(r)! } : r,
        ),
        rules.payees,
      ),
    );
    debug(
      `rebuilt ${DB_FILE} from ${months.length} months, ${rows.length} rows`,
    );
    return rows.length;
  } finally {
    db.close();
  }
}
