import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  AXES,
  axisBounds,
  matchesFilters,
  inRange,
  period,
  distinctMonths,
  distinctCategories,
  distinctMerchants,
  distinctSubcategories,
  subcategoryOf,
  NO_FILTERS,
} from './select.ts';
import type { Categorized } from './types.ts';
import type { Filters } from './select.ts';

// Selection only. Aggregation is stats.ts, pinned by src/core/stats.test.ts —
// the React app imports both directly, so what runs here is what runs there.

function txn(partial: Partial<Categorized> & { id: string; amount: number }): Categorized {
  return {
    account: 'Brukskonto',
    accountKey: 'acc',
    date: '2026-07-15',
    description: 'test',
    counterparty: 'Kiwi',
    bankCategory: null,
    bankSub: null,
    bankCategoryName: null,
    bankSubName: null,
    bankConfidence: null,
    typeText: null,
    remoteAccountNumber: null,
    isRecurring: false,
    isSubscription: false,
    excluded: false,
    reason: null,
    category: 'dagligvarer',
    subcategory: null,
    ...partial,
  };
}

test('axisBounds stops a running period at the record, not at its last calendar day', () => {
  const now = '2026-08-09';
  const rows = [txn({ id: '1', amount: -10, date: '2026-08-03' })];

  // Still running: the axis would otherwise draw three flat weeks to the 31st.
  assert.deepEqual(axisBounds(rows, period('2026-08', now), now), {
    from: '2026-08-01',
    to: '2026-08-09',
  });

  // Finished: the whole month, `-31` bound and all — `dailySeries` walks it as a string.
  assert.deepEqual(axisBounds(rows, period('2026-02', now), now), {
    from: '2026-02-01',
    to: '2026-02-31',
  });

  // The same for a year, either side of today.
  assert.equal(axisBounds(rows, period('2026', now), now).to, '2026-08-09');
  assert.equal(axisBounds(rows, period('2025', now), now).to, '2025-12-31');
});

/**
 * The bank books card rows a day or two ahead, so `data/raw/` holds dates later
 * than today as a matter of course. An axis cut at today drops them, and the
 * chart then ends on a smaller number than the tile above it.
 */
test('axisBounds never stops short of a row dated past today', () => {
  const now = '2026-08-09';
  const rows = [
    txn({ id: '1', amount: -10, date: '2026-08-03' }),
    txn({ id: '2', amount: -20, date: '2026-08-11' }),
  ];
  assert.equal(axisBounds(rows, period('2026-08', now), now).to, '2026-08-11');
  assert.equal(axisBounds(rows, period('2026', now), now).to, '2026-08-11');
});

test('axisBounds falls back to the rows themselves when the period is open at both ends', () => {
  const now = '2026-08-09';
  const rows = [
    txn({ id: '1', amount: -10, date: '2024-03-02' }),
    txn({ id: '2', amount: -10, date: '2022-01-03' }),
  ];
  assert.deepEqual(axisBounds(rows, period('all', now), now), {
    from: '2022-01-03',
    to: '2026-08-09',
  });

  // No rows at all is a single day, never an inverted range `dailySeries` would
  // walk backwards forever on.
  const empty = axisBounds([], period('all', now), now);
  assert.deepEqual(empty, { from: now, to: now });
});

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
  // A month is judged against the same month a year back — see `period`.
  assert.deepEqual(p.prev, { from: '2025-02-01', to: '2025-02-31', label: 'last year' });
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
    from: '2025-08-01',
    to: '2025-08-09',
    label: 'this time last year',
  });
  assert.deepEqual(period('2026', '2026-08-09').prev, {
    from: '2025-01-01',
    to: '2025-08-09',
    label: 'this time last year',
  });

  // A day the previous window has not got needs no special case: the bound is a
  // string. The 29th of a leap February cuts against a year that has no 29th of
  // February at all, and every date it does have still sorts under it.
  assert.equal(period('2024-02', '2024-02-29').prev!.to, '2023-02-29');
  assert.equal(inRange(txn({ id: '1', amount: -1, date: '2023-02-28' }), '2023-02-01', '2023-02-29'), true);
  assert.equal(inRange(txn({ id: '2', amount: -1, date: '2023-03-01' }), '2023-02-01', '2023-02-29'), false);

  // Both windows before these are over, so both compare whole.
  assert.equal(period('2026-07', '2026-08-09').prev!.label, 'last year');
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

test('a month in January compares against January the year before', () => {
  assert.deepEqual(period('2026-01', '2026-08-09').prev, {
    from: '2025-01-01',
    to: '2025-01-31',
    label: 'last year',
  });
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

test('the account filter is the third axis, and works either way round', () => {
  const rows = [
    txn({ id: '1', amount: -100, account: 'Brukskonto' }),
    txn({ id: '2', amount: -100, account: 'Mastercard Ung' }),
  ];
  const shown = (f: Partial<Filters>) =>
    rows.filter((t) => matchesFilters(t, { ...NO_FILTERS, ...f })).map((t) => t.id);

  assert.deepEqual(shown({ accounts: ['Mastercard Ung'] }), ['2']);
  assert.deepEqual(shown({ accounts: ['Mastercard Ung'], accountMode: 'exclude' }), ['1']);
  // A filter nobody set must never empty the page, whichever mode it is in.
  assert.deepEqual(shown({ accountMode: 'exclude' }), ['1', '2']);
  // The axes are ANDed, like the other two already are.
  assert.deepEqual(shown({ accounts: ['Brukskonto'], categories: ['reise'] }), []);
});

test('AXES names every list filter with the field holding its mode', () => {
  // The UI toggles all three through this map, so a filter missing from it is a
  // filter with no menu and no chip.
  for (const [list, mode] of Object.entries(AXES)) {
    assert.ok(Array.isArray(NO_FILTERS[list as keyof typeof AXES]), `${list} is a list`);
    assert.equal(NO_FILTERS[mode], 'include');
  }
});

test('the subcategory filter matches the pair, so one sub under two mains stays apart', () => {
  // `kollektivtransport` is a real sub under both `reise` and `bil_og_transport`.
  // A bare-sub filter would show rows from both and quietly overcount.
  const trip = txn({ id: '1', amount: -100, category: 'reise', subcategory: 'kollektivtransport' });
  const commute = txn({ id: '2', amount: -100, category: 'bil_og_transport', subcategory: 'kollektivtransport' });
  const f = { ...NO_FILTERS, subcategories: ['reise/kollektivtransport'] };
  assert.equal(matchesFilters(trip, f), true);
  assert.equal(matchesFilters(commute, f), false);
});

test('a category whose rows have no subcategory is still selectable', () => {
  // Half of rules/overrides.json still names one level, so "the part nothing has
  // named yet" has to be reachable or the drill-down shows less than its parent.
  const bare = txn({ id: '1', amount: -100, category: 'vipps', subcategory: null });
  assert.equal(matchesFilters(bare, { ...NO_FILTERS, subcategories: ['vipps/'] }), true);
  assert.equal(subcategoryOf(bare), 'vipps/');
});

test('an empty subcategory list shows every row, like every other axis', () => {
  const t = txn({ id: '1', amount: -100, category: 'reise', subcategory: 'flybilletter' });
  assert.equal(matchesFilters(t, NO_FILTERS), true);
  assert.equal(matchesFilters(t, { ...NO_FILTERS, subcategories: ['reise/flybilletter'], subcategoryMode: 'exclude' }), false);
});

test('subcategories are an axis like the rest, so the toggle code covers them', () => {
  assert.equal(AXES.subcategories, 'subcategoryMode');
  assert.deepEqual(distinctSubcategories([
    txn({ id: '1', amount: -100, category: 'reise', subcategory: 'flybilletter' }),
    txn({ id: '2', amount: -100, category: 'vipps', subcategory: null }),
  ]), ['reise/flybilletter', 'vipps/']);
});
