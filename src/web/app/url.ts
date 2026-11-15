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
  group: string;
  sort: string;
  filters: Filters;
};

export const DEFAULT_GROUP = "Day";
export const DEFAULT_SORT = "-date";

const VIEWS: View[] = ["transactions", "overview", "rules"];
const ALL_GRAINS: Grain[] = ["running", "day", "month"];

export const GRAINS: Record<PeriodKind, Grain[]> = {
  month: ["running", "day"],
  year: ["running", "month"],
  recent: ["running", "day"],
  all: ["month"],
  custom: ["running", "day", "month"],
};

const grainsFor = (p: string | null): Grain[] =>
  GRAINS[p === null ? "month" : period(p).kind];

export const toParams = (s: UrlState): string => {
  const p = new URLSearchParams();
  if (s.view !== "transactions") p.set("view", s.view);
  if (s.view === "rules") p.set("tab", s.ruleFile);
  if (s.period) p.set("p", s.period);
  if (s.grain !== grainsFor(s.period)[0]) p.set("g", s.grain);
  if (s.group !== DEFAULT_GROUP) p.set("group", s.group);
  if (s.sort !== DEFAULT_SORT) p.set("sort", s.sort);
  return filtersToParams(s.filters, p).toString();
};

export const fromParams = (p: URLSearchParams): UrlState => ({
  view: VIEWS.find((v) => v === p.get("view")) ?? "transactions",
  ruleFile: RULE_TABS.find((tab) => tab === p.get("tab")) ?? "categories",
  period: p.get("p") || null,
  grain:
    ALL_GRAINS.find((g) => g === p.get("g")) ??
    grainsFor(p.get("p") || null)[0]!,
  group: p.get("group") || DEFAULT_GROUP,
  sort: p.get("sort") ?? DEFAULT_SORT,
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
