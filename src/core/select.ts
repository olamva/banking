/**
 * Which rows are in view. No money logic — that is stats.ts, and this module
 * must never grow any: everything here answers "is this row shown?", never
 * "what does it add up to?".
 *
 * Pure and dependency-free so the browser and `node --test` run the same code.
 */
import type { Categorized } from './types.ts';

export type Filters = {
  /** Empty means every category, whichever way `categoryMode` is set. */
  categories: string[];
  /** Whether `categories` names the only rows to show, or the only ones to hide. */
  categoryMode: 'include' | 'exclude';
  search: string;
};

export const NO_FILTERS: Filters = {
  categories: [],
  categoryMode: 'include',
  search: '',
};

export function inMonth(t: Categorized, month: string): boolean {
  return t.date.slice(0, 7) === month;
}

export function inYear(t: Categorized, year: string): boolean {
  return t.date.slice(0, 4) === year;
}

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

const pad = (n: number) => String(n).padStart(2, '0');

/**
 * Oslo-local today, `days` back, as YYYY-MM-DD — the open end of "last 30 days".
 *
 * Anchored on a UTC midnight rebuilt from the Oslo date, so the subtraction
 * never crosses a DST boundary and lands an hour into the wrong day. `today` is
 * injectable for the same reason `rangeToDate` takes it: otherwise there is
 * nothing to assert against.
 */
export function daysAgo(days: number, today = new Date()): string {
  const [y, m, d] = today.toLocaleDateString('en-CA', { timeZone: 'Europe/Oslo' }).split('-').map(Number);
  const back = new Date(Date.UTC(y!, m! - 1, d!) - days * 86_400_000);
  return `${back.getUTCFullYear()}-${pad(back.getUTCMonth() + 1)}-${pad(back.getUTCDate())}`;
}

export function matchesFilters(t: Categorized, f: Filters): boolean {
  if (f.categories.length) {
    const listed = f.categories.includes(t.category);
    if (f.categoryMode === 'exclude' ? listed : !listed) return false;
  }
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

export function distinctMonths(txns: Categorized[]): string[] {
  return [...new Set(txns.map((t) => t.date.slice(0, 7)))].sort();
}

export function distinctYears(txns: Categorized[]): string[] {
  return [...new Set(txns.map((t) => t.date.slice(0, 4)))].sort();
}

export function distinctCategories(txns: Categorized[]): string[] {
  return [...new Set(txns.map((t) => t.category))].sort();
}
