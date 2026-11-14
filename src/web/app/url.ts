import {
  filtersFromParams,
  filtersToParams,
  period,
  type Filters,
  type PeriodKind,
} from "../../core/select.ts";
import type { View } from "./FilterBar.tsx";
import { RULE_TABS, type RuleTab } from "./ruleMeta.ts";

export type Grain = "running" | "day" | "month";

export type UrlState = {
  view: View;
  ruleFile: RuleTab;
  period: string | null;
  grain: Grain;
  filters: Filters;
};

const VIEWS: UrlState["view"][] = [
  "dashboard",
  "transactions",
  "insights",
  "items",
  "rules",
];
const ALL_GRAINS: Grain[] = ["running", "day", "month"];

export const GRAINS: Record<PeriodKind, Grain[]> = {
  month: ["running", "day"],
  year: ["running", "month"],
  all: ["month"],
  custom: ["running", "day", "month"],
};

const grainsFor = (p: string | null): Grain[] =>
  GRAINS[p === null ? "month" : period(p).kind];

export const toParams = (s: UrlState): string => {
  const p = new URLSearchParams();
  if (s.view !== "dashboard") p.set("view", s.view);
  if (s.view === "rules") p.set("tab", s.ruleFile);
  if (s.period) p.set("p", s.period);
  if (s.grain !== grainsFor(s.period)[0]) p.set("g", s.grain);
  return filtersToParams(s.filters, p).toString();
};

export const fromParams = (p: URLSearchParams): UrlState => ({
  view: VIEWS.find((v) => v === p.get("view")) ?? "dashboard",
  ruleFile: RULE_TABS.find((tab) => tab === p.get("tab")) ?? "categories",
  period: p.get("p") || null,
  grain:
    ALL_GRAINS.find((g) => g === p.get("g")) ??
    grainsFor(p.get("p") || null)[0]!,
  filters: filtersFromParams(p),
});

export const readUrl = (): UrlState =>
  fromParams(new URLSearchParams(location.search));

// Use replaceState, not push. The back button must leave the page. It must
// not undo one filter edit.
export const writeUrl = (s: UrlState): void => {
  const q = toParams(s);
  history.replaceState(null, "", q ? `?${q}` : location.pathname);
};
