import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  matchesFilters,
  inRange,
  period,
  prevMonth,
  distinctMonths,
  distinctCategories,
  distinctMerchants,
  NO_FILTERS,
} from './select.ts';
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
    typeText: null,
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

/**
 * The transfer legs net to zero and no sum counts them, so they are hidden by
 * default — but the toggle has to reach them whatever else is filtered, or the
 * excluded set stops being auditable.
 */
test('matchesFilters: excluded rows are hidden unless showExcluded, and no other filter overrides it', () => {
  const transfer = txn({ id: '1', amount: -3706, excluded: true, reason: 'internal transfer' });
  const spend = txn({ id: '2', amount: -123 });

  assert.equal(matchesFilters(transfer, NO_FILTERS), false);
  assert.equal(matchesFilters(spend, NO_FILTERS), true);
  assert.equal(matchesFilters(transfer, { ...NO_FILTERS, showExcluded: true }), true);

  // Hidden even when a filter names it, and shown only when the toggle is on.
  const named = { ...NO_FILTERS, merchants: ['Kiwi'] };
  assert.equal(matchesFilters(transfer, named), false);
  assert.equal(matchesFilters(transfer, { ...named, showExcluded: true }), true);

  // Still subject to the other filters once it is showing.
  assert.equal(
    matchesFilters(transfer, { ...NO_FILTERS, showExcluded: true, search: 'nothing' }),
    false,
  );
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

/** One period for both views, so a wrong bound here is wrong on every number the page shows. */
test('period: a month covers its own days and nothing either side of it', () => {
  const p = period('2026-02', '2026-08-09');
  assert.deepEqual([p.kind, p.from, p.to], ['month', '2026-02-01', '2026-02-31']);
  // The bound is a string comparison, so a short month needs no special case:
  // the 28th is in, and no March date sorts under it.
  const inside = (date: string) => inRange(txn({ id: '1', amount: -1, date }), p.from, p.to);
  assert.equal(inside('2026-02-01'), true);
  assert.equal(inside('2026-02-28'), true);
  assert.equal(inside('2026-01-31'), false);
  assert.equal(inside('2026-03-01'), false);
  assert.deepEqual(p.prev, { from: '2026-01-01', to: '2026-01-31', label: 'last month' });
});

test('period: a year, and its previous window is the year before', () => {
  const p = period('2026', '2027-03-04');
  assert.deepEqual([p.kind, p.from, p.to], ['year', '2026-01-01', '2026-12-31']);
  assert.deepEqual(p.prev, { from: '2025-01-01', to: '2025-12-31', label: 'last year' });
});

/**
 * Nine days of August against a whole August is a 70% fall drawn by the
 * calendar. The period still running compares against the same slice of the one
 * before it, and only that one — every finished period is still a full compare.
 */
test('period: a period still running is compared against the same slice of the previous one', () => {
  assert.deepEqual(period('2026-08', '2026-08-09').prev, {
    from: '2026-07-01',
    to: '2026-07-09',
    label: 'this time last month',
  });
  assert.deepEqual(period('2026', '2026-08-09').prev, {
    from: '2025-01-01',
    to: '2025-08-09',
    label: 'this time last year',
  });

  // A day the previous window has not got needs no special case: the bound is a
  // string, and every February date sorts under it.
  assert.equal(period('2026-03', '2026-03-30').prev!.to, '2026-02-30');
  assert.equal(inRange(txn({ id: '1', amount: -1, date: '2026-02-28' }), '2026-02-01', '2026-02-30'), true);
  assert.equal(inRange(txn({ id: '2', amount: -1, date: '2026-03-01' }), '2026-02-01', '2026-02-30'), false);

  // The month and the year before this one are both over, so both compare whole.
  assert.equal(period('2026-07', '2026-08-09').prev!.label, 'last month');
  assert.equal(period('2025', '2026-08-09').prev!.label, 'last year');
});

/** All time bounds nothing and has nothing before it — no deltas to draw. */
test('period: all time, and anything unrecognised, is unbounded and has no previous', () => {
  for (const p of [period('all'), period('sideways'), period('')]) {
    assert.deepEqual([p.kind, p.from, p.to, p.prev], ['all', null, null, null]);
  }
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

test('prevMonth handles the year boundary', () => {
  assert.equal(prevMonth('2026-07'), '2026-06');
  assert.equal(prevMonth('2026-01'), '2025-12');
});

test('distinctMonths is sorted and deduplicated', () => {
  const txns = [txn({ id: '1', amount: -1, date: '2026-07-10' }), txn({ id: '2', amount: -1, date: '2026-06-10' }), txn({ id: '3', amount: -1, date: '2026-07-20' })];
  assert.deepEqual(distinctMonths(txns), ['2026-06', '2026-07']);
});

/** Both lists narrow at once, and a card row with no counterparty filters by the name the table shows. */
test('matchesFilters: merchants, alongside the categories, and on the description when there is no counterparty', () => {
  const rema = txn({ id: '1', amount: -100, counterparty: 'Rema 1000', category: 'dagligvarer' });
  const kiwi = txn({ id: '2', amount: -50, counterparty: 'Kiwi', category: 'dagligvarer' });
  const card = txn({ id: '3', amount: -20, counterparty: null, description: 'Varekjøp', category: 'ukategorisert' });
  const all = [rema, kiwi, card];

  const only = (f: Partial<typeof NO_FILTERS>) => all.filter((t) => matchesFilters(t, { ...NO_FILTERS, ...f }));
  assert.deepEqual(only({ merchants: ['Rema 1000'] }), [rema]);
  assert.deepEqual(only({ merchants: ['Rema 1000'], merchantMode: 'exclude' }), [kiwi, card]);
  // No counterparty, so the description is the merchant — the same string the table cell offers.
  assert.deepEqual(only({ merchants: ['Varekjøp'] }), [card]);
  // The two lists are an AND: a merchant in the wrong category is out.
  assert.deepEqual(only({ merchants: ['Rema 1000'], categories: ['transport'] }), []);
  assert.equal(only({ merchantMode: 'exclude' }).length, 3);
});

test('distinctMerchants falls back to the description and is sorted and deduplicated', () => {
  const txns = [
    txn({ id: '1', amount: -1, counterparty: 'Kiwi' }),
    txn({ id: '2', amount: -1, counterparty: null, description: 'Apple' }),
    txn({ id: '3', amount: -1, counterparty: 'Kiwi' }),
  ];
  assert.deepEqual(distinctMerchants(txns), ['Apple', 'Kiwi']);
});

test('distinctCategories drives the filter chips, so it is sorted and deduplicated', () => {
  const txns = [txn({ id: '1', amount: -1, category: 'transport' }), txn({ id: '2', amount: -1, category: 'dagligvarer' }), txn({ id: '3', amount: -1, category: 'transport' })];
  assert.deepEqual(distinctCategories(txns), ['dagligvarer', 'transport']);
});
