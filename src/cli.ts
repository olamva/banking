import { mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { get, login } from './net/sb1.ts';
import { rebuildAll, RAW } from './core/pipeline.ts';
import { syncMonth, syncRange } from './net/sync.ts';
import { loadPeers } from './core/categorize.ts';
import { newPeers } from './core/peers.ts';
import { serve, DEFAULT_MAX_AGE_MIN } from './web/serve.ts';
import { remaining } from './net/budget.ts';

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

  type Account = { key?: string; accountNumber?: string; name?: string; description?: string; type?: string };
  const list = (raw as { accounts?: Account[] }).accounts;
  const found = list?.filter((a): a is Account & { key: string } => !!a.key) ?? [];
  if (!found.length) {
    console.error(`No accounts[].key found — inspect ${ACCOUNTS_RAW} and adjust before syncing.`);
    return;
  }
  if (!existsSync('rules/accounts.json')) {
    // `mine` defaults true for everything but the card; hand-edit before
    // trusting internal-transfer detection. The number rides along because
    // `exclude` reads it: a row whose remoteAccountNumber is one of these is a
    // self-transfer whatever the bank types it as, which is the only way a giro
    // between my own accounts is seen.
    //
    // `name` is the label the dashboard shows — see `Txn.account`. The card's
    // own `name` is its masked number, so its `description` is the better one,
    // and every name here is worth rewriting into something you would say out
    // loud. Nothing downstream cares what they are.
    const card = (a: Account) => a.type === 'CREDITCARD';
    await dump(
      'rules/accounts.json',
      Object.fromEntries(
        found.map((a) => [
          a.key,
          {
            mine: !card(a),
            ...(card(a) ? { card: true } : {}),
            name: (card(a) ? a.description : a.name) ?? a.name ?? a.key,
            number: a.accountNumber,
          },
        ]),
      ),
    );
  }
  console.error(`${found.length} account keys.`);
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
  else if (cmd === 'sync') {
    const from = flag('from');
    const to = flag('to');
    // `--stale N` is a force that stops short of what it just fetched: re-run it
    // after a 429 and only the accounts the first run never reached cost a
    // request. Plain `--force` refetches the lot, every time.
    const stale = flag('stale');
    if (stale !== undefined && !(Number(stale) > 0)) raise('--stale wants minutes, e.g. --stale 60');
    const force = stale === undefined ? has('force') : Number(stale);
    if (from || to) {
      if (!from || !to) raise('sync needs both --from and --to, as YYYY or YYYY-MM');
      await syncRange(from!, to!, force);
    } else {
      await syncMonth(needMonth('sync'), force);
    }
  }
  else if (cmd === 'rebuild') await rebuildAll();
  else if (cmd === 'peers') await peers();
  else if (cmd === 'budget') {
    // The bank's own figure, cached from the last response. Nothing on disk
    // means nothing has called it recently, not that there is nothing left.
    const left = remaining();
    console.error(
      left === null
        ? 'SB1 has not said what is left recently — the next request will ask.'
        : `SB1 last reported ${left} requests left; it refills continuously.`,
    );
  }
  else if (cmd === 'dev') {
    await serve(Number(flag('port') ?? 4000), {
      pull: has('pull'),
      maxAgeMin: Number(flag('max-age') ?? DEFAULT_MAX_AGE_MIN),
    });
  } else {
    console.error('usage: pnpm sb1 <login | accounts | rebuild');
    console.error('                | sync --month YYYY-MM [--force | --stale MINUTES]');
    console.error('                | sync --from YYYY[-MM] --to YYYY[-MM] [--force | --stale MINUTES]');
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
