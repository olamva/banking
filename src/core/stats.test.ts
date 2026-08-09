import { test } from 'node:test';
import assert from 'node:assert/strict';
import { monthStats, yearStats, blindSpot, subsAndRecurring, subscriptionGroups, totals } from './stats.ts';
import type { Categorized } from './types.ts';

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

test('card rows have no counterparty, are excluded from topCounterparties, and their share is surfaced', () => {
  const txns = [
    txn({ id: '1', amount: -100, category: 'dagligvarer', counterparty: 'Kiwi' }),
    txn({ id: '2', source: 'card', amount: -300, category: 'kort', counterparty: null }),
  ];
  const stats = monthStats('2026-07', txns);
  assert.equal(stats.cardShare, 0.75);
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

/** Same id on two sources is two transactions — the key is the pair, as in the database. */
test('subsAndRecurring keys on source and id together', () => {
  const bank = txn({ id: 'x', amount: -99, isSubscription: true });
  const card = txn({ id: 'x', source: 'card', amount: -99, isRecurring: true });
  assert.equal(subsAndRecurring(monthStats('2026-07', [bank, card])).length, 2);
});

/** One line per thing subscribed to, biggest first — not one per charge. */
test('subscriptionGroups sums the charges per name, newest category, latest date', () => {
  const groups = subscriptionGroups([
    txn({ id: '1', amount: -99, counterparty: 'Spotify', category: 'diverse', date: '2026-06-01' }),
    txn({ id: '2', amount: -99, counterparty: 'Spotify', category: 'underholdning', date: '2026-07-01' }),
    txn({ id: '3', amount: -499, counterparty: 'Telenor', category: 'faste_utgifter', date: '2026-07-04' }),
    // No counterparty, so the name is the description — the same fallback the table shows.
    txn({
      id: '4',
      source: 'card',
      amount: -50,
      counterparty: null,
      description: 'Varekjøp',
      category: 'ukategorisert',
      date: '2026-07-09',
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
    txn({ id: '1', amount: -99, counterparty: 'Spotify', date: '2026-05-01' }),
    txn({ id: '2', amount: -99, counterparty: 'Spotify', date: '2026-06-01' }),
    txn({ id: '3', amount: -129, counterparty: 'Spotify', date: '2026-07-01' }),
  ]);
  assert.deepEqual([risen!.latest, risen!.total], [129, 327]);

  // Everything on the last date is one payment: split over two rows it is one
  // price, and a same-day refund comes off it.
  const [split] = subscriptionGroups([
    txn({ id: '1', amount: -60, counterparty: 'Storage', date: '2026-07-01' }),
    txn({ id: '2', amount: -40, counterparty: 'Storage', date: '2026-07-01' }),
    txn({ id: '3', amount: 10, counterparty: 'Storage', date: '2026-07-01' }),
  ]);
  assert.deepEqual([split!.latest, split!.total], [90, 90]);

  // Rows do not arrive sorted, so the latest must win whichever way round they come.
  const [reversed] = subscriptionGroups([
    txn({ id: '1', amount: -129, counterparty: 'Spotify', date: '2026-07-01' }),
    txn({ id: '2', amount: -99, counterparty: 'Spotify', date: '2026-05-01' }),
  ]);
  assert.equal(reversed!.latest, 129);
});

/** A refund is money back off the same subscription, not a separate line of income. */
test('subscriptionGroups nets a refund off its own group', () => {
  const groups = subscriptionGroups([
    txn({ id: '1', amount: -300, counterparty: 'HelloFresh', date: '2026-07-01' }),
    txn({ id: '2', amount: 100, counterparty: 'HelloFresh', date: '2026-07-05' }),
  ]);
  assert.deepEqual(groups, [
    { name: 'HelloFresh', category: 'dagligvarer', count: 2, total: 200, latest: -100, last: '2026-07-05' },
  ]);
});

test('blindSpot counts only spending that still has no merchant', () => {
  const txns = [
    txn({ id: '1', source: 'card', amount: -300, counterparty: null }),
    txn({ id: '2', source: 'card', amount: -100, counterparty: 'KAFFEBAR' }),
    txn({ id: '3', amount: -50, counterparty: 'Rema' }),
    // income and excluded rows are not spending, merchant or not
    txn({ id: '4', source: 'card', amount: 900, counterparty: null }),
    txn({ id: '5', source: 'card', amount: -500, counterparty: null, excluded: true, reason: 'transfer' }),
  ];
  assert.deepEqual(blindSpot(txns), { count: 1, total: 300 });
});

test('blindSpot is empty once a statement covers every card row', () => {
  const txns = [txn({ id: '1', source: 'card', amount: -300, counterparty: 'KAFFEBAR' })];
  assert.deepEqual(blindSpot(txns), { count: 0, total: 0 });
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
        txn({ id: '3', source: 'card', amount: -100, category: 'kort', counterparty: null, date: '2026-07-11' }),
      ],
    },
  ];
  const stats = yearStats('2026', months);
  assert.deepEqual(
    stats.months.map((m) => m.month),
    ['2026-06', '2026-07'],
  );
  assert.equal(stats.months[1].cardShare, 0.3333);
  const dagligvarer = stats.categories.find((c) => c.category === 'dagligvarer');
  assert.equal(dagligvarer?.total, 300);
  assert.equal(stats.averageMonth.totalOut, 200);
});
