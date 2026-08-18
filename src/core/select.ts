/**
 * Which rows are in view. No money logic — that is stats.ts, and this module
 * must never grow any: everything here answers "is this row shown?", never
 * "what does it add up to?".
 *
 * Pure and dependency-free so the browser and `node --test` run the same code.
 */
import type { Categorized } from "./types.ts";

/**
 * Every list filter is **two lists over one field**: the rows to show, and the
 * rows to hide out of them. Both at once is the ordinary thing to want, since
 * the exception to a filter lives on the filter's own axis.
 *
 * The order is not negotiable: **an exclusion wins**, so a value on both lists
 * is hidden. That is what makes `innskudd` minus `innskudd/familie` mean
 * anything.
 */
export type Filters = {
  /**
   * Empty means every category, and the `Out` list still applies to it.
   *
   * **Holds both levels**: a bare `dagligvarer` and a pair
   * `dagligvarer/andre_dagligvarer` share one list, and a row matches if either
   * is listed. Two axes would AND, asking for rows that are a category and a
   * subcategory under some *other* category at once — an empty page.
   *
   * A pair is always `category/sub`, never a bare sub: `dagligvarer` is a sub
   * under itself and `kollektivtransport` sits under two mains.
   */
  categories: string[];
  categoriesOut: string[];
  /** The same, over `merchantOf` — the name the tables and the bars show. */
  merchants: string[];
  merchantsOut: string[];
  /** The same again, over `Txn.account` — what `rules/accounts.json` calls it. */
  accounts: string[];
  accountsOut: string[];
  /**
   * The same again, over `Txn.country`. Only card rows carry one, so an empty
   * include list means every row, country or not — `NO_COUNTRY` is a real value
   * in the list, which is what lets "only the domestic rows" be asked for.
   */
  countries: string[];
  countriesOut: string[];
  search: string;
  /**
   * Whether internal transfers and card bill payments are listed. Off by
   * default, since no money path counts them; one toggle puts them back,
   * because the excluded set has to stay auditable.
   */
  showExcluded: boolean;
};

/**
 * The four list filters, each paired with the field holding its exclusions —
 * one control repeated, so toggling is one function over this map rather than
 * four near-copies.
 */
export const AXES = {
  categories: "categoriesOut",
  merchants: "merchantsOut",
  accounts: "accountsOut",
  countries: "countriesOut",
} as const;

export type Axis = keyof typeof AXES;

export const NO_FILTERS: Filters = {
  categories: [],
  categoriesOut: [],
  merchants: [],
  merchantsOut: [],
  accounts: [],
  accountsOut: [],
  countries: [],
  countriesOut: [],
  search: "",
  showExcluded: false,
};

/**
 * The one name a row goes by, and it has to be the same fallback everywhere or
 * a merchant clicked in the table filters to nothing.
 */
export const merchantOf = (t: Categorized): string =>
  t.counterparty ?? t.description;

/**
 * The pair, with a trailing slash where there is no second level, so a row with
 * no sub stays selectable — `overfoering`, `ukategorisert` and the travel guess
 * all refuse one on purpose, and dropping them would make a drill-down show
 * less than the category it opened from.
 */
export const subcategoryOf = (t: Categorized): string =>
  `${t.category}/${t.subcategory ?? ""}`;

/**
 * Both ends inclusive, and a null end is open — an empty date box means "no
 * bound", not "no rows". ISO dates sort lexicographically, so plain string
 * comparison is the whole implementation; no parsing, and no timezone to get
 * wrong the way `new Date(...)` would.
 */
export function inRange(
  t: Categorized,
  from: string | null,
  to: string | null,
): boolean {
  if (from && t.date < from) return false;
  if (to && t.date > to) return false;
  return true;
}

/**
 * One axis, both its lists. An empty include list is every row, since a filter
 * nobody set must never empty the page.
 *
 * A row can be named more than one way and any candidate counts, which is what
 * makes a category and its own subcategory a union rather than an impossible
 * intersection — and what lets the narrower name be the exception to the wider.
 */
const shown = (
  include: string[],
  exclude: string[],
  candidates: string[],
): boolean =>
  !candidates.some((c) => exclude.includes(c)) &&
  (!include.length || candidates.some((c) => include.includes(c)));

export function matchesFilters(t: Categorized, f: Filters): boolean {
  if (t.excluded && !f.showExcluded) return false;
  if (!shown(f.categories, f.categoriesOut, [t.category, subcategoryOf(t)]))
    return false;
  if (!shown(f.merchants, f.merchantsOut, [merchantOf(t)])) return false;
  if (!shown(f.accounts, f.accountsOut, [t.account])) return false;
  if (!shown(f.countries, f.countriesOut, [countryOf(t)])) return false;
  if (f.search) {
    const q = f.search.toLowerCase();
    const hay = (t.description + " " + (t.counterparty ?? "")).toLowerCase();
    if (!hay.includes(q)) return false;
  }
  return true;
}

export type PeriodKind = "month" | "year" | "all" | "custom";

export type Period = {
  /** Which of the two pickers the value came from — the shape of the string is the answer. */
  kind: PeriodKind;
  /** Inclusive bounds for `inRange`; null is open at that end. */
  from: string | null;
  to: string | null;
  /** What the picker shows, and what `monthStats` gets as its name. */
  label: string;
  /** The window immediately before, for the deltas. Null when nothing precedes it. */
  prev: { from: string; to: string; label: string } | null;
};

/**
 * `-31` as the upper bound rather than the real last day: every date in the
 * month sorts below it, and no date outside the month sorts under `YYYY-MM`, so
 * a month-length table would buy nothing.
 */
const monthBounds = (m: string) => ({ from: `${m}-01`, to: `${m}-31` });
const yearBounds = (y: number) => ({ from: `${y}-01-01`, to: `${y}-12-31` });

/**
 * A hand-picked window, either end allowed to be empty for an open one, so
 * clearing a date box is a period rather than an error.
 */
const CUSTOM = /^(\d{4}-\d{2}-\d{2})?\.\.(\d{4}-\d{2}-\d{2})?$/;

/** Today in Oslo, in the same shape and zone as `Txn.date`. */
export const todayOslo = (): string =>
  new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Oslo" });

/**
 * The one period the whole page runs on: a month `2026-07`, a year `2026`, a
 * hand-picked `2026-03-04..2026-05-01`, or anything else meaning all time.
 * Both views read it, which is what keeps the dashboard and the table in step.
 *
 * **A month compares against the same month a year back**, because spending has
 * a shape over a year the month before cannot see — January against December
 * says only that Christmas happened.
 *
 * A period still running is part-full, so its previous window is cut to the
 * same point, or every delta would read as a collapse drawn by the calendar.
 * The cut is a string bound, so a day the previous window lacks needs no case:
 * `2025-02-30` sorts after every February date and before every March one.
 */
export function period(p: string, now = todayOslo()): Period {
  if (/^\d{4}-\d{2}$/.test(p)) {
    const back = `${Number(p.slice(0, 4)) - 1}-${p.slice(5)}`;
    const prev =
      now.slice(0, 7) === p
        ? {
            from: `${back}-01`,
            to: `${back}-${now.slice(8)}`,
            label: "this time last year",
          }
        : { ...monthBounds(back), label: "last year" };
    return { kind: "month", ...monthBounds(p), label: p, prev };
  }
  if (/^\d{4}$/.test(p)) {
    const y = Number(p);
    const prev =
      now.slice(0, 4) === p
        ? {
            from: `${y - 1}-01-01`,
            to: `${y - 1}-${now.slice(5)}`,
            label: "this time last year",
          }
        : { ...yearBounds(y - 1), label: "last year" };
    return { kind: "year", ...yearBounds(y), label: p, prev };
  }
  const range = CUSTOM.exec(p);
  if (range) {
    const [, from = null, to = null] = range;
    // No previous window, deliberately: a hand-picked range belongs to no
    // calendar, so nothing says what it is a period *of*, and an invented
    // comparison reads as a measurement.
    return {
      kind: "custom",
      from,
      to,
      label: from && to ? `${from} – ${to}` : (from ?? to ?? "All time"),
      prev: null,
    };
  }
  return { kind: "all", from: null, to: null, label: "All time", prev: null };
}

/**
 * The dates a chart's x axis has to span for a period — both ends inclusive,
 * as `YYYY-MM-DD`.
 *
 * Taken from the period rather than from the rows, so filtering to one merchant
 * thins the line instead of shortening the axis. The far end is the period's
 * own or where the record reaches, whichever comes first: a running period
 * would otherwise draw a fortnight of flat line, but it must never stop short
 * of the rows, since card rows routinely carry dates later than today.
 */
export function axisBounds(
  rows: Categorized[],
  p: Period,
  now = todayOslo(),
): { from: string; to: string } {
  const edge = rows.reduce(
    (latest, t) => (t.date > latest ? t.date : latest),
    now,
  );
  return {
    from:
      p.from ??
      rows.reduce((first, t) => (t.date < first ? t.date : first), edge),
    to: p.to && p.to < edge ? p.to : edge,
  };
}

export function distinctMonths(txns: Categorized[]): string[] {
  return [...new Set(txns.map((t) => t.date.slice(0, 7)))].sort();
}

export function distinctYears(txns: Categorized[]): string[] {
  return [...new Set(txns.map((t) => t.date.slice(0, 4)))].sort();
}

export function distinctCategories(txns: Categorized[]): string[] {
  return [...new Set(txns.map((t) => t.category))].sort();
}

/** Pairs, sorted so every subcategory sits under its own category. */
export function distinctSubcategories(txns: Categorized[]): string[] {
  return [...new Set(txns.map(subcategoryOf))].sort();
}

/** Hundreds of these, so the dropdown that shows them is searchable. */
export function distinctMerchants(txns: Categorized[]): string[] {
  return [...new Set(txns.map(merchantOf))].sort((a, b) => a.localeCompare(b));
}

/**
 * The categories that mean the other party was a person rather than a shop.
 *
 * No name shape answers this — `Georgios Giannakis` is a taverna and `Møller
 * Kantine` is not a person called Møller. The category already on the row does:
 * a peer payment or family money only ever has a human on the other end.
 */
const PEER = new Set([
  "diverse/vennebetaling",
  "innskudd/familie",
  "innskudd/lommepenger",
]);

/**
 * Which merchants are people, from the rows in view. **Any** peer row makes the
 * name a person: a flatmate is rent under `faste_boutgifter` and small Vipps
 * payments under `vennebetaling`, and requiring every row to agree would call
 * them a business on the strength of the rent.
 *
 * ponytail: a signal, not a register of humans — it calls `Vipps` and `Pant`
 * people and misses a landlord who only ever sent rent. Both are visible in a
 * list you are looking at, which is why this narrows a picker and not a total.
 */
export function personMerchants(txns: Categorized[]): Set<string> {
  const people = new Set<string>();
  for (const t of txns)
    if (PEER.has(subcategoryOf(t))) people.add(merchantOf(t));
  return people;
}

/**
 * A sentinel rather than dropping the rows with no country: that is most of the
 * record, and an axis that could not select them would make "only the domestic
 * rows" quietly mean "only the card ones".
 */
export const NO_COUNTRY = "—";

export const countryOf = (t: Categorized): string => t.country ?? NO_COUNTRY;

/** Sorted, with the no-country rows last rather than first under `—`. */
export function distinctCountries(txns: Categorized[]): string[] {
  const all = [...new Set(txns.map(countryOf))];
  return all
    .filter((c) => c !== NO_COUNTRY)
    .sort((a, b) => a.localeCompare(b))
    .concat(all.includes(NO_COUNTRY) ? [NO_COUNTRY] : []);
}

export function distinctAccounts(txns: Categorized[]): string[] {
  return [...new Set(txns.map((t) => t.account))].sort((a, b) =>
    a.localeCompare(b),
  );
}
