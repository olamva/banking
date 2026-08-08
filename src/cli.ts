import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { get, login, monthRange, ReauthRequired } from './sb1.ts';

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

try {
  if (cmd === 'login') await login();
  else if (cmd === 'accounts') await accounts();
  else if (cmd === 'sync') await sync();
  else {
    console.error('usage: pnpm sb1 <login | accounts | sync --month YYYY-MM [--force]>');
    process.exit(1);
  }
} catch (e) {
  console.error(e instanceof ReauthRequired ? e.message : e);
  process.exit(1);
}
