import { test } from 'node:test';
import assert from 'node:assert/strict';
import { matchesFilters, inMonth, inYear, prevMonth, distinctMonths, distinctCategories, NO_FILTERS } from './select.ts';
import type { Categorized } from './types.ts';

// Selection only. Aggregation is stats.ts, pinned by src/core/stats.test.ts —
// the React app imports both directly, so what runs here is what runs there.

function txn(partial: Partial<Categorized> & { id: string; amount: number }): Categorized {
  return {
    source: 'sb1',
    accountKey: 'acc',
    date: '2026-07-15',
    description: 'test',
    counterparty: 'Kiwi',
    bankCategory: null,
    isRecurring: false,
    isSubscription: false,
    isPending: false,
    excluded: false,
    reason: null,
    category: 'dagligvarer',
    ...partial,
  };
}

test('matchesFilters: category, source, search and amount range', () => {
  const t = txn({ id: '1', amount: -123.45, description: 'Rema 1000', counterparty: 'Rema', category: 'dagligvarer' });
  assert.equal(matchesFilters(t, NO_FILTERS), true);
  assert.equal(matchesFilters(t, { ...NO_FILTERS, categories: ['transport'] }), false);
  assert.equal(matchesFilters(t, { ...NO_FILTERS, source: 'card' }), false);
  assert.equal(matchesFilters(t, { ...NO_FILTERS, search: 'rema' }), true);
  assert.equal(matchesFilters(t, { ...NO_FILTERS, search: 'kiwi' }), false);
  assert.equal(matchesFilters(t, { ...NO_FILTERS, minAmount: 200 }), false);
  assert.equal(matchesFilters(t, { ...NO_FILTERS, maxAmount: 100 }), false);
});

/** No categories means all of them, not none — an empty filter must not empty the page. */
test('matchesFilters: several categories at once, and none means all', () => {
  const groceries = txn({ id: '1', amount: -100, category: 'dagligvarer' });
  const transport = txn({ id: '2', amount: -50, category: 'transport' });
  const rent = txn({ id: '3', amount: -18000, category: 'faste_boutgifter' });
  const all = [groceries, transport, rent];

  const two = { ...NO_FILTERS, categories: ['dagligvarer', 'transport'] };
  assert.deepEqual(all.filter((t) => matchesFilters(t, two)), [groceries, transport]);
  assert.equal(all.filter((t) => matchesFilters(t, NO_FILTERS)).length, 3);
});

test('inMonth and inYear read the booking date, not a timestamp', () => {
  const t = txn({ id: '1', amount: -10, date: '2026-07-01' });
  assert.equal(inMonth(t, '2026-07'), true);
  assert.equal(inMonth(t, '2026-06'), false);
  assert.equal(inYear(t, '2026'), true);
});

test('prevMonth handles the year boundary', () => {
  assert.equal(prevMonth('2026-07'), '2026-06');
  assert.equal(prevMonth('2026-01'), '2025-12');
});

test('distinctMonths is sorted and deduplicated', () => {
  const txns = [txn({ id: '1', amount: -1, date: '2026-07-10' }), txn({ id: '2', amount: -1, date: '2026-06-10' }), txn({ id: '3', amount: -1, date: '2026-07-20' })];
  assert.deepEqual(distinctMonths(txns), ['2026-06', '2026-07']);
});

test('distinctCategories drives the filter chips, so it is sorted and deduplicated', () => {
  const txns = [txn({ id: '1', amount: -1, category: 'transport' }), txn({ id: '2', amount: -1, category: 'dagligvarer' }), txn({ id: '3', amount: -1, category: 'transport' })];
  assert.deepEqual(distinctCategories(txns), ['dagligvarer', 'transport']);
});
