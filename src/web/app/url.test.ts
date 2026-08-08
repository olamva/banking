import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NO_FILTERS } from '../../core/select.ts';
import { fromParams, toParams, type UrlState } from './url.ts';

// Importing this module must stay DOM-free: readUrl/writeUrl only touch
// location/history when called, so node can run everything else here.

const DEFAULT: UrlState = { view: 'month', month: null, year: null, days: null, filters: NO_FILTERS };

test('the untouched page has no query string at all', () => {
  assert.equal(toParams(DEFAULT), '');
});

test('a populated state round-trips, nulls included', () => {
  const state: UrlState = {
    view: 'year',
    month: null,
    year: '2026',
    days: null,
    filters: { categories: ['dagligvarer', 'transport'], categoryMode: 'exclude', search: 'rema' },
  };
  assert.deepEqual(fromParams(new URLSearchParams(toParams(state))), state);
  assert.deepEqual(fromParams(new URLSearchParams(toParams(DEFAULT))), DEFAULT);

  const range: UrlState = { ...DEFAULT, view: 'transactions', days: 90 };
  assert.deepEqual(fromParams(new URLSearchParams(toParams(range))), range);
});

/** The view owns which period is in play; the others are not filters anything applies. */
test('only the period the view uses reaches the URL', () => {
  const all = { ...DEFAULT, month: '2026-07', year: '2026', days: 30 };
  assert.equal(toParams({ ...all, view: 'month' }), 'month=2026-07');
  assert.equal(toParams({ ...all, view: 'year' }), 'view=year&year=2026');
  assert.equal(toParams({ ...all, view: 'transactions' }), 'view=transactions&days=30');
});

/** The mode changes what the same list means, so it has to survive a reload with it. */
test('the category mode rides along, and only when it is not the default', () => {
  const picked: UrlState = { ...DEFAULT, filters: { ...NO_FILTERS, categories: ['reise'] } };
  assert.equal(toParams(picked), 'cat=reise');
  assert.equal(toParams({ ...picked, filters: { ...picked.filters, categoryMode: 'exclude' } }), 'cat=reise&cat_mode=exclude');
  assert.equal(fromParams(new URLSearchParams('cat=reise&cat_mode=sideways')).filters.categoryMode, 'include');
});

test('junk params fall back to the default, and an empty cat is no categories', () => {
  const s = fromParams(new URLSearchParams('cat=&view=sideways&days=7'));
  assert.deepEqual(s.filters.categories, []);
  assert.equal(s.view, 'month');
  // 7 is not one of the presets, so it falls back to all time rather than to NaN.
  assert.equal(s.days, null);
});
