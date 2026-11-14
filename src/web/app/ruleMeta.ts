import {
  FILE_LABEL,
  RULE_GROUPS,
  type RuleFile,
  type Rules,
} from "../../core/ruleFiles.ts";
import { ErrorIcon, WarningIcon, type IconSvgElement } from "./icons.ts";

export { RULE_NOTE } from "../../core/ruleFiles.ts";

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
  ...FILE_LABEL,
};

export const TAB_GROUPS: [string, RuleTab[]][] = [
  ["Checks", [...CHECKS]],
  ...RULE_GROUPS,
];

export const RULE_TABS = TAB_GROUPS.flatMap(([, tabs]) => tabs);

export const entriesOf = (rules: Rules): [string, string | null][] =>
  Array.isArray(rules)
    ? rules.map((key) => [key, null])
    : Object.entries(rules);
