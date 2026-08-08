/**
 * The network half. Everything that talks to a bank lives here or in the two
 * client modules it wraps — nothing downstream of `data/raw/` may import it.
 *
 * Every SB1 call is counted against the hourly budget inside `sb1.get`, so the
 * accounting holds no matter who calls these.
 */
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { get, monthRange } from './sb1.ts';
import * as eb from './eb.ts';
import { RAW } from '../core/pipeline.ts';

async function dump(file: string, data: unknown): Promise<void> {
  await mkdir(file.slice(0, file.lastIndexOf('/')), { recursive: true });
  await writeFile(file, JSON.stringify(data, null, 2));
  console.error(`wrote ${file}`);
}

export async function accountKeys(): Promise<string[]> {
  return Object.keys(JSON.parse(await readFile('accounts.json', 'utf8')));
}

/**
 * Booking-date bounds, never reaching past today.
 *
 * `monthRange` ends the current month on its last calendar day, which is a
 * future date until the month is over. SB1 tolerates that; Enable Banking
 * answers `400 ASPSP_ERROR`, so refreshing the month you are standing in fails
 * outright without this.
 */
export function rangeToDate(month: string, today = new Date()): { from: string; to: string } {
  const { from, to } = monthRange(month);
  const iso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  return { from, to: to > iso ? iso : to };
}

/** How many SB1 requests a `syncMonth` will cost, for a budget check beforehand. */
export async function syncCost(): Promise<number> {
  return (await accountKeys()).length;
}

/** One file per account per month. Skips files already on disk unless forced. */
export async function syncMonth(month: string, force = false): Promise<number> {
  const { from, to } = rangeToDate(month);
  let fetched = 0;
  for (const key of await accountKeys()) {
    const file = `${RAW}/${month}/${key}.json`;
    if (existsSync(file) && !force) {
      console.error(`skip ${file}`);
      continue;
    }
    const q = `accountKey=${encodeURIComponent(key)}&fromDate=${from}&toDate=${to}`;
    await dump(file, await get(`/personal/banking/transactions/classified?${q}`));
    fetched++;
  }
  return fetched;
}

/** Card transactions, same layout as the SB1 sync so normalize sees one tree. */
export async function ebSyncMonth(month: string, force = false): Promise<number> {
  const { from, to } = rangeToDate(month);
  let fetched = 0;
  for (const a of eb.readSession().accounts) {
    if (a.cash_account_type !== 'CARD') continue;
    const file = `${RAW}/${month}/eb-${a.uid}.json`;
    if (existsSync(file) && !force) {
      console.error(`skip ${file}`);
      continue;
    }
    await dump(file, { account: a, transactions: await eb.transactions(a.uid, from, to) });
    fetched++;
  }
  return fetched;
}
