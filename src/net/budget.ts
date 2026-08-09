/**
 * The bank's own request budget: what it last reported, plus what it has handed
 * back since.
 *
 * **There is no local cap any more.** There used to be a rolling-hour ledger of
 * our own timestamps with an `SB1_HOURLY_CAP`, and the window was the wrong
 * shape: it held a request against you for a full 60 minutes after it was
 * fired, so an hour of history refused long after SB1 would have said yes.
 *
 * What SB1 actually does — 60 requests an hour per API, per its FAQ, and
 * `x-ratelimit-remaining` on every response with a 429 at zero — behaves as a
 * bucket that refills as minutes pass rather than a quarantine on each call. So
 * this keeps two numbers and derives the rest: the last figure the bank
 * reported, and when it reported it. `remaining` credits `REFILL_MS` of elapsed
 * time back at one request a minute, capped at `CAP`.
 *
 * That model needs no expiry, which is the point. A `0` seen an hour ago is
 * worth a full bucket now, not a refusal, and a 429 clears itself at one probe
 * a minute instead of waiting out a window nobody can observe.
 *
 * `spend` counts down for calls whose response has not come back yet; `note`
 * then replaces the estimate with fact. Where they disagree, the bank wins.
 *
 * ponytail: one bucket for all of SB1, though the FAQ says the quota is per
 * API. Only `/transactions` is ever called in bulk, so a second ledger would
 * track a number nothing spends. Split it if another endpoint gets hot.
 *
 * The file survives a restart on purpose. Holding this in memory would forget
 * it exactly when two tabs or a restarting watcher make it matter.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

const LEDGER = 'data/api-budget.json';

/** SB1's stated quota — "normally 60 API requests each hour", per its FAQ. */
const CAP = 60;

/** 60 an hour, handed back one at a time rather than all at once. */
const REFILL_MS = 3600_000 / CAP;

type Ledger = { remaining: number; at: number };

/**
 * The reading brought forward to `now`.
 *
 * `at` advances by whole refills only, never to `now`: rounding it up would
 * throw away the part-minute already accrued, and a burst of calls would each
 * push the next refill another minute out.
 */
function accrue(l: Ledger, now: number): Ledger {
  const credits = Math.floor((now - l.at) / REFILL_MS);
  if (credits <= 0) return l; // also covers a clock that went backwards
  return { remaining: Math.min(CAP, l.remaining + credits), at: l.at + credits * REFILL_MS };
}

function read(path: string, now: number): Ledger | null {
  if (!existsSync(path)) return null;
  try {
    const l = JSON.parse(readFileSync(path, 'utf8')) as Ledger;
    if (typeof l?.remaining !== 'number' || typeof l?.at !== 'number') return null;
    return accrue(l, now);
  } catch {
    return null; // a corrupt ledger must not wedge the CLI; worst case we re-learn
  }
}

function write(path: string, l: Ledger): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(l));
}

/**
 * What the bank has left: its last word, less what we have spent since, plus
 * what a minute a request has handed back. Null only when it has never said —
 * which means "ask it", not "nothing left".
 */
export function remaining(path = LEDGER, now = Date.now()): number | null {
  return read(path, now)?.remaining ?? null;
}

/** Whether `cost` more calls fit. Unknown is not a refusal. */
export function canAfford(cost: number, path = LEDGER, now = Date.now()): boolean {
  const left = remaining(path, now);
  return left === null || left >= cost;
}

export class BudgetExhausted extends Error {
  constructor(waitMs: number) {
    super(
      `SpareBank 1 has 0 of its ${CAP} requests an hour left. It hands them ` +
        `back one a minute — about ${Math.ceil(waitMs / 1000)}s for the next.`,
    );
  }
}

/** What a response reported, replacing whatever `spend` had estimated. */
export function note(left: number, path = LEDGER, now = Date.now()): void {
  write(path, { remaining: left, at: now });
}

/**
 * Records one call about to go out, refusing if there is nothing left to spend.
 * Called from the single request choke point, so nothing slips past uncounted —
 * but it only ever *estimates*: `note` has the last word.
 */
export function spend(path = LEDGER, now = Date.now()): void {
  const l = read(path, now);
  if (!l) return; // no word from the bank yet — its 429 is the brake
  if (l.remaining <= 0) throw new BudgetExhausted(l.at + REFILL_MS - now);
  write(path, { ...l, remaining: l.remaining - 1 });
}
