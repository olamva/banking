import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { get, login, ReauthRequired } from './net/sb1.ts';
import * as eb from './net/eb.ts';
import { parseStatement, statementRange } from './core/statement.ts';
import { openDb, queryMonth, queryRange } from './core/db.ts';
import { monthStats, yearStats, byMonth, blindSpot } from './core/stats.ts';
import { writeDashboard } from './web/dashboard.ts';
import { rebuildAll, DB_FILE, RAW } from './core/pipeline.ts';
import { syncMonth, ebSyncMonth } from './net/sync.ts';
import { serve } from './web/serve.ts';
import { used, remaining, HOURLY_CAP } from './net/budget.ts';
import type { Categorized } from './core/types.ts';

const args = process.argv.slice(2);
const cmd = args[0];
const flag = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? undefined : args[i + 1];
};
const has = (name: string) => args.includes(`--${name}`);
const needMonth = (c: string) => flag('month') ?? raise(`${c} needs --month YYYY-MM`);
const raise = (msg: string): never => {
  throw new Error(msg);
};

const ACCOUNTS_RAW = `${RAW}/accounts.json`;

async function dump(file: string, data: unknown): Promise<void> {
  await mkdir(file.slice(0, file.lastIndexOf('/')), { recursive: true });
  await writeFile(file, JSON.stringify(data, null, 2));
  console.error(`wrote ${file}`);
}

/** Pull accounts once, keep the raw dump, derive a key list. */
async function accounts(): Promise<void> {
  const include = new URLSearchParams({
    includeCreditCardAccounts: 'true',
    includeBsuAccounts: 'true',
    includeAskAccounts: 'true',
  });
  const raw = await get(`/personal/banking/accounts?${include}`);
  await dump(ACCOUNTS_RAW, raw);

  const list = (raw as { accounts?: { key?: string }[] }).accounts;
  const keys = list?.map((a) => a.key).filter((k): k is string => !!k) ?? [];
  if (!keys.length) {
    console.error(`No accounts[].key found — inspect ${ACCOUNTS_RAW} and adjust before syncing.`);
    return;
  }
  if (!existsSync('accounts.json')) {
    // mine defaults true; hand-edit before trusting internal-transfer detection.
    await dump('accounts.json', Object.fromEntries(keys.map((k) => [k, { mine: true }])));
  }
  console.error(`${keys.length} account keys.`);
}

/** Enable Banking: authorise once, then the card is readable for 90 days. */
async function ebLogin(): Promise<void> {
  const session = await eb.login();
  await dump(eb.sessionFile, session);
  for (const a of session.accounts) {
    console.error(`  ${a.uid} | ${a.cash_account_type} | ${a.product ?? ''} ${a.currency ?? ''}`);
  }
}

/**
 * Ingest a statement export and rebuild. There is no API behind this — the
 * issuer publishes the merchant only in the CSV you download from the portal,
 * which is the whole reason src/statement.ts exists — so it stays a manual
 * export, and this command is the manual step made repeatable.
 *
 * Stored under its own booking-date range, and never over an existing file:
 * data/raw/ is immutable. Re-running with the same export is a no-op.
 */
async function statement(): Promise<void> {
  const src = args[1];
  if (!src) throw new Error('statement needs a path: pnpm sb1 statement ~/Downloads/transactions.csv');

  const csv = await readFile(src.replace(/^~/, process.env.HOME ?? '~'), 'utf8');
  const rows = parseStatement(csv);
  if (!rows.length) throw new Error(`${src} parsed to no rows — is it the issuer's CSV export?`);

  const { from, to } = statementRange(rows);
  const dir = `${RAW}/card-statements`;
  const dest = `${dir}/${from}_${to}.csv`;
  await mkdir(dir, { recursive: true });

  if (existsSync(dest)) {
    if ((await readFile(dest, 'utf8')) === csv) {
      console.error(`${dest} already holds this export — nothing to do`);
    } else {
      throw new Error(`${dest} exists with different content. data/raw/ is immutable: rename or remove it first.`);
    }
  } else {
    await writeFile(dest, csv);
    console.error(`wrote ${dest} — ${rows.length} rows, ${from} to ${to}`);
  }
  await rebuildAll();
}

const nok = (n: number) => `${Math.round(n).toLocaleString('nb-NO')} kr`;
const pct = (share: number) => `${(share * 100).toFixed(1)}%`;
const pad = (s: string, w: number) => s.padEnd(w);

/** Card rows only carry a merchant once a statement export covers them. */
function blindSpotNote(rows: Categorized[]): string {
  const blind = blindSpot(rows);
  return blind.count ? `, ${blind.count} rows with no merchant (${nok(blind.total)})` : ', every row has a merchant';
}

function reportMonth(month: string, rows: Categorized[], previous: Categorized[]): void {
  const s = monthStats(month, rows, previous.length ? previous : undefined);
  console.log(`\n${month}   ${rows.length} rows`);
  console.log(`  in ${nok(s.totalIn)}   out ${nok(s.totalOut)}   net ${nok(s.net)}`);
  console.log(`  card ${pct(s.cardShare)} of spending${blindSpotNote(rows)}`);
  console.log(`  excluded ${s.excluded.count} txns, ${nok(s.excluded.total)} of volume`);
  console.log('  categories');
  for (const c of s.categories) console.log(`    ${pad(c.category, 24)} ${pad(nok(c.total), 12)} ${pct(c.share)}`);
  if (s.topCounterparties.length) {
    console.log('  top counterparties');
    for (const c of s.topCounterparties) console.log(`    ${pad(c.counterparty.slice(0, 30), 32)} ${pad(nok(c.total), 12)} ${c.count}x`);
  }
  console.log(`  subscriptions ${s.subscriptions.length}, recurring ${s.recurring.length}`);
}

function reportYear(year: string, rows: Categorized[]): void {
  const y = yearStats(year, byMonth(rows));
  console.log(`\n${year}   ${rows.length} rows across ${y.months.length} months`);
  console.log(`  ${pad('month', 10)} ${pad('out', 12)} ${pad('in', 12)} ${pad('net', 12)} ${pad('card', 7)} excluded`);
  for (const m of y.months) {
    console.log(`  ${pad(m.month, 10)} ${pad(nok(m.totalOut), 12)} ${pad(nok(m.totalIn), 12)} ${pad(nok(m.net), 12)} ${pad(pct(m.cardShare), 7)} ${m.excluded.count} / ${nok(m.excluded.total)}`);
  }
  console.log(`  average month: out ${nok(y.averageMonth.totalOut)}, in ${nok(y.averageMonth.totalIn)}, net ${nok(y.averageMonth.net)}`);
  console.log(`  card ${pct(y.cardShare)} of spending${blindSpotNote(rows)}`);
  console.log(`  excluded ${y.excluded.count} txns, ${nok(y.excluded.total)} of volume`);
  console.log('  categories');
  for (const c of y.categories) console.log(`    ${pad(c.category, 24)} ${pad(nok(c.total), 12)} ${pct(c.share)}`);
}

/** Reads the database, never data/raw/ — run `import` first. */
function report(): void {
  const month = flag('month');
  const year = flag('year');
  if (!month && !year) throw new Error('report needs --month YYYY-MM or --year YYYY');
  const db = openDb(DB_FILE);
  try {
    if (month) {
      const [y, m] = month.split('-').map(Number);
      const prev = new Date(Date.UTC(y!, m! - 2, 1)).toISOString().slice(0, 7);
      reportMonth(month, queryMonth(db, month), queryMonth(db, prev));
    } else {
      reportYear(year!, queryRange(db, `${year}-01`, `${year}-12`));
    }
  } finally {
    db.close();
  }
}

/** Local file, opened locally. It embeds every transaction — never share it. */
async function dashboard(): Promise<void> {
  const db = openDb(DB_FILE);
  const rows = queryRange(db, '0000-00', '9999-99');
  db.close();
  await writeDashboard(rows);
  console.error(`wrote data/dashboard.html — ${rows.length} rows, local file, do not share`);
}

try {
  if (cmd === 'login') await login();
  else if (cmd === 'accounts') await accounts();
  else if (cmd === 'sync') await syncMonth(needMonth('sync'), has('force'));
  else if (cmd === 'eb-login') await ebLogin();
  else if (cmd === 'eb-sync') await ebSyncMonth(needMonth('eb-sync'), has('force'));
  else if (cmd === 'statement') await statement();
  else if (cmd === 'rebuild') await rebuildAll();
  else if (cmd === 'report') report();
  else if (cmd === 'dashboard') await dashboard();
  else if (cmd === 'budget') console.error(`${used()}/${HOURLY_CAP} SB1 requests used this hour, ${remaining()} left`);
  else if (cmd === 'dev') {
    serve(Number(flag('port') ?? 4000), {
      pull: !has('no-pull'),
      maxAgeMin: Number(flag('max-age') ?? 360),
    });
  } else {
    console.error('usage: pnpm sb1 <login | accounts | sync --month YYYY-MM [--force]');
    console.error('                | eb-login | eb-sync --month YYYY-MM [--force]');
    console.error('                | statement <file.csv> | rebuild');
    console.error('                | report --month YYYY-MM | report --year YYYY | dashboard');
    console.error('                | dev [--port 4000] [--max-age 360] [--no-pull] | budget>');
    process.exit(1);
  }
} catch (e) {
  // Every throw here is a message meant for the person running the command —
  // a missing flag, an expired consent, a file that would overwrite raw data.
  // The stack is noise that buries it; set DEBUG to get it back.
  console.error(e instanceof Error && !process.env.DEBUG ? e.message : e);
  process.exit(1);
}
