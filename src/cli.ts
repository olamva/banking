import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { get, login } from './net/sb1.ts';
import { monthsOnDisk, pipeline, rebuildAll, RAW } from './core/pipeline.ts';
import type { Categorized } from './core/types.ts';
import { syncMonth, syncRange } from './net/sync.ts';
import { loadGiro, loadOverrides, loadPeers, loadSubscriptions } from './core/categorize.ts';
import { newPeers } from './core/peers.ts';
import { narrowings, overrideReport, pairUse, unnamed } from './core/report.ts';
import { merchantClusters, nearMisses } from './core/merchants.ts';
import { openDb, queryRange } from './core/db.ts';
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

/**
 * The merchants SB1 sends under more than one name, and the line that would
 * collapse each set. Prints, never writes — same division as `peers`: nothing
 * under rules/ is a tool's to rewrite.
 *
 * Reads the database, which already has rules/payees.json applied, so a
 * merchant that file already covers arrives as one name and never appears here.
 */
function merchants(): void {
  const kr = (n: number) => `${Math.round(n).toLocaleString('nb-NO')} kr`;
  const db = openDb();
  const rows = queryRange(db, '0000-00', '9999-99');
  db.close();
  const clusters = merchantClusters(rows);

  for (const c of clusters) {
    console.log();
    for (const m of c.members) console.log(`  ${m.name}   ${m.rows}`);
    console.log(
      c.pattern
        ? `  -> ${JSON.stringify(c.pattern)}: ${JSON.stringify(c.name)}   ${c.rows} rows, ${kr(c.total)}`
        : `  -> no safe shared pattern, write one by hand   ${c.rows} rows, ${kr(c.total)}`,
    );
    // Two categories under one merchant means a rule reaches some of its
    // spellings and not the rest — worth more than the rename itself.
    if (c.categories.length > 1) console.log(`     ! ${c.categories.length} categories: ${c.categories.join(', ')}`);
    if (c.collateral.length) console.log(`     ! also matches: ${c.collateral.join(' / ')}`);
  }
  // What the prefix grouping never tried, so its ceiling is visible instead of
  // silent: two spellings that disagree early never meet above, however plainly
  // they are the same shop.
  const misses = nearMisses(rows);
  if (misses.length) {
    console.log('\n--- never clustered, but share a word ---');
    for (const m of misses) {
      console.log();
      console.log(`  ${m.token}`);
      for (const x of m.members) console.log(`    ${x.name}   ${x.rows} rows, ${kr(x.total)}`);
    }
  }
  console.error(
    clusters.length
      ? `\n${clusters.length} merchants under more than one name, ${kr(clusters.reduce((n, c) => n + c.total, 0))} between them.` +
          `\n${misses.length} more share a word without sharing a prefix — read those before believing the list above is complete.`
      : 'every merchant goes by one name already.',
  );
}

/**
 * Which lines of rules/overrides.json the bank's own subcategory has made
 * redundant, and where the two disagree. Prints, never writes.
 *
 * `--all` adds the two wider views: every bank pair against what we file its
 * rows as, and the categories we assign that no bank pair backs — the ones
 * needing a name of their own on a two-level page.
 */
async function categories(all: boolean): Promise<void> {
  const kr = (n: number) => `${Math.round(n).toLocaleString('nb-NO')} kr`;
  const accounts: Record<string, { card?: boolean }> = JSON.parse(
    await readFile('rules/accounts.json', 'utf8'),
  );
  const cards = new Set(Object.entries(accounts).filter(([, a]) => a.card).map(([k]) => k));

  // Straight from data/raw/, and deliberately not from the database: the store
  // holds names `renamePayees` has already rewritten, and that rename runs
  // *after* `categorize`. Judging a rule against a name it never saw inverts
  // verdicts — `rules/payees.json` renames one payee into a string a different
  // override pattern matches, which moved 353 rows in the first run of this.
  const rows: Categorized[] = [];
  for (const month of monthsOnDisk()) rows.push(...(await pipeline(month, { rename: false })));

  const report = overrideReport(
    rows,
    await loadOverrides(),
    await loadSubscriptions(),
    await loadPeers(),
    await loadGiro(),
    cards,
  );

  const MARK = {
    redundant: 'DELETE  ',
    rewrite: 'REWRITE ',
    diverges: 'ARGUE   ',
    'load-bearing': 'KEEP    ',
    mixed: 'READ    ',
    unused: 'UNUSED  ',
  };
  for (const verdict of ['redundant', 'rewrite', 'diverges', 'mixed', 'load-bearing', 'unused'] as const) {
    const lines = report.filter((r) => r.verdict === verdict);
    if (!lines.length) continue;
    console.log(`\n--- ${verdict} (${lines.length} patterns, ${lines.reduce((n, r) => n + r.rows, 0)} rows) ---`);
    for (const r of lines) {
      console.log(
        `\n${MARK[verdict]}${JSON.stringify(r.pattern)}: ${JSON.stringify(r.value)}   ${r.rows} rows, ${kr(r.total)}`,
      );
      // A rewrite is a line to copy. A divergence is not — the bank is making a
      // different claim there, and printing it the same way is how eight airport
      // shops nearly became travel.
      if (r.verdict === 'rewrite')
        console.log(`         -> ${JSON.stringify(r.pattern)}: ${JSON.stringify(r.suggest)}`);
      else if (r.suggest && r.verdict !== 'redundant')
        console.log(`         ?  the bank would say ${JSON.stringify(r.suggest)} — your call`);
      // A redundant line's outcomes all agree by definition, so only the
      // subcategory it would gain is worth the ink.
      for (const o of r.outcomes) {
        const gain = o.same ? '=' : '!';
        const conf = o.confidence && o.confidence < 100 ? ` @${o.confidence}` : '';
        console.log(`   ${gain} ${String(o.rows).padStart(4)}  -> ${o.fallback}${conf}   ${o.bankName}`);
        if (!o.same) console.log(`             ${o.examples.join(' / ')}`);
      }
    }
  }

  if (all) {
    console.log('\n--- every bank pair, against what we call it ---');
    for (const p of pairUse(rows)) {
      console.log(`\n  ${p.pair}   ${p.rows} rows   ${p.name}`);
      for (const o of p.ours) console.log(`      ${String(o.rows).padStart(5)}  ${o.category}`);
    }
    // Two ways off this list: name the slug, or rewrite the rules so it becomes
    // a pair the bank already sends. The report does not choose between them.
    console.log('\n--- ours alone: the bank never spells these, so they need a name ---');
    for (const u of unnamed(rows))
      console.log(`  ${String(u.rows).padStart(5)}  ${u.slug}   (${u.level})`);
  }

  // Printed every run, not behind --all: an override file that depends on its
  // own line order has an invisible requirement, and this is the only thing
  // that makes it visible.
  const loose = narrowings(rows, await loadOverrides());
  if (loose.length) {
    console.log('\n--- these lines only work where they sit in the file ---');
    for (const l of loose) {
      console.log(`\n${JSON.stringify(l.pattern)}: ${JSON.stringify(l.value)}`);
      for (const b of l.beaten)
        console.log(`   loses ${String(b.rows).padStart(4)} rows to ${JSON.stringify(b.pattern)}: ${JSON.stringify(b.value)}`);
      console.log(
        l.suggest
          ? `   -> ${JSON.stringify(l.suggest)}: ${JSON.stringify(l.value)}`
          : '   -> narrow by hand: one of the winners is anchored and cannot be inlined',
      );
    }
  }

  const n = (v: string) => report.filter((r) => r.verdict === v).reduce((a, r) => a + r.rows, 0);
  const p = (v: string) => report.filter((r) => r.verdict === v).length;
  console.error(
    `\n${report.length} patterns, ${rows.filter((t) => !t.excluded).length} rows in scope:` +
      `\n  ${p('redundant')} deletable    ${n('redundant')} rows   the bank already says this` +
      `\n  ${p('rewrite')} to rewrite   ${n('rewrite')} rows   our name for the pair the bank sends` +
      `\n  ${p('diverges')} to argue     ${n('diverges')} rows   the bank claims something else` +
      `\n  ${p('mixed')} to read      ${n('mixed')} rows   part bank, part ours` +
      `\n  ${p('load-bearing')} to keep      ${n('load-bearing')} rows   the bank has nothing better` +
      `\n  ${p('unused')} unused       matches nothing on record` +
      `\nA deletable line changes no row's category — its rows gain the bank's subcategory in exchange.` +
      `\n\n${loose.length} lines only work where they sit in the file.` +
      (loose.length
        ? `\nPaste the narrowed forms above and the order stops deciding anything.`
        : `\nNo line depends on its position, so rules/overrides.json can be sorted freely.`),
  );
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
  else if (cmd === 'merchants') merchants();
  else if (cmd === 'categories') await categories(has('all'));
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
    console.error('                | merchants  (one shop under many names -> rules/payees.json)');
    console.error('                | categories [--all]  (which rules/overrides.json lines the bank already covers)');
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
