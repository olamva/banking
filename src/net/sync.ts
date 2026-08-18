import { existsSync, statSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import type { Accounts } from "../core/exclude.ts";
import { osloDate } from "../core/normalize.ts";
import { RAW } from "../core/pipeline.ts";
import { BudgetExhausted, remaining } from "./budget.ts";
import { get, monthRange, RateLimited } from "./sb1.ts";

async function dump(file: string, data: unknown): Promise<void> {
  await mkdir(file.slice(0, file.lastIndexOf("/")), { recursive: true });
  await writeFile(file, JSON.stringify(data, null, 2));
  console.error(`wrote ${file}`);
}

export async function accountKeys(month?: string): Promise<string[]> {
  const accounts: Accounts = JSON.parse(
    await readFile("rules/accounts.json", "utf8"),
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

export type Force = boolean | number;

const fresh = (file: string, force: Force): boolean => {
  if (!existsSync(file)) return false;
  if (typeof force === "number")
    return Date.now() - statSync(file).mtimeMs < force * 60_000;
  return !force;
};

export async function rangeCost(
  months: string[],
  force: Force,
): Promise<number> {
  const plan = await spanPlan(months, force);
  return [...plan.values()].reduce((n, ms) => n + ms.length, 0);
}

async function spanPlan(
  months: string[],
  force: Force,
): Promise<Map<string, string[]>> {
  const plan = new Map<string, string[]>();
  for (const month of months) {
    for (const key of await accountKeys(month)) {
      if (fresh(fileFor(month, key), force)) continue;
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

export async function syncSpan(
  months: string[],
  force: Force = false,
  onFile?: () => void,
): Promise<number> {
  const plan = await spanPlan(months, force);
  if (!plan.size) {
    console.error(`skip ${months[0]}..${months.at(-1)} — nothing owed`);
    return 0;
  }

  const from = monthRange(months[0]).from;
  const to = rangeToDate(months.at(-1)!).to;
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
  for (const [key, owed] of plan) {
    for (const month of owed) {
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
    if (fresh(fileFor(month, account), force)) continue;
    console.error(
      `warning: ${byFile.get(key)!.length} row(s) came back for ${key}, which was not requested — ` +
        `check the account's "from" in rules/accounts.json.`,
    );
  }
  return fetched;
}

export async function syncRange(
  from: string,
  to: string,
  force: Force = false,
): Promise<void> {
  const months = monthsBetween(from, to);
  const parts = spans(months);
  const files = await rangeCost(months, force);
  const costs = await Promise.all(
    parts.map(
      async (part) => ((await rangeCost(part, force)) ? 1 : 0) as number,
    ),
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
      await syncSpan(part, force, () => fetched++);
    } catch (e) {
      if (!(e instanceof BudgetExhausted) && !(e instanceof RateLimited))
        throw e;
      console.error(`\n${e.message}`);
      console.error(
        `stopped at ${part[0]}..${part.at(-1)}. ${fetched} files fetched — re-run to carry on.`,
      );
      return;
    }
  }
  console.error(`\n${fetched} files fetched across ${months.length} months.`);
}

export async function syncMonth(
  month: string,
  force: Force = false,
  onFile?: () => void,
): Promise<number> {
  return syncSpan([month], force, onFile);
}
