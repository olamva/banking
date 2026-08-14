/**
 * Which rows are in view. No money logic — that is stats.ts, and this module
 * must never grow any: everything here answers "is this row shown?", never
 * "what does it add up to?".
 *
 * Pure and dependency-free so the browser and `node --test` run the same code.
 */
import type { Categorized } from './types.ts';

export type Mode = 'include' | 'exclude';

export type Filters = {
  /**
   * Empty means every category, whichever way `categoryMode` is set.
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
  /** Whether `categories` names the only rows to show, or the only ones to hide. */
  categoryMode: Mode;
  /** The same, over `merchantOf` — the name the tables and the bars show. */
  merchants: string[];
  merchantMode: Mode;
  /** The same again, over `Txn.account` — what `rules/accounts.json` calls it. */
  accounts: string[];
  accountMode: Mode;
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
 * The three list filters, each paired with the field holding its mode.
 *
 * They are one control repeated, so the code that toggles them is one function
 * over this map rather than three near-copies — and adding a fourth axis is
 * this entry plus its two fields above.
 */
export const AXES = {
  categories: 'categoryMode',
  merchants: 'merchantMode',
  accounts: 'accountMode',
} as const;

export type Axis = keyof typeof AXES;

export const NO_FILTERS: Filters = {
  categories: [],
  categoryMode: 'include',
  merchants: [],
  merchantMode: 'include',
  accounts: [],
  accountMode: 'include',
  search: '',
  showExcluded: false,
};

/**
 * The one name a row goes by. Card rows have no counterparty until a statement
 * export reaches them, so the description is the fallback — and it has to be the
 * same fallback everywhere, or a merchant clicked in the table filters to
 * nothing.
 */
export const merchantOf = (t: Categorized): string => t.counterparty ?? t.description;

/**
 * The value the subcategory filter matches on: the pair, with a trailing slash
 * where there is no second level.
 *
 * A row with no sub is still selectable — half of `rules/overrides.json` names
 * only one level, so "the part of this category nothing has named yet" is a real
 * thing to want to look at, and dropping it would make the drill-down silently
 * show less than the category it opened from.
 */
export const subcategoryOf = (t: Categorized): string => `${t.category}/${t.subcategory ?? ''}`;

/**
 * Both ends inclusive, and a null end is open — an empty date box means "no
 * bound", not "no rows". ISO dates sort lexicographically, so plain string
 * comparison is the whole implementation; no parsing, and no timezone to get
 * wrong the way `new Date(...)` would.
 */
export function inRange(t: Categorized, from: string | null, to: string | null): boolean {
  if (from && t.date < from) return false;
  if (to && t.date > to) return false;
  return true;
}

/** An empty list is every row, either way round — a filter nobody set must never empty the page. */
const listed = (values: string[], mode: Mode, value: string): boolean =>
  !values.length || values.includes(value) === (mode === 'include');

/**
 * The same, where a row can be named more than one way. Any candidate matching
 * counts as a match, so a category and one of its own subcategories are a union
 * rather than an impossible intersection — and excluding a category still takes
 * its subcategories with it, since the bare slug is one of the candidates.
 */
const listedAny = (values: string[], mode: Mode, candidates: string[]): boolean =>
  !values.length || candidates.some((c) => values.includes(c)) === (mode === 'include');

export function matchesFilters(t: Categorized, f: Filters): boolean {
  if (t.excluded && !f.showExcluded) return false;
  if (!listedAny(f.categories, f.categoryMode, [t.category, subcategoryOf(t)])) return false;
  if (!listed(f.merchants, f.merchantMode, merchantOf(t))) return false;
  if (!listed(f.accounts, f.accountMode, t.account)) return false;
  if (f.search) {
    const q = f.search.toLowerCase();
    const hay = (t.description + ' ' + (t.counterparty ?? '')).toLowerCase();
    if (!hay.includes(q)) return false;
  }
  return true;
}

export type PeriodKind = 'month' | 'year' | 'all';

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

/** Today in Oslo, in the same shape and zone as `Txn.date`. */
export const todayOslo = (): string => new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Oslo' });

/**
 * What the window being compared against is called.
 *
 * The year back — every window's default — keeps the relative wording it has
 * always had. Any other choice names itself instead, because "last year" over a
 * window three years back is simply false, and the tiles quote this string.
 */
const prevLabel = (back: number, y: number, partial: boolean): string =>
  back === y - 1
    ? partial
      ? 'this time last year'
      : 'last year'
    : partial
      ? `this time in ${back}`
      : String(back);

/**
 * The one period the whole page runs on: a month `2026-07`, a year `2026`, or
 * anything else meaning all time.
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
 *
 * `vs` names the year to compare against instead of the year back — the same
 * month of it, or the whole of it for a year period. It is the window that
 * moves, never the length: two Julys stay two Julys however far apart they sit,
 * which is what keeps the deltas and the comparison line meaning one thing. A
 * year that is not before the one in view is no comparison at all, so it falls
 * back to the default rather than drawing a window ahead of the period.
 */
export function period(p: string, now = todayOslo(), vs: string | null = null): Period {
  const backYear = (y: number) => (vs && Number(vs) < y ? Number(vs) : y - 1);
  if (/^\d{4}-\d{2}$/.test(p)) {
    const y = Number(p.slice(0, 4));
    const b = backYear(y);
    const back = `${b}-${p.slice(5)}`;
    const prev =
      now.slice(0, 7) === p
        ? { from: `${back}-01`, to: `${back}-${now.slice(8)}`, label: prevLabel(b, y, true) }
        : { ...monthBounds(back), label: prevLabel(b, y, false) };
    return { kind: 'month', ...monthBounds(p), label: p, prev };
  }
  if (/^\d{4}$/.test(p)) {
    const y = Number(p);
    const b = backYear(y);
    const prev =
      now.slice(0, 4) === p
        ? { from: `${b}-01-01`, to: `${b}-${now.slice(5)}`, label: prevLabel(b, y, true) }
        : { ...yearBounds(b), label: prevLabel(b, y, false) };
    return { kind: 'year', ...yearBounds(y), label: p, prev };
  }
  return { kind: 'all', from: null, to: null, label: 'All time', prev: null };
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
  const edge = rows.reduce((latest, t) => (t.date > latest ? t.date : latest), now);
  return {
    from: p.from ?? rows.reduce((first, t) => (t.date < first ? t.date : first), edge),
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

export function distinctAccounts(txns: Categorized[]): string[] {
  return [...new Set(txns.map((t) => t.account))].sort((a, b) => a.localeCompare(b));
}
