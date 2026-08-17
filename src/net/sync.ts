/**
 * The network half. Everything that talks to a bank lives here or in the two
 * client modules it wraps — nothing downstream of `data/raw/` may import it.
 *
 * Every SB1 call is counted against the bank's own budget inside `sb1.get`, so
 * the accounting holds no matter who calls these.
 */
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

/**
 * The accounts to fetch. `sync: false` marks an entry whose key is a made-up
 * label SB1 would 404 on — it earns its place because `exclude` matches on the
 * *number*.
 *
 * `from` is the month the account first saw activity, so asking below it is a
 * question whose answer is known. An account with no `from` has no floor.
 */
export async function accountKeys(month?: string): Promise<string[]> {
  const accounts: Accounts = JSON.parse(
    await readFile("rules/accounts.json", "utf8"),
  );
  return Object.entries(accounts)
    .filter(([, a]) => a.sync !== false)
    .filter(([, a]) => !month || !a.from || month >= a.from)
    .map(([key]) => key);
}

/**
 * Date bounds, never reaching past today.
 *
 * `monthRange` ends the current month on its last calendar day, which is a
 * future date until the month is over. SB1 tolerates that, but a range it
 * cannot answer for is a request spent on nothing, and `fromDate`..`toDate`
 * may not span more than five years either way.
 */
export function rangeToDate(
  month: string,
  today = new Date(),
): { from: string; to: string } {
  const { from, to } = monthRange(month);
  const iso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  return { from, to: to > iso ? iso : to };
}

/**
 * The month we are standing in. The default end of a sweep, and the clamp
 * `monthsBetween` applies to whatever end it is given.
 */
export const thisMonth = (today = new Date()): string =>
  `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;

/** Where one account's month lands. The one place that path is spelled out. */
const fileFor = (month: string, key: string) => `${RAW}/${month}/${key}.json`;

/**
 * How hard to refetch: `false` leaves anything on disk alone, `true` refetches
 * all of it, a **number** is minutes — refetch, but leave whatever was written
 * that recently. That last one is how a forced sync resumes: the bank answers
 * 429 part way through, and re-running spends requests only on the accounts the
 * first run never reached.
 */
export type Force = boolean | number;

/** Whether this file is already as fresh as `force` asks for. */
const fresh = (file: string, force: Force): boolean => {
  if (!existsSync(file)) return false;
  if (typeof force === "number")
    return Date.now() - statSync(file).mtimeMs < force * 60_000;
  return !force;
};

/**
 * What a span will cost in **files**, counted from disk. Not the count of
 * requests — see `syncSpan` — but a file is the unit that either lands or does
 * not, which is what the pre-flight message reports.
 */
export async function rangeCost(
  months: string[],
  force: Force,
): Promise<number> {
  const plan = await spanPlan(months, force);
  return [...plan.values()].reduce((n, ms) => n + ms.length, 0);
}

/**
 * Which files a span still owes, as account key -> the months missing it.
 *
 * The keys are asked for per month, not once: an account that had not opened
 * yet is not part of the bill for that month either. An account that owes
 * nothing is absent entirely, which is what keeps it out of the request.
 */
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

/**
 * Every month from `from` to `to`, both ends inclusive and either end allowed to
 * be a bare year — `2021` opens at January and `2026` closes at December.
 *
 * Never past the current month: there is nothing to fetch in a month that has
 * not happened, and asking costs a request per account to be told so.
 */
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

/**
 * The bank refuses `fromDate`..`toDate` longer than five years — a
 * `400 BadRequest`, `Date interval cannot exceed 5 years`. It is a range check
 * and says nothing about rows, so it is the only reason a sweep is cut up at
 * all.
 */
const SPAN_MONTHS = 60;

/**
 * Only the two fields the split reads. Every row is written back into its file
 * exactly as it arrived, so nothing here may narrow what a row *is* — the
 * shape that matters is `normalize`'s, and this must not become a second,
 * drifting copy of it.
 */
type SpanRow = { transaction: { date: number; accountKey: string } };
type SpanResponse = { transactions?: SpanRow[]; errors?: unknown[] };

/**
 * An explicit ceiling on the rows one response may carry, so a truncated answer
 * is noticed rather than written to disk — where it would be a complete month
 * as far as `fresh` is concerned, forever after.
 */
const ROW_LIMIT = 50_000;

/**
 * A span response grouped into the files it becomes, keyed `<month>/<key>`.
 *
 * The month is the row's **Oslo** month, because that is the cut
 * `normalizeMonth` reads back. A UTC month would file every row dated the 1st
 * into the previous directory — written into `data/raw/`, where it outlives the
 * mistake.
 */
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

/** Consecutive runs of at most `size` months, oldest first. */
export function spans(months: string[], size = SPAN_MONTHS): string[][] {
  const out: string[][] = [];
  for (let i = 0; i < months.length; i += size)
    out.push(months.slice(i, i + size));
  return out;
}

/**
 * One request for a whole span, split back into the per-month files the rest of
 * the repo reads. `accountKey` is repeatable and the range may be five years
 * wide, so the smallest honest unit of fetching is every account for five
 * years, in one call.
 *
 * Three things make the split safe, and none is optional:
 *
 * - **What lands on disk is unchanged**, so a wider request stays invisible
 *   downstream. A span-shaped file could overlap a month file, and
 *   `normalizeMonth` concatenates without deduplicating.
 * - **Only the files the plan is missing get written**: raw is immutable, so a
 *   month already on disk is left alone even though the response held it.
 * - **An empty month is still written**, as the record that the question was
 *   asked and the answer was nothing. Without it the file is owed forever.
 */
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

  // Anything left is a row the bank sent for a file the plan never meant to
  // write — a month already on disk (ordinary, and left alone because raw is
  // immutable), or a month before the account's `from`, which would mean that
  // date is wrong and the floor is hiding real transactions.
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

/**
 * A whole span of months, oldest first, at one request per five years.
 *
 * Two things stop it and both are handled the same way: the ledger counting
 * down to zero from what the bank last reported, or the bank answering 429
 * itself. The first is a cached figure and the second is the truth.
 *
 * A span whose files are all on disk costs no request at all, which is what
 * makes re-running a range a resume rather than a repeat.
 */
export async function syncRange(
  from: string,
  to: string,
  force: Force = false,
): Promise<void> {
  const months = monthsBetween(from, to);
  const parts = spans(months);
  const files = await rangeCost(months, force);
  // A span with nothing owed is skipped without a request, so the bill is the
  // spans that have work in them and not the spans the range covers.
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
  // `null` is "the bank has not said recently", not "nothing left" — in that
  // case there is no estimate to give and the first response will supply one.
  if (left !== null && cost > left) {
    console.error(
      `SB1 last reported only ${left} left — expect to stop after ${left} of ` +
        `them, then re-run to carry on.`,
    );
  }

  let fetched = 0;
  for (const part of parts) {
    try {
      // Counted as they land, not per span: a span that dies before its request
      // still wrote whatever earlier spans wrote.
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

/**
 * One month, which is a span of one — so one request, not one per account.
 * `onFile` fires as each file lands, so a caller can count what a run got
 * through even when the next request runs out of budget.
 */
export async function syncMonth(
  month: string,
  force: Force = false,
  onFile?: () => void,
): Promise<number> {
  return syncSpan([month], force, onFile);
}
