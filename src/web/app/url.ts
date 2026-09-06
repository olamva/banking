import { RULE_FILES, type RuleFile } from "../../core/ruleFiles.ts";
import { period, type Filters, type PeriodKind } from "../../core/select.ts";

export type Grain = "running" | "day" | "month";

export type UrlState = {
  view: "dashboard" | "transactions" | "rules";
  ruleFile: RuleFile;
  period: string | null;
  grain: Grain;
  filters: Filters;
};

const VIEWS: UrlState["view"][] = ["dashboard", "transactions", "rules"];
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
  if (s.filters.categories.length) p.set("cat", s.filters.categories.join(","));
  if (s.filters.categoriesOut.length)
    p.set("cat_not", s.filters.categoriesOut.join(","));
  // Use one parameter for each merchant. A merchant name can contain a comma.
  for (const m of s.filters.merchants) p.append("m", m);
  for (const m of s.filters.merchantsOut) p.append("m_not", m);
  for (const a of s.filters.accounts) p.append("acct", a);
  for (const a of s.filters.accountsOut) p.append("acct_not", a);
  for (const c of s.filters.countries) p.append("co", c);
  for (const c of s.filters.countriesOut) p.append("co_not", c);
  if (s.filters.search) p.set("q", s.filters.search);
  if (s.filters.showExcluded) p.set("excl", "1");
  return p.toString();
};

export const fromParams = (p: URLSearchParams): UrlState => {
  const split = (name: string) => p.get(name)?.split(",").filter(Boolean) ?? [];
  const axis = (
    values: string[],
    out: string[],
    legacyMode: string | null,
  ): [string[], string[]] =>
    legacyMode === "exclude" ? [[], [...out, ...values]] : [values, out];

  const [categories, categoriesOut] = axis(
    split("cat"),
    split("cat_not"),
    p.get("cat_mode"),
  );
  const repeated = (name: string) => p.getAll(name).filter(Boolean);
  const [merchants, merchantsOut] = axis(
    repeated("m"),
    repeated("m_not"),
    p.get("m_mode"),
  );
  const [accounts, accountsOut] = axis(
    repeated("acct"),
    repeated("acct_not"),
    p.get("acct_mode"),
  );
  const [countries, countriesOut] = axis(
    repeated("co"),
    repeated("co_not"),
    p.get("co_mode"),
  );
  return {
    view: VIEWS.find((v) => v === p.get("view")) ?? "dashboard",
    ruleFile: RULE_FILES.find((file) => file === p.get("tab")) ?? "categories",
    period: p.get("p") || null,
    grain:
      ALL_GRAINS.find((g) => g === p.get("g")) ??
      grainsFor(p.get("p") || null)[0]!,
    filters: {
      categories,
      categoriesOut,
      merchants,
      merchantsOut,
      accounts,
      accountsOut,
      countries,
      countriesOut,
      search: p.get("q") ?? "",
      showExcluded: p.get("excl") === "1",
    },
  };
};

export const readUrl = (): UrlState =>
  fromParams(new URLSearchParams(location.search));

// Use replaceState, not push. The back button must leave the page. It must
// not undo one filter edit.
export const writeUrl = (s: UrlState): void => {
  const q = toParams(s);
  history.replaceState(null, "", q ? `?${q}` : location.pathname);
};
