/**
 * The view and the filters, in the query string, so a filtered page survives a
 * reload and can be pinned in a tab. Anything at its default is left out, so an
 * untouched page keeps a bare URL.
 *
 * `toParams` and `fromParams` touch no DOM, which is what lets `node --test`
 * pin the parsing edges — a stray NaN here would silently filter every row away.
 */
import { period, type Filters, type PeriodKind } from "../../core/select.ts";

/** How the spending chart plots the window: as a running total, or as its raw buckets. */
export type Grain = "running" | "day" | "month";

export type UrlState = {
  view: "dashboard" | "transactions";
  /**
   * One period for both views — a month, a year, `30d` or `all`. Null is "the
   * latest month", which App derives from the rows it has; storing the answer
   * instead would freeze today's latest into the URL.
   */
  period: string | null;
  grain: Grain;
  filters: Filters;
};

const VIEWS: UrlState["view"][] = ["dashboard", "transactions"];
const ALL_GRAINS: Grain[] = ["running", "day", "month"];

/**
 * Which grains a window can actually carry, most useful first. **The first is
 * that window's default**, and a window offering one draws no control at all.
 *
 * A running total is always daily: accumulated, the line is monotonic, so
 * sampling it monthly would only be a twelve-segment approximation of the same
 * curve. Raw is the opposite — raw days are spiky rather than smooth, so past a
 * month they stop being a finer version of the months and turn into a noise
 * band. That is why a month offers raw days and a year offers raw months, and
 * neither offers the other: a month has no months in it to plot, and a year has
 * 365 days to fit across a thousand pixels.
 *
 * All time offers only months. Over four years a running total says little more
 * than that money was spent, and 1681 raw days is more points than the plot has
 * pixels.
 *
 * It lives here rather than in App because what a window offers is also what
 * the query string may say about it — the default is the value left out, and
 * the list is what an edited URL is checked against.
 */
export const GRAINS: Record<PeriodKind, Grain[]> = {
  month: ["running", "day"],
  year: ["running", "month"],
  all: ["month"],
  // A hand-picked range is any length, so it offers all three and the reader
  // picks — a week of months and four years of days are both possible, and
  // guessing from the span would be a rule nobody asked for.
  custom: ["running", "day", "month"],
};

/**
 * What the window named by a stored period offers. Null is "the latest month",
 * which is a month — the one case where this and App disagree is a database
 * with no rows at all, where App falls back to all time and there is no chart
 * to draw either way.
 */
const grainsFor = (p: string | null): Grain[] =>
  GRAINS[p === null ? "month" : period(p).kind];

export const toParams = (s: UrlState): string => {
  const p = new URLSearchParams();
  if (s.view !== "dashboard") p.set("view", s.view);
  if (s.period) p.set("p", s.period);
  // Against the window's own default, not a global one: `all` draws per month
  // and offers nothing else, so naming it there would record a choice that was
  // never on offer.
  if (s.grain !== grainsFor(s.period)[0]) p.set("g", s.grain);
  if (s.filters.categories.length) p.set("cat", s.filters.categories.join(","));
  if (s.filters.categoryMode !== "include")
    p.set("cat_mode", s.filters.categoryMode);
  // One param per merchant, not a joined list: a merchant name can contain a
  // comma, and a category slug cannot.
  for (const m of s.filters.merchants) p.append("m", m);
  if (s.filters.merchantMode !== "include")
    p.set("m_mode", s.filters.merchantMode);
  // Repeated for the same reason as merchants: an account is named by hand and
  // may hold a comma.
  for (const a of s.filters.accounts) p.append("acct", a);
  if (s.filters.accountMode !== "include")
    p.set("acct_mode", s.filters.accountMode);
  // Repeated too: a country is a name, and `NO_COUNTRY` is a dash.
  for (const c of s.filters.countries) p.append("co", c);
  if (s.filters.countryMode !== "include")
    p.set("co_mode", s.filters.countryMode);
  if (s.filters.search) p.set("q", s.filters.search);
  if (s.filters.showExcluded) p.set("excl", "1");
  return p.toString();
};

/**
 * No validation on `p`: `period()` reads anything it does not recognise as all
 * time, and App only keeps a value its own picker offers. A hand-edited URL
 * lands on a real period either way — and the same holds for `g`, which App
 * falls back on when the window in view does not offer it.
 */
export const fromParams = (p: URLSearchParams): UrlState => ({
  view: VIEWS.find((v) => v === p.get("view")) ?? "dashboard",
  period: p.get("p") || null,
  grain:
    ALL_GRAINS.find((g) => g === p.get("g")) ??
    grainsFor(p.get("p") || null)[0]!,
  filters: {
    categories: p.get("cat")?.split(",").filter(Boolean) ?? [],
    categoryMode: p.get("cat_mode") === "exclude" ? "exclude" : "include",
    merchants: p.getAll("m").filter(Boolean),
    merchantMode: p.get("m_mode") === "exclude" ? "exclude" : "include",
    accounts: p.getAll("acct").filter(Boolean),
    accountMode: p.get("acct_mode") === "exclude" ? "exclude" : "include",
    countries: p.getAll("co").filter(Boolean),
    countryMode: p.get("co_mode") === "exclude" ? "exclude" : "include",
    search: p.get("q") ?? "",
    showExcluded: p.get("excl") === "1",
  },
});

export const readUrl = (): UrlState =>
  fromParams(new URLSearchParams(location.search));

/** replaceState, never push — back should leave the page, not undo one filter edit. */
export const writeUrl = (s: UrlState): void => {
  const q = toParams(s);
  history.replaceState(null, "", q ? `?${q}` : location.pathname);
};
