/**
 * Which rows are in view. No money logic — that is stats.ts, and this module
 * must never grow any: everything here answers "is this row shown?", never
 * "what does it add up to?".
 *
 * Pure and dependency-free so the browser and `node --test` run the same code.
 */
import type { Categorized } from './types.ts';

export type Filters = {
  /** Empty means every category; otherwise the row's category must be one of these. */
  categories: string[];
  source: '' | 'sb1' | 'card';
  search: string;
  minAmount: number | null;
  maxAmount: number | null;
};

export const NO_FILTERS: Filters = {
  categories: [],
  source: '',
  search: '',
  minAmount: null,
  maxAmount: null,
};

export function inMonth(t: Categorized, month: string): boolean {
  return t.date.slice(0, 7) === month;
}

export function inYear(t: Categorized, year: string): boolean {
  return t.date.slice(0, 4) === year;
}

export function matchesFilters(t: Categorized, f: Filters): boolean {
  if (f.categories.length && !f.categories.includes(t.category)) return false;
  if (f.source && t.source !== f.source) return false;
  if (f.search) {
    const q = f.search.toLowerCase();
    const hay = (t.description + ' ' + (t.counterparty ?? '')).toLowerCase();
    if (!hay.includes(q)) return false;
  }
  const abs = Math.abs(t.amount);
  if (f.minAmount != null && abs < f.minAmount) return false;
  if (f.maxAmount != null && abs > f.maxAmount) return false;
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
