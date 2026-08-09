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
  view: 'dashboard' | 'transactions';
  /**
   * One period for both views — a month, a year, `30d` or `all`. Null is "the
   * latest month", which App derives from the rows it has; storing the answer
   * instead would freeze today's latest into the URL.
   */
  period: string | null;
  filters: Filters;
};

const VIEWS: UrlState['view'][] = ['dashboard', 'transactions'];

export const toParams = (s: UrlState): string => {
  const p = new URLSearchParams();
  if (s.view !== 'dashboard') p.set('view', s.view);
  if (s.period) p.set('p', s.period);
  if (s.filters.categories.length) p.set('cat', s.filters.categories.join(','));
  if (s.filters.categoryMode !== 'include') p.set('cat_mode', s.filters.categoryMode);
  // One param per merchant, not a joined list: a merchant name can contain a
  // comma, and a category slug cannot.
  for (const m of s.filters.merchants) p.append('m', m);
  if (s.filters.merchantMode !== 'include') p.set('m_mode', s.filters.merchantMode);
  if (s.filters.search) p.set('q', s.filters.search);
  if (s.filters.showExcluded) p.set('excl', '1');
  return p.toString();
};

/**
 * No validation on `p`: `period()` reads anything it does not recognise as all
 * time, and App only keeps a value its own picker offers. A hand-edited URL
 * lands on a real period either way.
 */
export const fromParams = (p: URLSearchParams): UrlState => ({
  view: VIEWS.find((v) => v === p.get('view')) ?? 'dashboard',
  period: p.get('p') || null,
  filters: {
    categories: p.get('cat')?.split(',').filter(Boolean) ?? [],
    categoryMode: p.get('cat_mode') === 'exclude' ? 'exclude' : 'include',
    merchants: p.getAll('m').filter(Boolean),
    merchantMode: p.get('m_mode') === 'exclude' ? 'exclude' : 'include',
    search: p.get('q') ?? '',
    showExcluded: p.get('excl') === '1',
  },
});

export const readUrl = (): UrlState => fromParams(new URLSearchParams(location.search));

/** replaceState, never push — back should leave the page, not undo one filter edit. */
export const writeUrl = (s: UrlState): void => {
  const q = toParams(s);
  history.replaceState(null, '', q ? `?${q}` : location.pathname);
};
