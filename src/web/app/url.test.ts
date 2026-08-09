import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NO_FILTERS } from '../../core/select.ts';
import { fromParams, toParams, type UrlState } from './url.ts';

// Importing this module must stay DOM-free: readUrl/writeUrl only touch
// location/history when called, so node can run everything else here.

const DEFAULT: UrlState = { view: 'dashboard', period: null, filters: NO_FILTERS };

test('the untouched page has no query string at all', () => {
  assert.equal(toParams(DEFAULT), '');
});

test('a populated state round-trips, nulls included', () => {
  const state: UrlState = {
    view: 'transactions',
    period: '2026',
    filters: {
      categories: ['dagligvarer', 'transport'],
      categoryMode: 'exclude',
      merchants: ['Rema 1000', 'Kiwi'],
      merchantMode: 'include',
      search: 'rema',
      showExcluded: true,
    },
  };
  assert.deepEqual(fromParams(new URLSearchParams(toParams(state))), state);
  assert.deepEqual(fromParams(new URLSearchParams(toParams(DEFAULT))), DEFAULT);
});

/** One period for both views, so it rides along whichever one is showing. */
test('the period is one param, and the same one in either view', () => {
  assert.equal(toParams({ ...DEFAULT, period: '2026-07' }), 'p=2026-07');
  assert.equal(toParams({ ...DEFAULT, view: 'transactions', period: 'all' }), 'view=transactions&p=all');
});

/** The mode changes what the same list means, so it has to survive a reload with it. */
test('the category mode rides along, and only when it is not the default', () => {
  const picked: UrlState = { ...DEFAULT, filters: { ...NO_FILTERS, categories: ['reise'] } };
  assert.equal(toParams(picked), 'cat=reise');
  assert.equal(toParams({ ...picked, filters: { ...picked.filters, categoryMode: 'exclude' } }), 'cat=reise&cat_mode=exclude');
  assert.equal(fromParams(new URLSearchParams('cat=reise&cat_mode=sideways')).filters.categoryMode, 'include');
});

/** A merchant name can hold a comma, so each gets its own param rather than one joined list. */
test('merchants survive a comma in the name', () => {
  const state: UrlState = {
    ...DEFAULT,
    filters: { ...NO_FILTERS, merchants: ['Meny, Torgallmenningen', 'Kiwi'], merchantMode: 'exclude' },
  };
  assert.deepEqual(fromParams(new URLSearchParams(toParams(state))), state);
  assert.equal(toParams({ ...DEFAULT, filters: { ...NO_FILTERS, merchants: ['Kiwi'] } }), 'm=Kiwi');
  assert.equal(fromParams(new URLSearchParams('m=Kiwi&m_mode=sideways')).filters.merchantMode, 'include');
});

/** Hiding them is the default, so only the shown state is worth a param. */
test('showExcluded rides along only when it is on', () => {
  assert.equal(toParams({ ...DEFAULT, filters: { ...NO_FILTERS, showExcluded: true } }), 'excl=1');
  assert.equal(fromParams(new URLSearchParams('excl=yes')).filters.showExcluded, false);
});

/** An unknown period is App's problem, not the URL's — it falls back to the latest month there. */
test('junk params fall back to the default, and an empty cat is no categories', () => {
  const s = fromParams(new URLSearchParams('cat=&view=sideways&p='));
  assert.deepEqual(s.filters.categories, []);
  assert.equal(s.view, 'dashboard');
  assert.equal(s.period, null);
});
