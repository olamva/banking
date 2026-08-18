// The bank's own count, not a local cap: a refilling bucket, so a `0` seen an
// hour ago is worth a full bucket now. Where estimate and bank disagree, the
// bank wins. Persisted so two tabs or a restart cannot forget it.
// ponytail: one bucket for all of SB1 though the quota is per API. Split it if
// an endpoint other than `/transactions` gets hot.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

const LEDGER = "data/api-budget.json";

const CAP = 60;

const REFILL_MS = 3600_000 / CAP;

type Ledger = { remaining: number; at: number };

function accrue(l: Ledger, now: number): Ledger {
  const credits = Math.floor((now - l.at) / REFILL_MS);
  if (credits <= 0) return l; // also covers a clock that went backwards
  return {
    remaining: Math.min(CAP, l.remaining + credits),
    at: l.at + credits * REFILL_MS,
  };
}

function read(path: string, now: number): Ledger | null {
  if (!existsSync(path)) return null;
  try {
    const l = JSON.parse(readFileSync(path, "utf8")) as Ledger;
    if (typeof l?.remaining !== "number" || typeof l?.at !== "number")
      return null;
    return accrue(l, now);
  } catch {
    return null; // a corrupt ledger must not wedge the CLI; worst case we re-learn
  }
}

function write(path: string, l: Ledger): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(l));
}

export function remaining(path = LEDGER, now = Date.now()): number | null {
  return read(path, now)?.remaining ?? null;
}

export function canAfford(
  cost: number,
  path = LEDGER,
  now = Date.now(),
): boolean {
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

export function note(left: number, path = LEDGER, now = Date.now()): void {
  write(path, { remaining: left, at: now });
}

export function spend(path = LEDGER, now = Date.now()): void {
  const l = read(path, now);
  if (!l) return; // no word from the bank yet — its 429 is the brake
  if (l.remaining <= 0) throw new BudgetExhausted(l.at + REFILL_MS - now);
  write(path, { ...l, remaining: l.remaining - 1 });
}
