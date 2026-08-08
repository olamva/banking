/**
 * The view and the filters, in the query string, so a filtered page survives a
 * reload and can be pinned in a tab. Anything at its default is left out, so an
 * untouched page keeps a bare URL.
 *
 * `toParams` and `fromParams` touch no DOM, which is what lets `node --test`
 * pin the parsing edges — a stray NaN here would silently filter every row away.
 */
import type { Filters } from '../../core/select.ts';

export type UrlState = {
  view: 'month' | 'year' | 'transactions';
  /** Null is "the latest month", which App derives from the rows it has. */
  month: string | null;
  year: string | null;
  /** The transactions view's own period, in days back from today. Null is all time. */
  days: number | null;
  filters: Filters;
};

const VIEWS: UrlState['view'][] = ['month', 'year', 'transactions'];
/** Clamped like `view` is, so a hand-edited URL cannot leave the picker with no option selected. */
const DAYS = [30, 90];

const num = (v: string | null): number | null => {
  const n = Number(v);
  return v && Number.isFinite(n) ? n : null;
};

export const toParams = (s: UrlState): string => {
  const p = new URLSearchParams();
  if (s.view !== 'month') p.set('view', s.view);
  // Only the period the view actually uses: a month left in the URL of a year
  // view is a filter nothing on the page is applying.
  if (s.view === 'month' && s.month) p.set('month', s.month);
  if (s.view === 'year' && s.year) p.set('year', s.year);
  if (s.view === 'transactions' && s.days) p.set('days', String(s.days));
  if (s.filters.categories.length) p.set('cat', s.filters.categories.join(','));
  if (s.filters.search) p.set('q', s.filters.search);
  if (s.filters.minAmount != null) p.set('min', String(s.filters.minAmount));
  if (s.filters.maxAmount != null) p.set('max', String(s.filters.maxAmount));
  return p.toString();
};

export const fromParams = (p: URLSearchParams): UrlState => ({
  view: VIEWS.find((v) => v === p.get('view')) ?? 'month',
  month: p.get('month') || null,
  year: p.get('year') || null,
  days: DAYS.find((d) => d === num(p.get('days'))) ?? null,
  filters: {
    categories: p.get('cat')?.split(',').filter(Boolean) ?? [],
    search: p.get('q') ?? '',
    minAmount: num(p.get('min')),
    maxAmount: num(p.get('max')),
  },
});

export const readUrl = (): UrlState => fromParams(new URLSearchParams(location.search));

/** replaceState, never push — back should leave the page, not undo one filter edit. */
export const writeUrl = (s: UrlState): void => {
  const q = toParams(s);
  history.replaceState(null, '', q ? `?${q}` : location.pathname);
};
