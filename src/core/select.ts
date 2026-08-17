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
 * rows to hide out of them. It was one list plus a mode, which could say "only
 * `innskudd`" or "anything but `innskudd/familie`" and never both at once — and
 * both at once is the ordinary thing to want, since the exception to a filter
 * lives on the same axis as the filter.
 *
 * The two are read in one order and it is not negotiable: **an exclusion wins.**
 * A value on both lists is hidden. That is what makes `innskudd` minus
 * `innskudd/familie` mean anything — the parent is listed, the child is listed
 * under it, and only the narrower word can be the answer.
 */
export type Filters = {
  /**
   * Empty means every category, and the `Out` list below still applies to it —
   * "everything except X" needs no include list at all.
   *
   * **Holds both levels**: a bare `dagligvarer` and a pair
   * `dagligvarer/andre_dagligvarer` live in the same list, and a row matches if
   * *either* is listed. One axis rather than two, because two ANDed — picking a
   * category and a subcategory under some other category asked for rows that are
   * both at once and drew an empty page. A tree with checkboxes means a union,
   * and a union is what one list gives for nothing.
   *
   * A pair is always `category/sub`, never a bare sub: `dagligvarer` is a sub
   * under itself and `kollektivtransport` sits under two mains, so a bare sub
   * would quietly pull rows from both.
   */
  categories: string[];
  /**
   * The rows hidden out of that, named the same two ways — a bare category or a
   * pair. It wins over `categories`, so listing `innskudd` there and
   * `innskudd/familie` here is a contradiction resolved in favour of hiding.
   */
  categoriesOut: string[];
  /** The same, over `merchantOf` — the name the tables and the bars show. */
  merchants: string[];
  merchantsOut: string[];
  /** The same again, over `Txn.account` — what `rules/accounts.json` calls it. */
  accounts: string[];
  accountsOut: string[];
  /**
   * The same again, over `Txn.country`.
   *
   * Only card rows carry one, so an empty include list is not "everywhere" in
   * the way the other three axes mean it — it is every row, country or not. A
   * row with no country is therefore dropped by an include filter and kept by
   * an exclusion, which falls out of `shown` treating null as its own value
   * rather than needing a case: `NO_COUNTRY` is what it is called in the list.
   */
  countries: string[];
  countriesOut: string[];
  search: string;
  /**
   * Whether internal transfers and card bill payments are listed. Off by
   * default: no money path counts them — `stats.ts` skips them before it sums —
   * so listing them only makes a transfer pair look like spending. One toggle
   * puts them back, because the excluded set has to stay auditable.
   */
  showExcluded: boolean;
};

/**
 * The four list filters, each paired with the field holding its exclusions.
 *
 * They are one control repeated, so the code that toggles them is one function
 * over this map rather than four near-copies — and adding a fifth axis is this
 * entry plus its two fields above.
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
 * The one name a row goes by. Card rows have no counterparty until a statement
 * export reaches them, so the description is the fallback — and it has to be the
 * same fallback everywhere, or a merchant clicked in the table filters to
 * nothing.
 */
export const merchantOf = (t: Categorized): string =>
  t.counterparty ?? t.description;

/**
 * The value the subcategory filter matches on: the pair, with a trailing slash
 * where there is no second level.
 *
 * A row with no sub is still selectable. `rules/overrides.json` names a pair on
 * every line now, but the rules `categorize` holds itself still do not —
 * `overfoering`, `ukategorisert` and the travel guess all refuse a second level
 * on purpose — so "the part of this category nothing has named yet" remains a
 * real thing to want to look at, and dropping it would make the drill-down
 * silently show less than the category it opened from.
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
 * One axis, both its lists. A row is in when nothing hides it, and either the
 * include list is empty or something in it names the row — an empty include
 * list is every row, since a filter nobody set must never empty the page.
 *
 * A row can be named more than one way, and any candidate counts. That is what
 * makes a category and one of its own subcategories a union rather than an
 * impossible intersection, what takes the children with the parent on either
 * list — and what lets the narrower name be the exception to the wider one,
 * since the exclusion answers on the pair while the inclusion answers on the
 * bare category, and the exclusion is asked first.
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
 * A hand-picked window, `from..to`, either end allowed to be empty for an open
 * one — the same "no bound" `inRange` already understands, so clearing one date
 * box is a period rather than an error.
 *
 * A range says nothing about which month or year it sits in, so it is its own
 * kind rather than a shape the month regex could be widened to.
 */
const CUSTOM = /^(\d{4}-\d{2}-\d{2})?\.\.(\d{4}-\d{2}-\d{2})?$/;

/** Today in Oslo, in the same shape and zone as `Txn.date`. */
export const todayOslo = (): string =>
  new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Oslo" });

/**
 * The one period the whole page runs on: a month `2026-07`, a year `2026`, a
 * hand-picked `2026-03-04..2026-05-01`, or anything else meaning all time.
 *
 * Both views read this, which is what lets the dashboard and the table stay in
 * step — and what makes "vs the previous period" mean the same thing for a
 * month and for a year.
 *
 * **A month compares against the same month a year back, not against the month
 * before it.** Spending has a shape over a year that the month before cannot
 * see: December is not a verdict on November, and January against December says
 * only that Christmas happened. Against last December it says something.
 *
 * The period still running is only part-full, so its previous window is cut to
 * the same point: nine days of August against a whole August would read as a
 * 70% fall every time, which is the calendar talking and not the spending. Any
 * other period is complete and compares against a complete one.
 *
 * The cut is a string bound, so a day the previous window does not have needs
 * no special case — `2025-02-30` sorts after every February date and before
 * every March one, which is exactly "all of February".
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
    /**
     * **No previous window, deliberately.** A hand-picked range belongs to no
     * calendar, so nothing says what it is a period *of*: the equally long span
     * before it was tried, and it compares a trip against the fortnight at home
     * before it, or a fortnight against a different fortnight nobody chose. A
     * month has last year and a year has the year before; a range has nothing,
     * and an invented comparison reads as a measurement.
     *
     * So the changes card and the deltas are absent here, exactly as they are
     * for all time.
     */
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
 * thins the line instead of shortening the axis to the days that merchant
 * happens to appear on. Two things pull the far end back in:
 *
 * - A period still running would otherwise stretch to its last calendar day and
 *   draw a fortnight of flat line, which reads as having stopped spending
 *   rather than as not having got there yet.
 * - But it must never stop short of the rows themselves. The bank books card
 *   rows a day or two ahead, so `data/raw/` routinely holds dates later than
 *   today, and an axis cut at today drops spending the totals beside it count.
 *
 * So the far end is the period's own, or where the record reaches — today, or
 * the latest row if that is later still — whichever comes first.
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
 * The bank does not say whether a counterparty is a human, and no name shape
 * answers it either — `Georgios Giannakis` is a taverna, `Elias Rønnestad` is a
 * clothes shop, and `Møller Kantine` is not a person called Møller. Tried over
 * the record, a person-name regex called about 190 businesses people.
 *
 * What does answer it is the category already on the row: a peer payment or
 * family money only ever has a human on the other end. That is a fact the
 * pipeline has already established, so this reads it rather than guessing again.
 */
const PEER = new Set([
  "diverse/vennebetaling",
  "innskudd/familie",
  "innskudd/lommepenger",
]);

/**
 * Which merchants are people, from the rows in view.
 *
 * **Any** peer row makes the name a person, not all of them: a flatmate is rent
 * under `faste_boutgifter` and small Vipps payments under `vennebetaling`, and
 * requiring every row to agree would file them as a business on the strength of
 * the rent.
 *
 * ponytail: a signal, not a register of humans. It calls `Vipps`, `Pant` and
 * `Korreksjon` people, because peer rows land under those names, and it misses a
 * landlord who only ever sent rent. Both are visible in a list you are looking
 * at, which is the whole reason this narrows a picker rather than a total.
 */
export function personMerchants(txns: Categorized[]): Set<string> {
  const people = new Set<string>();
  for (const t of txns)
    if (PEER.has(subcategoryOf(t))) people.add(merchantOf(t));
  return people;
}

/**
 * The value the country filter matches on, with a name for "the row has none".
 *
 * A sentinel rather than dropping those rows from the axis: BankAxept and every
 * transfer carry no country at all, which is most of the record, and an axis
 * that could not select them would make "show me only the domestic rows" quietly
 * mean "only the card ones".
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
