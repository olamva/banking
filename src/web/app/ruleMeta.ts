import type { RuleFile, Rules } from "../../core/ruleFiles.ts";
import { ErrorIcon, WarningIcon, type IconSvgElement } from "./icons.ts";

export const CHECKS = ["review", "conflicts"] as const;

export type Check = (typeof CHECKS)[number];

export type RuleTab = RuleFile | Check;

export const CHECK_ICON: Record<Check, IconSvgElement> = {
  review: WarningIcon,
  conflicts: ErrorIcon,
};

const CHECK_TONE: Record<Check, string> = {
  review:
    "text-warning hover:text-warning data-[active=true]:text-warning focus:text-warning",
  conflicts:
    "text-destructive hover:text-destructive data-[active=true]:text-destructive focus:text-destructive",
};

export const checkTone = (tab: RuleTab, count = 0): string =>
  count > 0 && tab in CHECK_TONE ? CHECK_TONE[tab as Check] : "";

export const RULE_LABEL: Record<RuleTab, string> = {
  review: "Review",
  conflicts: "Conflicts",
  categories: "Categories",
  giro: "Giro",
  payees: "Payee names",
  countries: "Countries",
  items: "Item names",
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
  ["Display", ["payees", "countries", "labels", "items"]],
];

export const TAB_GROUPS: [string, RuleTab[]][] = [
  ["Checks", [...CHECKS]],
  ...RULE_GROUPS,
];

export const RULE_TABS = TAB_GROUPS.flatMap(([, tabs]) => tabs);

export const entriesOf = (rules: Rules): [string, string | null][] =>
  Array.isArray(rules)
    ? rules.map((key) => [key, null])
    : Object.entries(rules);
