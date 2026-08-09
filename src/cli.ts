import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { get, login } from './net/sb1.ts';
import * as eb from './net/eb.ts';
import { parseStatement, statementRange } from './core/statement.ts';
import { rebuildAll, RAW } from './core/pipeline.ts';
import { syncMonth, ebSyncMonth } from './net/sync.ts';
import { loadPeers } from './core/categorize.ts';
import { newPeers } from './core/peers.ts';
import { serve, DEFAULT_MAX_AGE_MIN } from './web/serve.ts';
import { used, remaining, HOURLY_CAP } from './net/budget.ts';

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
  // All five, because the default on every one of them is false and an account
  // left out here is invisible everywhere downstream — the share savings account
  // was, and its transfers counted as income until `exclude` learned its number.
  const include = new URLSearchParams({
    includeCreditCardAccounts: 'true',
    includeBsuAccounts: 'true',
    includeAskAccounts: 'true',
    includePensionAccounts: 'true',
    includeCurrencyAccounts: 'true',
  });
  const raw = await get(`/personal/banking/accounts?${include}`);
  await dump(ACCOUNTS_RAW, raw);

  const list = (raw as { accounts?: { key?: string; accountNumber?: string }[] }).accounts;
  const mine = list?.filter((a): a is { key: string; accountNumber?: string } => !!a.key) ?? [];
  if (!mine.length) {
    console.error(`No accounts[].key found — inspect ${ACCOUNTS_RAW} and adjust before syncing.`);
    return;
  }
  if (!existsSync('rules/accounts.json')) {
    // mine defaults true; hand-edit before trusting internal-transfer detection.
    // The number rides along because `exclude` reads it: a row whose
    // remoteAccountNumber is one of these is a self-transfer whatever the bank
    // types it as, which is the only way a giro between my own accounts is seen.
    await dump(
      'rules/accounts.json',
      Object.fromEntries(mine.map((a) => [a.key, { mine: true, number: a.accountNumber }])),
    );
  }
  console.error(`${mine.length} account keys.`);
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

/**
 * Copy transaction rows out of the dashboard, get the names back ready to paste
 * into rules/vipps.json. Prints, never writes: nothing under rules/ is a tool's
 * to rewrite. Names go to stdout alone, so `pnpm sb1 peers | pbcopy` is clean.
 */
async function peers(): Promise<void> {
  const names = newPeers(execFileSync('pbpaste', { encoding: 'utf8' }), await loadPeers());
  if (!names.length) {
    console.error('no new names on the clipboard — copy the rows, columns and all');
    return;
  }
  for (const name of names) console.log(name);
}

try {
  if (cmd === 'login') await login();
  else if (cmd === 'accounts') await accounts();
  else if (cmd === 'sync') await syncMonth(needMonth('sync'), has('force'));
  else if (cmd === 'eb-login') await ebLogin();
  else if (cmd === 'eb-sync') await ebSyncMonth(needMonth('eb-sync'), has('force'));
  else if (cmd === 'statement') await statement();
  else if (cmd === 'rebuild') await rebuildAll();
  else if (cmd === 'peers') await peers();
  else if (cmd === 'budget') console.error(`${used()}/${HOURLY_CAP} SB1 requests used this hour, ${remaining()} left`);
  else if (cmd === 'dev') {
    await serve(Number(flag('port') ?? 4000), {
      pull: has('pull'),
      maxAgeMin: Number(flag('max-age') ?? DEFAULT_MAX_AGE_MIN),
    });
  } else {
    console.error('usage: pnpm sb1 <login | accounts | sync --month YYYY-MM [--force]');
    console.error('                | eb-login | eb-sync --month YYYY-MM [--force]');
    console.error('                | statement <file.csv> | rebuild');
    console.error('                | peers  (clipboard rows -> names for rules/vipps.json)');
    console.error('                | dev [--port 4000] [--pull [--max-age 360]] | budget>');
    process.exit(1);
  }
} catch (e) {
  // Every throw here is a message meant for the person running the command —
  // a missing flag, an expired consent, a file that would overwrite raw data.
  // The stack is noise that buries it; set DEBUG to get it back.
  console.error(e instanceof Error && !process.env.DEBUG ? e.message : e);
  process.exit(1);
}
