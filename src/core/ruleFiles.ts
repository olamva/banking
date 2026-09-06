// The page imports this, so it may hold no `node:` import. The store that
// reads and writes the files is rules.ts, and only Node loads that one.

// A map file is pattern -> value. A list file is a bare array of patterns.
// accounts.json is not here: `pnpm sb1 accounts` writes it, and it holds
// account numbers, opening balances and sync floors that no page may set.
export const MAP_FILES = [
  "categories",
  "preferences",
  "giro",
  "payees",
  "labels",
  "countries",
] as const;
export const LIST_FILES = [
  "family",
  "subscriptions",
  "not-subscriptions",
] as const;
export const RULE_FILES = [...MAP_FILES, ...LIST_FILES];

export type RuleFile = (typeof RULE_FILES)[number];
export type RuleMap = Record<string, string>;
export type Rules = RuleMap | string[];

export const CATEGORY_VALUED = new Set<RuleFile>([
  "categories",
  "giro",
  "preferences",
]);

export const isMapFile = (file: RuleFile): boolean =>
  (MAP_FILES as readonly string[]).includes(file);

// The file name arrives in a query string. Nothing that takes a path may run
// before this returns true.
export const isRuleFile = (v: unknown): v is RuleFile =>
  RULE_FILES.includes(v as RuleFile);

// What one edit did to a file. A list file carries "" as the value, so an add
// and a remove still read apart: `to` is present on an add, absent on a remove.
export type RuleChange = { key: string; from?: string; to?: string };

const asMap = (r: Rules): RuleMap =>
  Array.isArray(r) ? Object.fromEntries(r.map((k) => [k, ""])) : r;

export function diffRules(before: Rules, after: Rules): RuleChange[] {
  const a = asMap(before);
  const b = asMap(after);
  const out: RuleChange[] = [];
  for (const [key, to] of Object.entries(b)) {
    const from = a[key];
    if (from === undefined) out.push({ key, to });
    else if (from !== to) out.push({ key, from, to });
  }
  for (const [key, from] of Object.entries(a))
    if (!(key in b)) out.push({ key, from });
  return out;
}

export const changeRules = (
  rules: Rules,
  key: string,
  value?: string,
  was?: string,
  remove = false,
): Rules => {
  if (Array.isArray(rules)) {
    const next = rules.filter((item) => item !== key && item !== was);
    return remove ? next : [...next, key];
  }
  const next = { ...rules };
  if (was !== undefined) delete next[was];
  if (remove) delete next[key];
  else next[key] = value!;
  return next;
};
