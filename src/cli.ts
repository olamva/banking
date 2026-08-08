import { mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { existsSync, readdirSync } from 'node:fs';
import { get, login, monthRange, ReauthRequired } from './sb1.ts';
import * as eb from './eb.ts';
import { normalizeMonth } from './normalize.ts';
import { exclude, type Accounts } from './exclude.ts';
import { categorize, loadOverrides } from './categorize.ts';
import { enrich, readStatements, parseStatement, statementRange, type StatementRow } from './statement.ts';
import { openDb, upsertMany, rebuild as rebuildDb, queryMonth, queryRange } from './db.ts';
import { monthStats, yearStats, byMonth } from './stats.ts';
import { writeDashboard } from './dashboard.ts';
import type { Categorized } from './types.ts';

const args = process.argv.slice(2);
const cmd = args[0];
const flag = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? undefined : args[i + 1];
};
const has = (name: string) => args.includes(`--${name}`);

const ACCOUNTS_RAW = 'data/raw/accounts.json';

async function dump(file: string, data: unknown): Promise<void> {
  await mkdir(file.slice(0, file.lastIndexOf('/')), { recursive: true });
  await writeFile(file, JSON.stringify(data, null, 2));
  console.error(`wrote ${file}`);
}

/** Step 2: pull accounts once, keep the raw dump, derive a key list. */
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

/** Step 3: one file per account per month. Idempotent unless --force. */
async function sync(): Promise<void> {
  const month = flag('month');
  if (!month) throw new Error('sync needs --month YYYY-MM');
  const { from, to } = monthRange(month);
  const keys = Object.keys(JSON.parse(await readFile('accounts.json', 'utf8')));

  for (const key of keys) {
    const file = `data/raw/${month}/${key}.json`;
    if (existsSync(file) && !has('force')) {
      console.error(`skip ${file}`);
      continue;
    }
    const q = `accountKey=${encodeURIComponent(key)}&fromDate=${from}&toDate=${to}`;
    await dump(file, await get(`/personal/banking/transactions/classified?${q}`));
  }
}

/** Enable Banking: authorise once, then the card is readable for 90 days. */
async function ebLogin(): Promise<void> {
  const session = await eb.login();
  await dump(eb.sessionFile, session);
  for (const a of session.accounts) {
    console.error(`  ${a.uid} | ${a.cash_account_type} | ${a.product ?? ''} ${a.currency ?? ''}`);
  }
}

/** Card transactions, same layout as the SB1 sync so normalize sees one tree. */
async function ebSync(): Promise<void> {
  const month = flag('month');
  if (!month) throw new Error('eb-sync needs --month YYYY-MM');
  const { from, to } = monthRange(month);
  for (const a of eb.readSession().accounts) {
    if (a.cash_account_type !== 'CARD') continue;
    const file = `data/raw/${month}/eb-${a.uid}.json`;
    if (existsSync(file) && !has('force')) {
      console.error(`skip ${file}`);
      continue;
    }
    await dump(file, { account: a, transactions: await eb.transactions(a.uid, from, to) });
  }
}

// --- offline half: nothing below this line touches the network ---------------

const DB_FILE = 'data/banking.db';
const RAW = 'data/raw';

/** Every YYYY-MM directory under data/raw/, ascending. */
function monthsOnDisk(): string[] {
  return readdirSync(RAW, { withFileTypes: true })
    .filter((e) => e.isDirectory() && /^\d{4}-\d{2}$/.test(e.name))
    .map((e) => e.name)
    .sort();
}

/**
 * Steps 4-6 for one month's raw files, plus the merchant lookup. Exclusion runs
 * per month because both sides of an internal transfer share a date, so they
 * are never split across two months — no need to hold the whole history in
 * memory to match them.
 *
 * Enrichment goes before exclusion so the merchant is available to overrides,
 * and it only writes `counterparty`, so the exclusion rules still match on the
 * source's own description.
 */
async function pipeline(month: string, statement: StatementRow[]): Promise<Categorized[]> {
  const accountsJson: Accounts = JSON.parse(await readFile('accounts.json', 'utf8'));
  const txns = enrich(normalizeMonth(`${RAW}/${month}`), statement);
  return categorize(exclude(txns, accountsJson), await loadOverrides());
}

const STATEMENTS = `${RAW}/card-statements`;

/**
 * Ingest a statement export and rebuild. There is no API behind this — the
 * issuer publishes the merchant only in the CSV you download from the portal,
 * which is the whole reason this file exists — so it is a manual export, and
 * this command is the manual step made repeatable.
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
  const dest = `${STATEMENTS}/${from}_${to}.csv`;
  await mkdir(STATEMENTS, { recursive: true });

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
  await rebuild();
}

/** Step 7: normalize -> exclude -> categorize -> upsert. Idempotent per (source, id). */
async function importCmd(): Promise<void> {
  const months = flag('month') ? [flag('month')!] : monthsOnDisk();
  const statement = readStatements();
  await mkdir('data', { recursive: true });
  const db = openDb(DB_FILE);
  for (const month of months) {
    const rows = await pipeline(month, statement);
    upsertMany(db, rows);
    console.error(`${month}: ${rows.length} rows`);
  }
  db.close();
}

/** The database is derived and disposable: throw it away and rebuild from data/raw/. */
async function rebuild(): Promise<void> {
  await rm(DB_FILE, { force: true });
  await mkdir('data', { recursive: true });
  const db = openDb(DB_FILE);
  const statement = readStatements();
  const rows: Categorized[] = [];
  for (const month of monthsOnDisk()) rows.push(...(await pipeline(month, statement)));
  rebuildDb(db, rows);
  console.error(`rebuilt ${DB_FILE} from ${monthsOnDisk().length} months, ${rows.length} rows`);
  db.close();
}

const nok = (n: number) => `${Math.round(n).toLocaleString('nb-NO')} kr`;
const pct = (share: number) => `${(share * 100).toFixed(1)}%`;
const pad = (s: string, w: number) => s.padEnd(w);

/**
 * Card rows only carry a merchant once the issuer's statement covers them, so
 * say how much is still unattributable rather than claiming the whole card
 * bucket is opaque — that stopped being true when the export landed.
 */
function blindSpot(rows: Categorized[]): string {
  const blind = rows.filter((t) => !t.excluded && t.amount < 0 && t.counterparty === null);
  if (!blind.length) return ', every row has a merchant';
  const total = blind.reduce((sum, t) => sum + -t.amount, 0);
  return `, ${blind.length} rows with no merchant (${nok(total)})`;
}

function reportMonth(month: string, rows: Categorized[], previous: Categorized[]): void {
  const s = monthStats(month, rows, previous.length ? previous : undefined);
  console.log(`\n${month}   ${rows.length} rows`);
  console.log(`  in ${nok(s.totalIn)}   out ${nok(s.totalOut)}   net ${nok(s.net)}`);
  console.log(`  card ${pct(s.cardShare)} of spending${blindSpot(rows)}`);
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
  console.log(`  card ${pct(y.cardShare)} of spending${blindSpot(rows)}`);
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
  if (month) {
    const [y, m] = month.split('-').map(Number);
    const prev = new Date(Date.UTC(y!, m! - 2, 1)).toISOString().slice(0, 7);
    reportMonth(month, queryMonth(db, month), queryMonth(db, prev));
  } else {
    reportYear(year!, queryRange(db, `${year}-01`, `${year}-12`));
  }
  db.close();
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
  else if (cmd === 'sync') await sync();
  else if (cmd === 'eb-login') await ebLogin();
  else if (cmd === 'eb-sync') await ebSync();
  else if (cmd === 'statement') await statement();
  else if (cmd === 'import') await importCmd();
  else if (cmd === 'rebuild') await rebuild();
  else if (cmd === 'report') report();
  else if (cmd === 'dashboard') await dashboard();
  else {
    console.error('usage: pnpm sb1 <login | accounts | sync --month YYYY-MM [--force]');
    console.error('                | eb-login | eb-sync --month YYYY-MM [--force]');
    console.error('                | statement <file.csv> | import [--month YYYY-MM] | rebuild');
    console.error('                | report --month YYYY-MM | report --year YYYY | dashboard>');
    process.exit(1);
  }
} catch (e) {
  // Every throw here is a message meant for the person running the command —
  // a missing flag, an expired consent, a file that would overwrite raw data.
  // The stack is noise that buries it; set DEBUG to get it back.
  console.error(e instanceof Error && !process.env.DEBUG ? e.message : e);
  process.exit(1);
}
