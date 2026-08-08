import { test } from 'node:test';
import assert from 'node:assert/strict';
import { monthStats, yearStats, blindSpot, subsAndRecurring, totals } from './stats.ts';
import type { Categorized } from './types.ts';

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
