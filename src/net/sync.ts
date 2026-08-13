/**
 * The network half. Everything that talks to a bank lives here or in the two
 * client modules it wraps — nothing downstream of `data/raw/` may import it.
 *
 * Every SB1 call is counted against the bank's own budget inside `sb1.get`, so
 * the accounting holds no matter who calls these.
 */
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { existsSync, statSync } from 'node:fs';
import { get, monthRange, RateLimited } from './sb1.ts';
import { BudgetExhausted, remaining } from './budget.ts';
import { RAW } from '../core/pipeline.ts';
import type { Accounts } from '../core/exclude.ts';

async function dump(file: string, data: unknown): Promise<void> {
  await mkdir(file.slice(0, file.lastIndexOf('/')), { recursive: true });
  await writeFile(file, JSON.stringify(data, null, 2));
  console.error(`wrote ${file}`);
}

/**
 * The accounts to fetch — every entry except the ones marked `sync: false`,
 * which are mine but have no key SB1 would answer for (a share savings account
 * is absent from `/accounts` entirely). Their key here is a made-up label, so
 * fetching one would spend a request on a 404. They still earn their entry:
 * `exclude` matches on the *number*.
 */
export async function accountKeys(): Promise<string[]> {
  const accounts: Accounts = JSON.parse(await readFile('rules/accounts.json', 'utf8'));
  return Object.entries(accounts)
    .filter(([, a]) => a.sync !== false)
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
export function rangeToDate(month: string, today = new Date()): { from: string; to: string } {
  const { from, to } = monthRange(month);
  const iso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  return { from, to: to > iso ? iso : to };
}

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
  if (typeof force === 'number') return Date.now() - statSync(file).mtimeMs < force * 60_000;
  return !force;
};

/**
 * What a span will actually cost, counted from disk rather than assumed.
 *
 * A month whose files are all present costs nothing without `--force`, so the
 * honest number for a resumed sweep is the missing files and not the months.
 */
export async function rangeCost(months: string[], force: Force): Promise<number> {
  const keys = await accountKeys();
  return months.reduce(
    (n, month) => n + keys.filter((key) => !fresh(fileFor(month, key), force)).length,
    0,
  );
}

/**
 * Every month from `from` to `to`, both ends inclusive and either end allowed to
 * be a bare year — `2021` opens at January and `2026` closes at December.
 *
 * Never past the current month: there is nothing to fetch in a month that has
 * not happened, and asking costs a request per account to be told so.
 */
export function monthsBetween(from: string, to: string, today = new Date()): string[] {
  const bound = (v: string, end: boolean) => {
    if (/^\d{4}$/.test(v)) return `${v}-${end ? '12' : '01'}`;
    if (/^\d{4}-\d{2}$/.test(v)) return v;
    throw new Error(`--from/--to want YYYY or YYYY-MM, got "${v}"`);
  };
  const index = (m: string) => Number(m.slice(0, 4)) * 12 + Number(m.slice(5)) - 1;
  const now = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
  const start = index(bound(from, false));
  const stop = Math.min(index(bound(to, true)), index(now));

  const out: string[] = [];
  for (let i = start; i <= stop; i++) {
    out.push(`${Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, '0')}`);
  }
  return out;
}

/**
 * A whole span of months, oldest first.
 *
 * A sweep of the record costs far more than the bank allows at once — 56 months
 * times one request per account — so running out is the normal ending and not a
 * failure. **It says so before spending anything**, because the alternative is
 * finding out 33 requests in, with no idea how much further it had to go.
 *
 * Two different things can stop it and both are handled the same way: the
 * ledger counting down to zero from what the bank last reported, or the bank
 * answering 429 itself. The first is a cached figure and the second is the
 * truth — see `RateLimited`.
 *
 * The ledger is the bank's counter, not this run's, so what is left already
 * counts whatever else has been fetched since — and the bank refills it as the
 * sweep goes, which is why a run can outlast its own estimate. Months on disk
 * cost nothing without `--force`, which is what makes re-running it a resume.
 */
export async function syncRange(from: string, to: string, force: Force = false): Promise<void> {
  const months = monthsBetween(from, to);
  const cost = await rangeCost(months, force);
  const left = remaining();
  console.error(`${months.length} months, ${months[0]} to ${months.at(-1)}: ${cost} requests`);
  // `null` is "the bank has not said recently", not "nothing left" — in that
  // case there is no estimate to give and the first response will supply one.
  if (left !== null && cost > left) {
    const perMonth = Math.max(1, Math.round(cost / months.length));
    console.error(
      `SB1 last reported only ${left} left — expect to stop after about ` +
        `${Math.floor(left / perMonth)} of them, then re-run to carry on.`,
    );
  }

  let fetched = 0;
  for (const month of months) {
    try {
      // Counted as they land, not per month: a month that dies half way through
      // still fetched what it fetched, and reporting the whole month as nothing
      // is how 32 files got announced as 28.
      await syncMonth(month, force, () => fetched++);
    } catch (e) {
      if (!(e instanceof BudgetExhausted) && !(e instanceof RateLimited)) throw e;
      console.error(`\n${e.message}`);
      console.error(`stopped part way through ${month}. ${fetched} files fetched — re-run to carry on.`);
      return;
    }
  }
  console.error(`\n${fetched} files fetched across ${months.length} months.`);
}

/**
 * One file per account per month. Skips files already on disk unless forced.
 *
 * `onFile` fires as each one lands, so a caller can count what a run got
 * through even when the next request is the one that runs out of budget.
 */
export async function syncMonth(month: string, force: Force = false, onFile?: () => void): Promise<number> {
  const { from, to } = rangeToDate(month);
  let fetched = 0;
  for (const key of await accountKeys()) {
    const file = fileFor(month, key);
    if (fresh(file, force)) {
      console.error(`skip ${file}`);
      continue;
    }
    const q = `accountKey=${encodeURIComponent(key)}&fromDate=${from}&toDate=${to}`;
    await dump(file, await get(`/personal/banking/transactions/classified?${q}`));
    fetched++;
    onFile?.();
  }
  return fetched;
}
