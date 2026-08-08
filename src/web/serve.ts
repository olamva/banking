/**
 * `pnpm dev` — the dashboard, the only way it is served.
 *
 * Two things on one port: `/api/txns` reads the database and returns every row
 * as JSON, and everything else is handed to Vite, running in *middleware mode*
 * inside this process. That is why there is no `vite build`, no `dist/` and no
 * second port — the page is only ever run locally, so the dev server is the
 * only server it needs, and Ctrl-C stops one thing rather than two.
 *
 * The database is re-read per request, so a `rebuild` in another terminal shows
 * up on reload. With `--pull` a stale current month is re-synced first.
 *
 * That last part is the dangerous one, which is why it is opt-in and not the
 * default: analysis stays offline unless you ask. SpareBank 1 allows 60/hour
 * and a refresh costs one per account, so anything that turns a page view into
 * a sync has to be defended on several sides at once:
 *
 * - staleness is recorded on disk, so restarting the server does not re-trigger
 *   a pull;
 * - the request ledger is on disk too, and `sb1.get` refuses past the cap;
 * - one refresh runs at a time, so two tabs share it rather than doubling it;
 * - a refresh that fails is remembered as an attempt, so a broken token
 *   produces one failure per interval instead of one per reload;
 * - only the current month is pulled, plus the previous one early in a month
 *   while card transactions are still posting;
 * - and none of it happens at all without `--pull`.
 */
import { createServer } from 'node:http';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { openDb, queryRange } from '../core/db.ts';
import { rebuildAll, DB_FILE } from '../core/pipeline.ts';
import { syncMonth, ebSyncMonth, syncCost } from '../net/sync.ts';
import { canAfford, remaining, used, HOURLY_CAP } from '../net/budget.ts';

const STATE = 'data/sync-state.json';

/** Long enough that a day's work never triggers a second pull by accident. */
export const DEFAULT_MAX_AGE_MIN = 360;

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
  // A full reconstruct, not an upsert of just these months: SB1 reissues ids
  // mid-month, and only a rebuild drops the row the old id left behind.
  await rebuildAll();
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

/** Every row, as the page wants them. Re-read per request — a rebuild shows up on reload. */
function allTxns(): string {
  const db = openDb(DB_FILE);
  try {
    return JSON.stringify(queryRange(db, '0000-00', '9999-99'));
  } finally {
    db.close();
  }
}

export async function serve(port: number, opts: { pull: boolean; maxAgeMin: number }): Promise<void> {
  // Imported here rather than at the top: `pnpm sb1 report` loads this module's
  // siblings and has no business paying for Vite's startup.
  const { createServer: createViteServer } = await import('vite');
  const vite = await createViteServer({
    configFile: 'vite.config.ts',
    server: { middlewareMode: true },
    appType: 'spa',
  });

  const server = createServer((req, res) => {
    if (req.url !== '/api/txns') {
      vite.middlewares(req, res);
      return;
    }
    void (async () => {
      try {
        if (opts.pull) await maybeRefresh(opts.maxAgeMin);
        res.writeHead(200, {
          'Content-Type': 'application/json; charset=utf-8',
          // Always fresh; a cached copy of the data is the opposite of the point.
          'Cache-Control': 'no-store',
        });
        res.end(allTxns());
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
        : 'offline — pass --pull to auto-refresh stale data',
    );
    console.error('local only, and it holds every transaction — do not expose this port');
  });
}
