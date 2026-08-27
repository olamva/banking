import { existsSync, statSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import type { Accounts } from "../core/exclude.ts";
import { osloDate } from "../core/normalize.ts";
import { RULES_DIR } from "../core/paths.ts";
import { monthsOnDisk, RAW } from "../core/pipeline.ts";
import { BudgetExhausted, remaining } from "./budget.ts";
import { get, monthRange, RateLimited } from "./sb1.ts";

async function dump(file: string, data: unknown): Promise<void> {
  await mkdir(file.slice(0, file.lastIndexOf("/")), { recursive: true });
  await writeFile(file, JSON.stringify(data, null, 2));
  console.error(`wrote ${file}`);
}

export async function accountKeys(month?: string): Promise<string[]> {
  const accounts: Accounts = JSON.parse(
    await readFile(`${RULES_DIR}/accounts.json`, "utf8"),
  );
  return Object.entries(accounts)
    .filter(([, a]) => a.sync !== false)
    .filter(([, a]) => !month || !a.from || month >= a.from)
    .map(([key]) => key);
}

export function rangeToDate(
  month: string,
  today = new Date(),
): { from: string; to: string } {
  const { from, to } = monthRange(month);
  const iso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  return { from, to: to > iso ? iso : to };
}

export const thisMonth = (today = new Date()): string =>
  `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;

const fileFor = (month: string, key: string) => `${RAW}/${month}/${key}.json`;

export type SyncResult = { fetched: number; stopped: string | null };

// A month closes a few days after it ends. SB1 dates a card row by the purchase,
// and the booking follows up to three days later. Oslo is an hour or two off UTC,
// which this margin swallows.
const CLOSE_DAYS = 4;

export function closesAt(month: string): number {
  const [y, m] = month.split("-").map(Number);
  return Date.UTC(y!, m!, 1) + CLOSE_DAYS * 86_400_000;
}

// The whole rule: a file written after its month closed can never gain a row.
// A file captured while its month was still open can, so it is asked for again.
// This makes the open months, and only those, cost a request.
export const settled = (file: string, month: string): boolean =>
  existsSync(file) && statSync(file).mtimeMs > closesAt(month);

export async function rangeCost(months: string[]): Promise<number> {
  const plan = await spanPlan(months);
  return [...plan.values()].reduce((n, ms) => n + ms.length, 0);
}

async function spanPlan(months: string[]): Promise<Map<string, string[]>> {
  const plan = new Map<string, string[]>();
  for (const month of months) {
    for (const key of await accountKeys(month)) {
      if (settled(fileFor(month, key), month)) continue;
      const owed = plan.get(key);
      if (owed) owed.push(month);
      else plan.set(key, [month]);
    }
  }
  return plan;
}

export function monthsBetween(
  from: string,
  to: string,
  today = new Date(),
): string[] {
  const bound = (v: string, end: boolean) => {
    if (/^\d{4}$/.test(v)) return `${v}-${end ? "12" : "01"}`;
    if (/^\d{4}-\d{2}$/.test(v)) return v;
    throw new Error(`--from/--to want YYYY or YYYY-MM, got "${v}"`);
  };
  const index = (m: string) =>
    Number(m.slice(0, 4)) * 12 + Number(m.slice(5)) - 1;
  const now = thisMonth(today);
  const start = index(bound(from, false));
  const stop = Math.min(index(bound(to, true)), index(now));

  const out: string[] = [];
  for (let i = start; i <= stop; i++) {
    out.push(`${Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, "0")}`);
  }
  return out;
}

const SPAN_MONTHS = 60;

type SpanRow = { transaction: { date: number; accountKey: string } };
type SpanResponse = { transactions?: SpanRow[]; errors?: unknown[] };

const ROW_LIMIT = 50_000;

export function splitSpan(rows: SpanRow[]): Map<string, SpanRow[]> {
  const byFile = new Map<string, SpanRow[]>();
  for (const row of rows) {
    const key = `${osloDate(row.transaction.date).slice(0, 7)}/${row.transaction.accountKey}`;
    const bucket = byFile.get(key);
    if (bucket) bucket.push(row);
    else byFile.set(key, [row]);
  }
  return byFile;
}

export function spans(months: string[], size = SPAN_MONTHS): string[][] {
  const out: string[][] = [];
  for (let i = 0; i < months.length; i += size)
    out.push(months.slice(i, i + size));
  return out;
}

export const owedMonths = (plan: Map<string, string[]>): string[] =>
  [...new Set([...plan.values()].flat())].sort();

export async function syncSpan(
  months: string[],
  onFile?: () => void,
): Promise<number> {
  const plan = await spanPlan(months);
  if (!plan.size) {
    console.error(`skip ${months[0]}..${months.at(-1)} — nothing owed`);
    return 0;
  }

  // Ask for the months owed, not for the whole five-year bucket they sit in.
  // One open month is then one small request, not a re-read of the record.
  const owed = owedMonths(plan);
  const from = monthRange(owed[0]!).from;
  const to = rangeToDate(owed.at(-1)!).to;
  const q = [...plan.keys()]
    .map((k) => `accountKey=${encodeURIComponent(k)}`)
    .join("&");
  const res = (await get(
    `/personal/banking/transactions/classified?${q}` +
      `&fromDate=${from}&toDate=${to}&rowLimit=${ROW_LIMIT}`,
  )) as SpanResponse;

  const rows = res.transactions ?? [];
  if (rows.length >= ROW_LIMIT)
    throw new Error(
      `${from}..${to} came back with ${rows.length} rows, at the ${ROW_LIMIT} ceiling — ` +
        `it is probably truncated. Sync a narrower span rather than writing this to data/raw.`,
    );
  if (res.errors?.length)
    console.error(`warning: the bank reported ${res.errors.length} error(s)`);

  const byFile = splitSpan(rows);

  let fetched = 0;
  for (const [key, wanted] of plan) {
    for (const month of wanted) {
      await dump(fileFor(month, key), {
        transactions: byFile.get(`${month}/${key}`) ?? [],
        errors: res.errors ?? [],
      });
      byFile.delete(`${month}/${key}`);
      fetched++;
      onFile?.();
    }
  }

  for (const [key] of byFile) {
    const [month, account] = key.split("/");
    if (!months.includes(month)) continue;
    if (settled(fileFor(month, account), month)) continue;
    console.error(
      `warning: ${byFile.get(key)!.length} row(s) came back for ${key}, which was not requested — ` +
        `check the account's "from" in rules/accounts.json.`,
    );
  }
  return fetched;
}

export async function syncRange(from: string, to: string): Promise<SyncResult> {
  const months = monthsBetween(from, to);
  const parts = spans(months);
  const files = await rangeCost(months);
  const costs = await Promise.all(
    parts.map(async (part) => ((await rangeCost(part)) ? 1 : 0) as number),
  );
  const cost = costs.reduce((a, b) => a + b, 0);
  const left = remaining();
  console.error(
    `${months.length} months, ${months[0]} to ${months.at(-1)}: ` +
      `${cost} request${cost === 1 ? "" : "s"}, ${files} files`,
  );
  // `null` means the bank has not reported recently. It does not mean zero left.
  // The first response supplies a new figure.
  if (left !== null && cost > left) {
    console.error(
      `SB1 last reported only ${left} left — expect to stop after ${left} of ` +
        `them, then re-run to carry on.`,
    );
  }

  let fetched = 0;
  for (const part of parts) {
    try {
      await syncSpan(part, () => fetched++);
    } catch (e) {
      if (!(e instanceof BudgetExhausted) && !(e instanceof RateLimited))
        throw e;
      const stopped =
        `${e.message} Stopped at ${part[0]}..${part.at(-1)}, ` +
        `${fetched} files fetched. Refresh again to carry on.`;
      console.error(`\n${stopped}`);
      return { fetched, stopped };
    }
  }
  console.error(`\n${fetched} files fetched across ${months.length} months.`);
  return { fetched, stopped: null };
}

export function earliestMonth(accounts: Accounts, fallback: string): string {
  const froms = Object.values(accounts)
    .filter((a) => a.sync !== false)
    .map((a) => a.from)
    .filter((m): m is string => !!m)
    .sort();
  return froms[0] ?? fallback;
}

export async function syncAll(): Promise<SyncResult> {
  const accounts: Accounts = JSON.parse(
    await readFile(`${RULES_DIR}/accounts.json`, "utf8"),
  );
  const now = thisMonth();
  return syncRange(earliestMonth(accounts, monthsOnDisk()[0] ?? now), now);
}
