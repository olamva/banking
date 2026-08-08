/**
 * A rolling-hour ledger of SpareBank 1 API calls.
 *
 * SB1 allows 60 requests an hour. That is plenty for the way `sync` is used by
 * hand, and easy to burn through once a server refreshes on its own — a reload
 * loop, two browser tabs, or a watcher restarting the process can each turn one
 * intended refresh into several.
 *
 * The ledger lives on disk precisely so it survives a restart. An in-memory
 * counter would reset exactly when the risk is highest.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

const LEDGER = 'data/api-budget.json';
const WINDOW_MS = 3600_000;

/** Well under the real 60, so a hand-run `sync` still works after the app refreshes. */
export const HOURLY_CAP = Number(process.env.SB1_HOURLY_CAP ?? 40);

function read(path: string, now: number): number[] {
  if (!existsSync(path)) return [];
  try {
    const stamps = JSON.parse(readFileSync(path, 'utf8')) as unknown;
    if (!Array.isArray(stamps)) return [];
    return stamps.filter((t): t is number => typeof t === 'number' && now - t < WINDOW_MS);
  } catch {
    return []; // a corrupt ledger must not wedge the CLI; worst case we forget history
  }
}

/** Calls in the last hour. */
export function used(path = LEDGER, now = Date.now()): number {
  return read(path, now).length;
}

export function remaining(path = LEDGER, now = Date.now()): number {
  return Math.max(0, HOURLY_CAP - used(path, now));
}

/** Whether `cost` more calls fit under the cap. */
export function canAfford(cost: number, path = LEDGER, now = Date.now()): boolean {
  return remaining(path, now) >= cost;
}

export class BudgetExhausted extends Error {
  constructor(used: number) {
    super(
      `SpareBank 1 request budget spent: ${used}/${HOURLY_CAP} in the last hour. ` +
        `Wait, or raise SB1_HOURLY_CAP (the bank's own limit is 60).`,
    );
  }
}

/**
 * Records one call, refusing rather than walking into the bank's own limit.
 * Called from the single request choke point, so nothing slips past uncounted.
 */
export function spend(path = LEDGER, now = Date.now()): void {
  const stamps = read(path, now);
  if (stamps.length >= HOURLY_CAP) throw new BudgetExhausted(stamps.length);
  stamps.push(now);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(stamps));
}
