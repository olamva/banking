// The page imports this, so it may hold no `node:` import. The store that
// reads and writes the files is rules.ts, and only Node loads that one.

import { isRegex } from "./match.ts";

// A map file is pattern -> value. A list file is a bare array of patterns.
// accounts.json is not here: `pnpm sb1 accounts` writes it, and it holds
// account numbers, opening balances and sync floors that no page may set.
export const MAP_FILES = [
  "categories",
  "giro",
  "payees",
  "labels",
  "countries",
  "items",
  "item-categories",
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

export const CATEGORY_VALUED = new Set<RuleFile>(["categories", "giro"]);

export const FILE_LABEL: Record<RuleFile, string> = {
  categories: "Categories",
  giro: "Giro",
  payees: "Payee names",
  countries: "Countries",
  items: "Item names",
  "item-categories": "Item categories",
  labels: "Category names",
  family: "Family",
  subscriptions: "Subscriptions",
  "not-subscriptions": "Not subscriptions",
};

export const RULE_NOTE: Record<RuleFile, string> = {
  categories:
    "Pattern to category, unless an exclusion applies. Add a payment type, direction or recipient account to narrow a rule. A rule with more conditions wins.",
  giro: "Pattern to category, on a lump only. A giro or a plain Overførsel, never an instant payment.",
  payees:
    "Pattern to the name on the page. A rename can never move money, so this file is safe to edit.",
  countries:
    "Pattern to the country on the row. It beats the country the code reads off the card name.",
  items:
    "Receipt line name to the name on the Items page. Items with the same name show as one item.",
  "item-categories":
    "Item name to the category on the Items page. Write it as category or category/sub. It beats the product group on the receipt.",
  labels: "Slug to the name on the page. Write the slug as category/sub.",
  family:
    "A relative, by name or by account number. Money in is from family. Money out is a repayment.",
  subscriptions: "A pattern that makes a subscription certain.",
  "not-subscriptions": "A pattern that denies the guess the bank made.",
};

export const RULE_GROUPS: [string, RuleFile[]][] = [
  [
    "Transactions",
    ["categories", "giro", "family", "subscriptions", "not-subscriptions"],
  ],
  ["Display", ["payees", "countries", "labels", "items", "item-categories"]],
];

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

const covers = (key: string, other: string): boolean =>
  other !== key &&
  ![key, other].some((k) => isRegex(k) || k.startsWith("{")) &&
  other.toLowerCase().includes(key.toLowerCase());

export const changeRules = (
  rules: Rules,
  key: string,
  value?: string,
  was?: string,
  remove = false,
): Rules => {
  if (Array.isArray(rules)) {
    const next = rules.filter((item) => item !== key && item !== was);
    return remove ? next : [...next.filter((item) => !covers(key, item)), key];
  }
  const next = { ...rules };
  if (was !== undefined) delete next[was];
  if (remove) delete next[key];
  else {
    next[key] = value!;
    for (const [other, v] of Object.entries(next))
      if (v === value && covers(key, other)) delete next[other];
  }
  return next;
};
