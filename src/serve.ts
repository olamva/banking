/**
 * `pnpm dev` — the dashboard as a living page instead of a generated file.
 *
 * Every request re-reads the database and re-renders, so an `import` in another
 * terminal shows up on reload with no build step. If the data has gone stale it
 * also re-syncs the current month first.
 *
 * That last part is the dangerous one. SpareBank 1 allows 60 requests an hour
 * and a refresh costs one per account, so anything that turns a page view into
 * a sync has to be defended on several sides at once:
 *
 * - staleness is recorded on disk, so restarting the server — which `--watch`
 *   does on every save — does not re-trigger a pull;
 * - the request ledger is on disk too, and `sb1.get` refuses past the cap;
 * - one refresh runs at a time, so two tabs share it rather than doubling it;
 * - a refresh that fails is remembered as an attempt, so a broken token
 *   produces one failure per interval instead of one per reload;
 * - only the current month is pulled, plus the previous one early in a month
 *   while card transactions are still posting;
 * - and `--no-pull` turns the whole thing off for offline work on the page.
 */
import { createServer } from 'node:http';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { openDb, queryRange } from './db.ts';
import { renderDashboard } from './dashboard.ts';
import { importMonths, DB_FILE } from './pipeline.ts';
import { syncMonth, ebSyncMonth, syncCost } from './sync.ts';
import { canAfford, remaining, used, HOURLY_CAP } from './budget.ts';

const STATE = 'data/sync-state.json';

/** Long enough that a day's work never triggers a second pull by accident. */
const DEFAULT_MAX_AGE_MIN = 360;

type State = { lastAttempt?: number };

function readState(): State {
  if (!existsSync(STATE)) return {};
  try {
    return JSON.parse(readFileSync(STATE, 'utf8')) as State;
  } catch {
    return {};
  }
}

function markAttempt(now = Date.now()): void {
  mkdirSync('data', { recursive: true });
  writeFileSync(STATE, JSON.stringify({ lastAttempt: now }));
}

export function ageMinutes(state: State, now = Date.now()): number | null {
  return state.lastAttempt === undefined ? null : (now - state.lastAttempt) / 60_000;
}

/** Current month, and the previous one too while its card rows are still landing. */
export function monthsToRefresh(now = new Date()): string[] {
  const month = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  const months = [month(now)];
  if (now.getDate() <= 7) {
    months.unshift(month(new Date(now.getFullYear(), now.getMonth() - 1, 1)));
  }
  return months;
}

/**
 * Joins the run already in progress instead of starting a second one.
 *
 * The returned function must do its check and its assignment in one synchronous
 * tick. An `await` between the two is enough for three tabs to each see nothing
 * running and each start a pull — which is exactly how this went wrong the
 * first time, turning one refresh into three and spending 18 requests.
 */
export function singleFlight(): (fn: () => Promise<void>) => Promise<void> {
  let inFlight: Promise<void> | null = null;
  return (fn) => {
    if (inFlight) return inFlight;
    inFlight = fn().finally(() => {
      inFlight = null;
    });
    return inFlight;
  };
}

const join = singleFlight();

async function refresh(months: string[], age: number | null): Promise<void> {
  const cost = (await syncCost()) * months.length;
  if (!canAfford(cost)) {
    console.error(`skipping refresh: needs ${cost} requests, ${remaining()} left this hour`);
    return;
  }
  console.error(`data is ${age === null ? 'unsynced' : `${Math.round(age)} min old`}, refreshing ${months.join(', ')}`);

  // Recorded before the work, not after: a refresh that throws must still count
  // as an attempt, or a dead token turns every page load into another retry.
  markAttempt();

  // One source failing must not discard what the other fetched. The card leg in
  // particular fails on its own schedule — an expired consent, an ASPSP error —
  // and the bank rows that already landed are still worth importing.
  for (const month of months) {
    for (const leg of [syncMonth, ebSyncMonth]) {
      try {
        await leg(month, true);
      } catch (e) {
        console.error(`${leg.name} ${month} failed: ${e instanceof Error ? e.message : e}`);
      }
    }
  }
  await importMonths(months);
}

/** A failed refresh must never take the page down — serve whatever is on disk. */
async function settle(p: Promise<void>): Promise<void> {
  try {
    await p;
  } catch (e) {
    console.error(`refresh failed, serving existing data: ${e instanceof Error ? e.message : e}`);
  }
}

/**
 * Deliberately not `async`. Everything before `join(...)` has to run in one
 * synchronous tick, or concurrent requests slip past the gate — see
 * `singleFlight`. The budget check lives inside `refresh` for the same reason:
 * it reads a file, and awaiting it here would reopen the race.
 */
function maybeRefresh(maxAgeMin: number): Promise<void> {
  const age = ageMinutes(readState());
  if (age !== null && age < maxAgeMin) return Promise.resolve();
  return settle(join(() => refresh(monthsToRefresh(), age)));
}

function page(): string {
  const db = openDb(DB_FILE);
  try {
    return renderDashboard(queryRange(db, '0000-00', '9999-99'));
  } finally {
    db.close();
  }
}

export function serve(port: number, opts: { pull: boolean; maxAgeMin: number }): void {
  const server = createServer((req, res) => {
    if (req.url === '/favicon.ico') {
      res.writeHead(204).end();
      return;
    }
    void (async () => {
      try {
        if (opts.pull) await maybeRefresh(opts.maxAgeMin);
        const html = page();
        res.writeHead(200, {
          'Content-Type': 'text/html; charset=utf-8',
          // Always re-render; a cached page is the opposite of the point.
          'Cache-Control': 'no-store',
        });
        res.end(html);
      } catch (e) {
        res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end(`${e instanceof Error ? e.message : e}\n`);
      }
    })();
  });

  server.listen(port, '127.0.0.1', () => {
    console.error(`http://localhost:${port}`);
    console.error(
      opts.pull
        ? `auto-refresh when data is over ${opts.maxAgeMin} min old — ${used()}/${HOURLY_CAP} requests used this hour`
        : 'auto-refresh off (--no-pull)',
    );
    console.error('local only, and it holds every transaction — do not expose this port');
  });
}
