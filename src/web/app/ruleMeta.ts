import {
  FILE_LABEL,
  RULE_GROUPS,
  RULE_NOTE,
  type RuleFile,
  type Rules,
} from "../../core/ruleFiles.ts";
import { ErrorIcon, WarningIcon, type IconSvgElement } from "./icons.ts";

export { RULE_NOTE };

export const CHECKS = ["review", "conflicts"] as const;

export type Check = (typeof CHECKS)[number];

export type RuleTab = RuleFile | Check | "logins";

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
  logins: "Logins",
  review: "Review",
  conflicts: "Conflicts",
  ...FILE_LABEL,
};

export const TAB_NOTE: Partial<Record<RuleTab, string>> = {
  ...RULE_NOTE,
  review:
    "These payees have no category rule. The bank or a guess sets their category. Save a category rule to confirm one. Guessed categories come first.",
  conflicts:
    "These rules assign different values to the same transactions. They have the same number of conditions, so the first matching rule wins. Remove one rule, or narrow a pattern, to fix a conflict.",
};

export const TAB_GROUPS: [string, RuleTab[]][] = [
  ["Connections", ["logins"]],
  ["Checks", [...CHECKS]],
  ...RULE_GROUPS,
];

export const RULE_TABS = TAB_GROUPS.flatMap(([, tabs]) => tabs);

export const entriesOf = (rules: Rules): [string, string | null][] =>
  Array.isArray(rules)
    ? rules.map((key) => [key, null])
    : Object.entries(rules);
