/**
 * One shop, several names — and the lines that would collapse them.
 *
 * SB1 formats a merchant differently per channel: BankAxept sends
 * `name(15) street(12) city`, the card sends `NAME, CITY, COUNTRY`, and the
 * bank's own cleaned form is a third spelling again. So one shop is five
 * entries in everything that groups by `merchantOf` — the table, the bars, the
 * filter chips and `subscriptionGroups` — and its per-merchant total is split
 * five ways. A prefix collapse over the real data finds 157 such clusters
 * covering 411 of the names.
 *
 * This is a report and only a report. The clustering below is a candidate
 * generator that is *allowed* to be wrong, because nothing it decides reaches
 * money: a cluster becomes real only when a line is pasted into
 * `rules/payees.json` by hand, and that file is what `renamePayees` runs.
 * Same division as `peers.ts` — propose, never write.
 *
 * It reads rows the database has already renamed, so a merchant that
 * `rules/payees.json` already covers arrives as a single name and falls out on
 * its own. Anything still holding two names is work not yet done, which is why
 * there is no separate check against the rules file.
 */
import { compile } from './categorize.ts';
import { merchantOf } from './select.ts';
import type { Categorized } from './types.ts';

export type Cluster = {
  /** Left side of the line to paste: a substring of every member. */
  pattern: string;
  /** Right side: the one name they should all go by. */
  name: string;
  /** Spellings in the cluster, most rows first. */
  members: { name: string; rows: number }[];
  rows: number;
  /** NOK, magnitude spent across the cluster. A refund inside it nets off. */
  total: number;
  /** What its rows are categorised as today. More than one is the interesting bug. */
  categories: string[];
  /** Merchants *outside* the cluster that `pattern` would also catch. */
  collateral: string[];
};

const SHARED = 12;
/** Below this, a shared prefix says nothing: `sit` starts a dozen unrelated payees. */
const MIN_NAME = 6;

/** Lowercased, the card's `, CITY, COUNTRY` tail cut off, punctuation flattened. */
const normalize = (name: string): string =>
  name
    .toLowerCase()
    .split(',')[0]!
    .replace(/[^a-z0-9æøå]+/g, ' ')
    .trim();

/**
 * Two spellings of one shop?
 *
 * ponytail: a shared prefix, not an understanding of the BankAxept layout.
 * Merchants sharing twelve characters merge, and one whose spellings differ
 * earlier does not. Upgrade path if review turns up real noise: strip a
 * trailing token that appears as a city elsewhere in the corpus, then compare.
 * Safe as it stands only because every cluster is read before it becomes a
 * rule.
 *
 * `Math.min` is what lets a short name reach its own longer spelling — a bare
 * `kiwi torvet` is eleven characters and would otherwise never meet the
 * spelling that carries its street. `MIN_NAME` is what stops that from turning
 * into a free-for-all among three-letter payees.
 */
function related(a: string, b: string): boolean {
  if (a === b) return true; // the same name, differing only in case or punctuation
  const need = Math.min(SHARED, a.length, b.length);
  return need >= MIN_NAME && a.slice(0, need) === b.slice(0, need);
}

/**
 * The longest prefix every member shares, over the raw lowercased names.
 *
 * Raw, not the cluster key: the key strips punctuation, and a pattern built
 * from it can fail to appear in the description it is meant to match — a payee
 * the bank spells `Storgata - AS` on one row and `Storgata / AS` on the next
 * shares no `storgata as` to find. A prefix of the untouched string is a
 * substring of every member by construction, which is the one property the
 * pattern must have.
 */
function commonPrefix(names: string[]): string {
  return names.reduce((a, b) => {
    let i = 0;
    while (i < a.length && i < b.length && a[i] === b[i]) i++;
    return a.slice(0, i);
  });
}

/**
 * The name to suggest: the bank's cleaned form, in its commonest spelling.
 *
 * A mixed-case name is the bank's own cleaning (`Kiwi Torvet`) rather than a
 * terminal string, so those win outright where the cluster has any. Within
 * that, the spelling carrying the most rows is the one the bank actually uses;
 * the longer spelling breaks a tie, because the short one is usually a
 * truncation and proposing `NORDNET BANK A` is worse than proposing too much.
 *
 * It is a suggestion, not a decision — it is printed for a person to edit
 * before it becomes a line in rules/payees.json, and on an all-caps cluster it
 * will still hand back a street and a city.
 */
function canonical(members: { name: string; rows: number }[]): string {
  const cut = members.map((m) => ({ ...m, name: m.name.split(',')[0]!.trim() }));
  const cleaned = cut.filter((m) => /[a-zæøå]/.test(m.name) && /[A-ZÆØÅ]/.test(m.name));
  const pool = cleaned.length ? cleaned : cut;
  return pool.reduce((a, b) => (b.rows > a.rows || (b.rows === a.rows && b.name.length > a.name.length) ? b : a))
    .name;
}

type Acc = { rows: number; cents: number; categories: Set<string> };

/** Spending rows only, excluded rows dropped — the same set every total uses. */
function tally(txns: Categorized[]): Map<string, Acc> {
  const byName = new Map<string, Acc>();
  for (const t of txns) {
    if (t.excluded || t.amount >= 0) continue;
    const name = merchantOf(t);
    const acc = byName.get(name) ?? { rows: 0, cents: 0, categories: new Set<string>() };
    acc.rows++;
    // In cents, so a report over thousands of rows does not drift.
    acc.cents += Math.round(-t.amount * 100);
    acc.categories.add(t.category);
    byName.set(name, acc);
  }
  return byName;
}

/**
 * Sorted, so every spelling of a shop is adjacent to the next: they share a
 * prefix, which is the only thing the sort orders on, so grouping walks the
 * list once. Names shorter than SHARED can chain — A joins B and B joins C
 * where A and C would not have met — which is another thing the review catches
 * and the pipeline never sees.
 */
function group(names: string[]): string[][] {
  const sorted = [...names].sort((a, b) => normalize(a).localeCompare(normalize(b)));
  const groups: string[][] = [];
  for (const name of sorted) {
    const last = groups.at(-1);
    if (last && related(normalize(last.at(-1)!), normalize(name))) last.push(name);
    else groups.push([name]);
  }
  return groups;
}

/**
 * A pattern for members whose literal prefix is too short to use.
 *
 * `CAFE-SITO REALF` and `CAFE SITO REALF TR` are one café sharing four
 * characters, because the punctuation differs at the fifth. They agree
 * perfectly once `normalize` has flattened it, so the shared *normalised*
 * prefix with every separator relaxed to `.` is the pattern that reaches both.
 * Only worth building when the plain substring is unusable — a regex is harder
 * to read, and most clusters never need one.
 */
function relaxed(names: string[]): string {
  const shared = commonPrefix(names.map(normalize)).trimEnd();
  if (shared.length < MIN_NAME) return '';
  return `/${shared.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/ /g, '.')}/`;
}

/** What the suggested pattern would match, judged by the matcher that will run it. */
const reaches = (pattern: string) => {
  const matches = compile(pattern, 'pnpm sb1 merchants');
  return (name: string) => matches(name.toLowerCase());
};

export function merchantClusters(txns: Categorized[]): Cluster[] {
  const byName = tally(txns);
  const groups = group([...byName.keys()]);

  const clusters: Cluster[] = [];
  for (const names of groups) {
    if (names.length < 2) continue;
    const members = names
      .map((name) => ({ name, rows: byName.get(name)!.rows }))
      .sort((a, b) => b.rows - a.rows || a.name.localeCompare(b.name));
    // A plain substring where the members share one, a regex where only the
    // punctuation stands between them, and empty when even that is too little
    // to be worth a rule — better to say so than to suggest a pattern that
    // reaches half the file.
    const shared = commonPrefix(names.map((n) => n.toLowerCase()));
    const pattern = shared.length >= MIN_NAME ? shared : relaxed(names);
    const inCluster = new Set(names);
    clusters.push({
      pattern,
      name: canonical(members),
      members,
      rows: names.reduce((n, name) => n + byName.get(name)!.rows, 0),
      total: names.reduce((c, name) => c + byName.get(name)!.cents, 0) / 100,
      categories: [...new Set(names.flatMap((name) => [...byName.get(name)!.categories]))].sort(),
      // A pattern that reaches past its own cluster is the one way pasting the
      // line does damage, so the report has to say so before it is pasted.
      // Matched with `compile`, the same matcher rules/payees.json will use, so
      // a suggested regex is tested exactly as it will behave.
      collateral: pattern ? [...byName.keys()].filter((n) => !inCluster.has(n) && reaches(pattern)(n)) : [],
    });
  }
  return clusters.sort((a, b) => b.total - a.total);
}

export type NearMiss = {
  /** The word they have in common. */
  token: string;
  members: { name: string; rows: number; total: number }[];
};

/** A word this short, or this common across merchants, names a place and not a shop. */
const MIN_TOKEN = 4;
const MAX_MERCHANTS_PER_TOKEN = 5;

/**
 * What the clustering never tried — the audit surface for its own ceiling.
 *
 * A shared prefix is blind to two spellings that disagree early:
 * a chain's own name and the same shop spelled with its street are one
 * shop sharing five characters, so nothing above will ever put them
 * together. What they do share is a distinctive *word*, and that is the signal
 * here: merchants holding a word in common that the clustering placed apart.
 *
 * `trondheim`, `norway` and `1000` are in a hundred names each and say nothing
 * about identity, so a word carried by more than a handful of merchants is
 * dropped rather than stoplisted — the corpus decides which words are places,
 * not a list in the source that would need maintaining.
 *
 * This is where "which merchants were never considered for grouping" gets
 * answered: anything in neither a cluster nor a near miss shares no word and
 * no prefix with any other name, and is a merchant of one name.
 */
export function nearMisses(txns: Categorized[]): NearMiss[] {
  const byName = tally(txns);
  const clusterOf = new Map<string, number>();
  group([...byName.keys()]).forEach((names, i) => names.forEach((n) => clusterOf.set(n, i)));

  const byToken = new Map<string, Set<string>>();
  for (const name of byName.keys())
    for (const token of new Set(normalize(name).split(' '))) {
      if (token.length < MIN_TOKEN || /^\d+$/.test(token)) continue;
      byToken.set(token, (byToken.get(token) ?? new Set()).add(name));
    }

  const misses: NearMiss[] = [];
  for (const [token, names] of byToken) {
    if (names.size < 2 || names.size > MAX_MERCHANTS_PER_TOKEN) continue;
    // Already one cluster: the grouping saw these and there is nothing to flag.
    if (new Set([...names].map((n) => clusterOf.get(n))).size < 2) continue;
    misses.push({
      token,
      members: [...names]
        .map((name) => ({ name, rows: byName.get(name)!.rows, total: byName.get(name)!.cents / 100 }))
        .sort((a, b) => b.total - a.total),
    });
  }
  const sum = (m: NearMiss) => m.members.reduce((n, x) => n + x.total, 0);
  return misses.sort((a, b) => sum(b) - sum(a));
}
