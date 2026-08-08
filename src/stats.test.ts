import { test } from 'node:test';
import assert from 'node:assert/strict';
import { monthStats, yearStats } from './stats.ts';
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
