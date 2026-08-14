import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  cumulative,
  dailySeries,
  inflate,
  monthStats,
  monthlySeries,
  subsAndRecurring,
  subscriptionGroups,
  totals,
  withGaps,
  yearStats,
} from './stats.ts';
import type { SeriesPoint } from './stats.ts';
import type { Categorized } from './types.ts';

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

test('totals: in, out, net', () => {
  const txns = [
    txn({ id: '1', amount: -100.5, category: 'dagligvarer' }),
    txn({ id: '2', amount: -49.5, category: 'transport' }),
    txn({ id: '3', amount: 2000, category: 'inntekt' }),
  ];
  const stats = monthStats('2026-07', txns);
  assert.equal(stats.totalOut, 150);
  assert.equal(stats.totalIn, 2000);
  assert.equal(stats.net, 1850);
});

test('excluded rows are kept out of totals but reported', () => {
  const txns = [
    txn({ id: '1', amount: -100, category: 'dagligvarer' }),
    txn({ id: '2', amount: -500, excluded: true, reason: 'internal transfer' }),
    txn({ id: '3', amount: 500, excluded: true, reason: 'internal transfer' }),
  ];
  const stats = monthStats('2026-07', txns);
  assert.equal(stats.totalOut, 100);
  assert.deepEqual(stats.excluded, { count: 2, total: 1000 });

  // The standalone totals the range view uses must not drift from the stats
  // object: a matched pair reports the volume that moved, not zero.
  const t = totals(txns);
  assert.deepEqual(t.excluded, stats.excluded);
  assert.deepEqual([t.totalIn, t.totalOut, t.net], [stats.totalIn, stats.totalOut, stats.net]);
});

test('spending splits by account, and a nameless row is still out of topCounterparties', () => {
  const txns = [
    txn({ id: '1', amount: -100, category: 'dagligvarer', counterparty: 'Kiwi' }),
    txn({ id: '2', account: 'Kredittkort', amount: -300, category: 'kort', counterparty: null }),
    // Income and excluded rows are not spending, so neither reaches the split.
    txn({ id: '3', account: 'Kredittkort', amount: 5000, counterparty: null }),
    txn({ id: '4', amount: -9000, excluded: true, reason: 'internal transfer' }),
  ];
  const stats = monthStats('2026-07', txns);
  assert.deepEqual(stats.accounts, [
    { account: 'Kredittkort', total: 300, share: 0.75 },
    { account: 'Brukskonto', total: 100, share: 0.25 },
  ]);
  assert.equal(stats.topCounterparties.length, 1);
  assert.equal(stats.topCounterparties[0].counterparty, 'Kiwi');
});

test('category shares sum to exactly 1, not 0.9997', () => {
  const txns = [
    txn({ id: '1', amount: -1, category: 'a' }),
    txn({ id: '2', amount: -1, category: 'b' }),
    txn({ id: '3', amount: -1, category: 'c' }),
  ];
  const stats = monthStats('2026-07', txns);
  const total = stats.categories.reduce((s, c) => s + c.share, 0);
  assert.ok(Math.abs(total - 1) < 1e-9, `shares summed to ${total}`);
});

test('month-over-month delta, overall and per category', () => {
  const current = [txn({ id: '1', amount: -150, category: 'dagligvarer' })];
  const previous = [txn({ id: '2', amount: -100, category: 'dagligvarer' })];
  const stats = monthStats('2026-07', current, previous);
  assert.deepEqual(stats.delta, { totalIn: 0, totalOut: 50, net: -50 });
  const cat = stats.categoryDeltas.find((c) => c.category === 'dagligvarer');
  assert.deepEqual(cat, { category: 'dagligvarer', current: 150, previous: 100, delta: 50 });
});

test('delta is null with no previous month', () => {
  const stats = monthStats('2026-07', [txn({ id: '1', amount: -10 })]);
  assert.equal(stats.delta, null);
  assert.deepEqual(stats.categoryDeltas, []);
});

test('subscriptions and recurring rows are surfaced, excluded rows are not', () => {
  const txns = [
    txn({ id: '1', amount: -99, isSubscription: true }),
    txn({ id: '2', amount: -20, isRecurring: true }),
    txn({ id: '3', amount: -500, isSubscription: true, excluded: true, reason: 'transfer' }),
  ];
  const stats = monthStats('2026-07', txns);
  assert.equal(stats.subscriptions.length, 1);
  assert.equal(stats.subscriptions[0].id, '1');
  assert.equal(stats.recurring.length, 1);
  assert.equal(stats.recurring[0].id, '2');
});

/**
 * The page shows one list, and `recurring` and `subscription` have been
 * identical on every SB1 row so far — so without the dedup every such row
 * appears twice, and it is the amounts beside them that make that a money bug.
 */
test('subsAndRecurring merges the two lists without repeating a row', () => {
  const both = txn({ id: '1', amount: -99, isSubscription: true, isRecurring: true, date: '2026-07-20' });
  const subOnly = txn({ id: '2', amount: -20, isSubscription: true, date: '2026-07-05' });
  const recOnly = txn({ id: '3', amount: -30, isRecurring: true, date: '2026-07-10' });

  const merged = subsAndRecurring(monthStats('2026-07', [both, subOnly, recOnly]));
  assert.deepEqual(merged.map((t) => t.id), ['2', '3', '1'], 'deduplicated and sorted by date');
});

/** One id is one transaction, as in the database — the same row in both lists is still one row. */
test('subsAndRecurring keys on the id alone', () => {
  const row = txn({ id: 'x', amount: -99, isSubscription: true, isRecurring: true });
  assert.equal(subsAndRecurring(monthStats('2026-07', [row])).length, 1);
});

/**
 * The flag belongs to the payee, not to the charge. The bank marked one of
 * twelve identical monthly rent payments, so the card showed a single 6 000 kr
 * charge while the table below it listed all twelve.
 */
test('subscriptionGroups counts every row of a payee that is flagged anywhere', () => {
  const rent = (date: string, isRecurring = false) =>
    txn({ id: date, amount: -6100, counterparty: 'Theo leie', category: 'husleie', date, isRecurring });

  const [group] = subscriptionGroups([rent('2024-06-14', true), rent('2024-07-19'), rent('2024-08-15')]);
  assert.deepEqual([group!.count, group!.total, group!.last], [3, 18300, '2024-08-15']);

  // No flag anywhere on the payee, and it is not a subscription at all.
  assert.deepEqual(subscriptionGroups([rent('2024-06-14'), rent('2024-07-19')]), []);

  // Only the flagged payee is listed; an unflagged one alongside it is not.
  const groups = subscriptionGroups([
    rent('2024-06-14', true),
    txn({ id: 'x', amount: -50, counterparty: 'Rema 1000', date: '2024-06-15' }),
  ]);
  assert.deepEqual(groups.map((g) => g.name), ['Theo leie']);
});

/** An excluded row is not spending and never joins a subscription's total. */
test('subscriptionGroups ignores excluded rows', () => {
  const groups = subscriptionGroups([
    txn({ id: '1', amount: -99, counterparty: 'Spotify', isSubscription: true, date: '2026-07-01' }),
    txn({ id: '2', amount: -500, counterparty: 'Spotify', excluded: true, reason: 'transfer', date: '2026-07-02' }),
  ]);
  assert.deepEqual([groups[0]!.count, groups[0]!.total], [1, 99]);
});

/** One line per thing subscribed to, biggest first — not one per charge. */
test('subscriptionGroups sums the charges per name, newest category, latest date', () => {
  const groups = subscriptionGroups([
    txn({ id: '1', amount: -99, counterparty: 'Spotify', category: 'diverse', date: '2026-06-01', isSubscription: true }),
    txn({ id: '2', amount: -99, counterparty: 'Spotify', category: 'underholdning', date: '2026-07-01' }),
    txn({ id: '3', amount: -499, counterparty: 'Telenor', category: 'faste_utgifter', date: '2026-07-04', isSubscription: true }),
    // No counterparty, so the name is the description — the same fallback the table shows.
    txn({
      id: '4',
      account: 'Kredittkort',
      amount: -50,
      counterparty: null,
      description: 'Varekjøp',
      category: 'ukategorisert',
      date: '2026-07-09',
      isRecurring: true,
    }),
  ]);

  assert.deepEqual(groups, [
    { name: 'Telenor', category: 'faste_utgifter', count: 1, total: 499, latest: 499, last: '2026-07-04' },
    { name: 'Spotify', category: 'underholdning', count: 2, total: 198, latest: 99, last: '2026-07-01' },
    { name: 'Varekjøp', category: 'ukategorisert', count: 1, total: 50, latest: 50, last: '2026-07-09' },
  ]);
});

/**
 * What it costs now, not what it has averaged: an old price is history, and the
 * question a subscription list answers is what is still going out every month.
 */
test('subscriptionGroups prices a group at its last payment, not its average', () => {
  const [risen] = subscriptionGroups([
    txn({ id: '1', amount: -99, counterparty: 'Spotify', date: '2026-05-01', isSubscription: true }),
    txn({ id: '2', amount: -99, counterparty: 'Spotify', date: '2026-06-01' }),
    txn({ id: '3', amount: -129, counterparty: 'Spotify', date: '2026-07-01' }),
  ]);
  assert.deepEqual([risen!.latest, risen!.total], [129, 327]);

  // Everything on the last date is one payment: split over two rows it is one
  // price, and a same-day refund comes off it.
  const [split] = subscriptionGroups([
    txn({ id: '1', amount: -60, counterparty: 'Storage', date: '2026-07-01', isSubscription: true }),
    txn({ id: '2', amount: -40, counterparty: 'Storage', date: '2026-07-01' }),
    txn({ id: '3', amount: 10, counterparty: 'Storage', date: '2026-07-01' }),
  ]);
  assert.deepEqual([split!.latest, split!.total], [90, 90]);

  // Rows do not arrive sorted, so the latest must win whichever way round they come.
  const [reversed] = subscriptionGroups([
    txn({ id: '1', amount: -129, counterparty: 'Spotify', date: '2026-07-01', isSubscription: true }),
    txn({ id: '2', amount: -99, counterparty: 'Spotify', date: '2026-05-01' }),
  ]);
  assert.equal(reversed!.latest, 129);
});

/** A refund is money back off the same subscription, not a separate line of income. */
test('subscriptionGroups nets a refund off its own group', () => {
  const groups = subscriptionGroups([
    txn({ id: '1', amount: -300, counterparty: 'HelloFresh', date: '2026-07-01', isSubscription: true }),
    txn({ id: '2', amount: 100, counterparty: 'HelloFresh', date: '2026-07-05' }),
  ]);
  assert.deepEqual(groups, [
    { name: 'HelloFresh', category: 'dagligvarer', count: 2, total: 200, latest: -100, last: '2026-07-05' },
  ]);
});

/**
 * A month with no data is a hole, not a value and not a zero. Closing it draws
 * a line from May straight to August that reads as a real trend across months
 * nobody has any record of.
 */
test('withGaps keeps every calendar month between the first and the last', () => {
  const m = (at: string): SeriesPoint => ({ at, totalIn: 0, totalOut: 0 });

  const gapped = withGaps([m('2025-05'), m('2025-08')]);
  assert.deepEqual(gapped.map((x) => x?.at ?? null), ['2025-05', null, null, '2025-08']);

  // Across a year boundary, where naive month arithmetic goes wrong.
  assert.deepEqual(
    withGaps([m('2024-11'), m('2025-02')]).map((x) => x?.at ?? null),
    ['2024-11', null, null, '2025-02'],
  );

  // No gaps means the series comes back untouched, and one month stays one month.
  assert.deepEqual(withGaps([m('2026-01'), m('2026-02')]).map((x) => x?.at), ['2026-01', '2026-02']);
  assert.equal(withGaps([m('2026-01')]).length, 1);
  assert.deepEqual(withGaps([]), []);

  // Order-independent: the span is read off the extremes, never walked from [0].
  assert.deepEqual(
    withGaps([m('2025-08'), m('2025-05')]).map((x) => x?.at ?? null),
    ['2025-05', null, null, '2025-08'],
  );
});

/**
 * The daily series is the opposite of the monthly one: it must invent the days
 * nobody spent anything on, because those are real days and not holes in the
 * record. A chart that skips them draws a week as four points and slopes
 * through the weekend.
 */
test('dailySeries covers the whole range, spending or not', () => {
  const series = dailySeries(
    [txn({ id: '1', amount: -100, date: '2026-07-02' }), txn({ id: '2', amount: 500, date: '2026-07-04' })],
    '2026-07-01',
    '2026-07-05',
  );
  assert.deepEqual(
    series.map((p) => [p.at, p.totalOut, p.totalIn]),
    [
      ['2026-07-01', 0, 0],
      ['2026-07-02', 100, 0],
      ['2026-07-03', 0, 0],
      ['2026-07-04', 0, 500],
      ['2026-07-05', 0, 0],
    ],
  );
});

/**
 * `period()` hands out `YYYY-MM-31` as a month's upper bound — no calendar has
 * a 31st of February, and a walk that trusted it as a date would run three days
 * into March and label them as February.
 */
test('dailySeries stops on the real last day of a month, not the -31 bound', () => {
  const feb = dailySeries([], '2026-02-01', '2026-02-31');
  assert.equal(feb.length, 28);
  assert.equal(feb.at(-1)?.at, '2026-02-28');

  // A leap February is 29 days, from the same bound.
  assert.equal(dailySeries([], '2024-02-01', '2024-02-31').length, 29);

  // Month and year ends, where the walk has to carry.
  assert.equal(dailySeries([], '2025-12-30', '2026-01-02').length, 4);
  assert.deepEqual(dailySeries([], '2026-07-02', '2026-07-01'), []);
});

test('dailySeries skips excluded rows', () => {
  const [day] = dailySeries(
    [
      txn({ id: '1', amount: -100, date: '2026-07-01', account: 'Kredittkort' }),
      txn({ id: '2', amount: -50, date: '2026-07-01' }),
      txn({ id: '3', amount: -9000, date: '2026-07-01', excluded: true, reason: 'internal transfer' }),
    ],
    '2026-07-01',
    '2026-07-01',
  );
  assert.equal(day?.totalOut, 150);
});

test('cumulative runs the totals forward and never loses a øre over a long series', () => {
  const running = cumulative([
    { at: '2026-07-01', totalIn: 0, totalOut: 100.1 },
    { at: '2026-07-02', totalIn: 2000, totalOut: 0 },
    { at: '2026-07-03', totalIn: 0, totalOut: 50.2 },
  ]);
  assert.deepEqual(
    running.map((p) => [p.at, p.totalOut, p.totalIn]),
    [
      ['2026-07-01', 100.1, 0],
      ['2026-07-02', 100.1, 2000],
      ['2026-07-03', 150.3, 2000],
    ],
  );

  // Summed in cents: a year of adding 0.1 as a float lands on 36.49999999999
  // and reads as a øre short on the tile beside it.
  const tenth = Array.from({ length: 365 }, (_, i) => ({
    at: `d${i}`,
    totalIn: 0,
    totalOut: 0.1,
    cardOut: 0,
  }));
  assert.equal(cumulative(tenth).at(-1)?.totalOut, 36.5);

  assert.deepEqual(cumulative([]), []);
});

/** The last point of a running series is the period's own total, or the chart and the tile above it disagree. */
test('a cumulative series ends on the same numbers as totals()', () => {
  const txns = [
    txn({ id: '1', amount: -100.5, date: '2026-07-01' }),
    txn({ id: '2', amount: -49.5, date: '2026-07-03' }),
    txn({ id: '3', amount: 2000, date: '2026-07-04' }),
    txn({ id: '4', amount: -900, date: '2026-07-31', excluded: true, reason: 'internal transfer' }),
  ];
  const sums = totals(txns);
  const last = cumulative(dailySeries(txns, '2026-07-01', '2026-07-31')).at(-1);
  assert.equal(last?.totalOut, sums.totalOut);
  assert.equal(last?.totalIn, sums.totalIn);

  // And by the other bucket too — the two series are the same money grouped differently.
  assert.equal(cumulative(monthlySeries(txns)).at(-1)?.totalOut, sums.totalOut);
});

test('yearStats builds a monthly series and per-category totals across the year', () => {
  const months = [
    {
      month: '2026-06',
      txns: [txn({ id: '1', amount: -100, category: 'dagligvarer', date: '2026-06-10' })],
    },
    {
      month: '2026-07',
      txns: [
        txn({ id: '2', amount: -200, category: 'dagligvarer', date: '2026-07-10' }),
        txn({ id: '3', account: 'Kredittkort', amount: -100, category: 'kort', counterparty: null, date: '2026-07-11' }),
      ],
    },
  ];
  const stats = yearStats('2026', months);
  assert.deepEqual(
    stats.months.map((m) => m.month),
    ['2026-06', '2026-07'],
  );
  const dagligvarer = stats.categories.find((c) => c.category === 'dagligvarer');
  assert.equal(dagligvarer?.total, 300);
  assert.equal(stats.averageMonth.totalOut, 200);
});

test('subcategories share within their own parent, not across the page', () => {
  const s = monthStats('2026-07', [
    txn({ id: '1', amount: -300, category: 'kafe_og_restaurant', subcategory: 'fastfood' }),
    txn({ id: '2', amount: -100, category: 'kafe_og_restaurant', subcategory: 'kafe' }),
    txn({ id: '3', amount: -600, category: 'dagligvarer', subcategory: 'dagligvarer' }),
  ]);
  // The top level is untouched: still shares of everything, still summing to 1.
  assert.equal(s.categories.reduce((n, c) => n + c.share, 0), 1);

  const eating = s.subcategories.filter((x) => x.category === 'kafe_og_restaurant');
  assert.deepEqual(
    eating.map((x) => [x.subcategory, x.total, x.share]),
    [
      ['fastfood', 300, 0.75],
      ['kafe', 100, 0.25],
    ],
  );
  // Each parent sums to 1 on its own — that is what makes a drill-down readable.
  assert.equal(s.subcategories.filter((x) => x.category === 'dagligvarer')[0]!.share, 1);
});

test('a row with no subcategory is a slice of its parent, not a missing one', () => {
  // Money must not vanish between the two levels while the rules are half
  // migrated and plenty of values are still bare.
  const s = monthStats('2026-07', [
    txn({ id: '1', amount: -100, category: 'vipps', subcategory: null }),
    txn({ id: '2', amount: -300, category: 'vipps', subcategory: null }),
  ]);
  assert.deepEqual(s.subcategories, [{ category: 'vipps', subcategory: null, total: 400, share: 1 }]);
  assert.equal(
    s.subcategories.reduce((n, x) => n + x.total, 0),
    s.categories.reduce((n, c) => n + c.total, 0),
  );
});

test('income and excluded rows stay out of the subcategory totals, as they do the categories', () => {
  const s = monthStats('2026-07', [
    txn({ id: '1', amount: -100, category: 'dagligvarer', subcategory: 'dagligvarer' }),
    txn({ id: '2', amount: 5000, category: 'innskudd', subcategory: 'lonn' }),
    txn({ id: '3', amount: -900, category: 'overfoering', subcategory: null, excluded: true, reason: 'internal transfer' }),
  ]);
  assert.deepEqual(s.subcategories, [
    { category: 'dagligvarer', subcategory: 'dagligvarer', total: 100, share: 1 },
  ]);
});

test('inflate restates the comparison window, and leaves the rows it was given alone', () => {
  const rows = [
    txn({ id: '1', amount: -1000, date: '2025-07-04' }),
    txn({ id: '2', amount: 5000, date: '2025-07-20', category: 'innskudd' }),
  ];
  // From the rows' own year into the year in view — the second key is the year
  // being compared *into*, never the year the rows are from.
  const adjusted = inflate(rows, '2025', '2026');
  assert.equal(adjusted[0]!.amount, -1030);
  assert.equal(adjusted[1]!.amount, 5150);

  // A copy, and only the amount moves: the caller still holds the real figures,
  // and the comparison line still plots where the money was actually spent.
  assert.equal(rows[0]!.amount, -1000);
  assert.equal(adjusted[0]!.date, '2025-07-04');

  // A year the table does not name takes the flat fallback, never zero.
  assert.equal(inflate([txn({ id: '3', amount: -200 })], '1998', '1999')[0]!.amount, -206);
});

/**
 * The year picker can put the comparison three years back, and three years of
 * inflation is not three times one year of it — 1.031 · 1.03 · 1.03, compounded
 * year by year, against 1 + 3 × 0.03 done flat.
 */
test('inflate compounds every year between the two, and scales nothing over no years', () => {
  const rows = [txn({ id: '1', amount: -1000, date: '2023-07-04' })];
  assert.equal(inflate(rows, '2023', '2026')[0]!.amount, -1093.79);

  // A window in the year in view is not behind it, so there is nothing to
  // restate — and neither is one somehow ahead of it.
  assert.equal(inflate(rows, '2026', '2026')[0]!.amount, -1000);
  assert.equal(inflate(rows, '2026', '2023')[0]!.amount, -1000);
});

/** The whole point of the toggle: a rise smaller than inflation is a real fall. */
test('inflate feeds the deltas', () => {
  const now = [txn({ id: '1', amount: -1020, date: '2026-07-04' })];
  const before = [txn({ id: '2', amount: -1000, date: '2025-07-04' })];
  assert.equal(monthStats('2026-07', now, before).delta!.totalOut, 20);
  assert.equal(monthStats('2026-07', now, inflate(before, '2025', '2026')).delta!.totalOut, -10);
});
