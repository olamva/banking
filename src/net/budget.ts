/**
 * A rolling-hour ledger of SpareBank 1 API calls.
 *
 * **This cap is ours, not the bank's.** The 60-an-hour this once claimed is not
 * a figure the API states anywhere; what SB1 actually does is send
 * `x-ratelimit-remaining` on every response and answer 429 at zero, which
 * `sb1.noteLimits` reads. So treat this as a self-imposed brake — it exists to
 * stop a reload loop, two browser tabs or a restarting watcher turning one
 * intended refresh into several, and it is deliberately set below whatever the
 * real ceiling turns out to be.
 *
 * Raising `SB1_HOURLY_CAP` past that ceiling does not buy requests, it only
 * moves who refuses: the bank starts answering 429, and each one still costs a
 * slot here because `spend` is called before the request goes out.
 *
 * The ledger lives on disk precisely so it survives a restart. An in-memory
 * counter would reset exactly when the risk is highest.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

const LEDGER = 'data/api-budget.json';
const WINDOW_MS = 3600_000;

/** Low enough that a hand-run `sync` still works after the app has refreshed. */
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
      `Local request budget spent: ${used}/${HOURLY_CAP} in the last hour. ` +
        `This is our own brake, not the bank's — wait, or raise SB1_HOURLY_CAP, ` +
        `and expect the bank's own 429 somewhere past it.`,
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
