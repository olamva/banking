import { test } from 'node:test';
import assert from 'node:assert/strict';
import { matchesFilters, daysAgo, inMonth, inRange, inYear, prevMonth, distinctMonths, distinctCategories, NO_FILTERS } from './select.ts';
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

test('matchesFilters: category and search', () => {
  const t = txn({ id: '1', amount: -123.45, description: 'Rema 1000', counterparty: 'Rema', category: 'dagligvarer' });
  assert.equal(matchesFilters(t, NO_FILTERS), true);
  assert.equal(matchesFilters(t, { ...NO_FILTERS, categories: ['transport'] }), false);
  assert.equal(matchesFilters(t, { ...NO_FILTERS, search: 'rema' }), true);
  assert.equal(matchesFilters(t, { ...NO_FILTERS, search: 'kiwi' }), false);
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

/** The same list read the other way round: excluding is the complement of including. */
test('matchesFilters: exclude hides exactly what include would have kept', () => {
  const groceries = txn({ id: '1', amount: -100, category: 'dagligvarer' });
  const transport = txn({ id: '2', amount: -50, category: 'transport' });
  const rent = txn({ id: '3', amount: -18000, category: 'faste_boutgifter' });
  const all = [groceries, transport, rent];

  const list = ['dagligvarer', 'transport'];
  const kept = all.filter((t) => matchesFilters(t, { ...NO_FILTERS, categories: list }));
  const dropped = all.filter((t) => matchesFilters(t, { ...NO_FILTERS, categories: list, categoryMode: 'exclude' }));
  assert.deepEqual(dropped, [rent]);
  assert.deepEqual([...kept, ...dropped].sort((a, b) => a.id.localeCompare(b.id)), all);

  // An empty list means every row either way — never an empty page.
  assert.equal(all.filter((t) => matchesFilters(t, { ...NO_FILTERS, categoryMode: 'exclude' })).length, 3);
});

test('inMonth and inYear read the booking date, not a timestamp', () => {
  const t = txn({ id: '1', amount: -10, date: '2026-07-01' });
  assert.equal(inMonth(t, '2026-07'), true);
  assert.equal(inMonth(t, '2026-06'), false);
  assert.equal(inYear(t, '2026'), true);
});

/** An open end is the empty date box, which must mean "no bound" and not "no rows". */
test('inRange is inclusive at both ends, and an open end bounds nothing', () => {
  const t = txn({ id: '1', amount: -10, date: '2026-07-15' });
  assert.equal(inRange(t, '2026-07-15', '2026-07-15'), true);
  assert.equal(inRange(t, '2026-07-16', null), false);
  assert.equal(inRange(t, null, '2026-07-14'), false);
  assert.equal(inRange(t, null, null), true);
  assert.equal(inRange(t, '2025-12-31', '2026-12-31'), true);
});

/** The Oslo rule again: a July timestamp is 22:00Z the day before, so UTC would shift every answer. */
test('daysAgo counts back in Oslo-local days, across month and year boundaries', () => {
  // 2026-08-09T06:00Z is 08:00 on the 9th in Oslo.
  const summer = new Date('2026-08-09T06:00:00Z');
  assert.equal(daysAgo(0, summer), '2026-08-09');
  assert.equal(daysAgo(30, summer), '2026-07-10');
  assert.equal(daysAgo(90, summer), '2026-05-11');

  // 22:30Z on 31 Dec is already 23:30 the same day in Oslo — but 30 Jun 22:30Z
  // is 1 Jul in Oslo, which is the case UTC would get wrong.
  assert.equal(daysAgo(1, new Date('2027-01-01T10:00:00Z')), '2026-12-31');
  assert.equal(daysAgo(0, new Date('2026-06-30T22:30:00Z')), '2026-07-01');
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
