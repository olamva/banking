import type { RuleFile, Rules } from "../../core/ruleFiles.ts";

export const RULE_LABEL: Record<RuleFile, string> = {
  categories: "Categories",
  giro: "Giro",
  payees: "Payee names",
  countries: "Countries",
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
  ["Display", ["payees", "countries", "labels"]],
];

export const RULE_TAB_FILES = RULE_GROUPS.flatMap(([, files]) => files);

export const entriesOf = (rules: Rules): [string, string | null][] =>
  Array.isArray(rules)
    ? rules.map((key) => [key, null])
    : Object.entries(rules);
