// The page imports this, so it may hold no `node:` import. The store that
// reads and writes the files is rules.ts, and only Node loads that one.

// A map file is pattern -> value. A list file is a bare array of patterns.
// accounts.json is not here: `pnpm sb1 accounts` writes it, and it holds
// account numbers, opening balances and sync floors that no page may set.
export const MAP_FILES = ["overrides", "giro", "payees", "categories"] as const;
export const LIST_FILES = [
  "family",
  "subscriptions",
  "not-subscriptions",
] as const;
export const RULE_FILES = [...MAP_FILES, ...LIST_FILES];

export type RuleFile = (typeof RULE_FILES)[number];
export type RuleMap = Record<string, string>;
export type Rules = RuleMap | string[];

// A value in these two names a category. The other two name a payee or a
// category, which is free text.
export const CATEGORY_VALUED = new Set<RuleFile>(["overrides", "giro"]);

export const isMapFile = (file: RuleFile): boolean =>
  (MAP_FILES as readonly string[]).includes(file);

// The file name arrives in a query string. Nothing that takes a path may run
// before this returns true.
export const isRuleFile = (v: unknown): v is RuleFile =>
  RULE_FILES.includes(v as RuleFile);
