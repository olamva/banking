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
  /** Empty means every category, whichever way `categoryMode` is set. */
  categories: string[];
  /** Whether `categories` names the only rows to show, or the only ones to hide. */
  categoryMode: Mode;
  /** The same, over `merchantOf` — the name the tables and the bars show. */
  merchants: string[];
  merchantMode: Mode;
  search: string;
  /**
   * Whether internal transfers and card bill payments are listed. Off by
   * default: no money path counts them — `stats.ts` skips them before it sums —
   * so listing them only makes a transfer pair look like spending. One toggle
   * puts them back, because the excluded set has to stay auditable.
   */
  showExcluded: boolean;
};

export const NO_FILTERS: Filters = {
  categories: [],
  categoryMode: 'include',
  merchants: [],
  merchantMode: 'include',
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

export function matchesFilters(t: Categorized, f: Filters): boolean {
  if (t.excluded && !f.showExcluded) return false;
  if (!listed(f.categories, f.categoryMode, t.category)) return false;
  if (!listed(f.merchants, f.merchantMode, merchantOf(t))) return false;
  if (f.search) {
    const q = f.search.toLowerCase();
    const hay = (t.description + ' ' + (t.counterparty ?? '')).toLowerCase();
    if (!hay.includes(q)) return false;
  }
  return true;
}

export function prevMonth(month: string): string {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(Date.UTC(y!, m! - 1, 1));
  d.setUTCMonth(d.getUTCMonth() - 1);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
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

/**
 * The one period the whole page runs on: a month `2026-07`, a year `2026`, or
 * anything else meaning all time.
 *
 * Both views read this, which is what lets the dashboard and the table stay in
 * step — and what makes "vs the previous period" mean the same thing for a
 * month and for a year.
 */
export function period(p: string): Period {
  if (/^\d{4}-\d{2}$/.test(p)) {
    return { kind: 'month', ...monthBounds(p), label: p, prev: { ...monthBounds(prevMonth(p)), label: 'last month' } };
  }
  if (/^\d{4}$/.test(p)) {
    const y = Number(p);
    return { kind: 'year', ...yearBounds(y), label: p, prev: { ...yearBounds(y - 1), label: 'last year' } };
  }
  return { kind: 'all', from: null, to: null, label: 'All time', prev: null };
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

/** Hundreds of these, so the dropdown that shows them is searchable. */
export function distinctMerchants(txns: Categorized[]): string[] {
  return [...new Set(txns.map(merchantOf))].sort((a, b) => a.localeCompare(b));
}
