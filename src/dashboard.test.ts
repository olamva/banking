import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderDashboard, embeddedSource, matchesFilters, inMonth, inYear, prevMonth, distinctMonths } from './dashboard.ts';
import { monthStats } from './stats.ts';
import type { Categorized } from './types.ts';

// Aggregation is not tested here: the dashboard has none. It embeds stats.ts,
// which src/stats.test.ts pins. These cover selection and the page shell.

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
  assert.equal(matchesFilters(t, { category: '', source: '', search: '', minAmount: null, maxAmount: null }), true);
  assert.equal(matchesFilters(t, { category: 'transport', source: '', search: '', minAmount: null, maxAmount: null }), false);
  assert.equal(matchesFilters(t, { category: '', source: 'card', search: '', minAmount: null, maxAmount: null }), false);
  assert.equal(matchesFilters(t, { category: '', source: '', search: 'rema', minAmount: null, maxAmount: null }), true);
  assert.equal(matchesFilters(t, { category: '', source: '', search: 'kiwi', minAmount: null, maxAmount: null }), false);
  assert.equal(matchesFilters(t, { category: '', source: '', search: '', minAmount: 200, maxAmount: null }), false);
  assert.equal(matchesFilters(t, { category: '', source: '', search: '', minAmount: null, maxAmount: 100 }), false);
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

test('renderDashboard embeds the transactions as JSON and stays self-contained', () => {
  const txns = [txn({ id: '1', amount: -100.5 }), txn({ id: '2', amount: 2000, category: 'inntekt' })];
  const html = renderDashboard(txns);
  assert.ok(html.startsWith('<!doctype html>'));
  assert.ok(html.includes('"id":"1"'));
  assert.ok(html.includes('"id":"2"'));
  assert.ok(!html.includes('<script src='), 'no external script tags');
  assert.ok(!html.includes('cdn.'), 'no CDN references');
});

test('renderDashboard handles an empty transaction list without throwing', () => {
  const html = renderDashboard([]);
  assert.ok(html.includes('const TXNS = []'));
});

/**
 * The page calls stats.ts client-side, so the embedded source has to be valid
 * JS with every helper present. Type stripping blanks annotations to
 * whitespace; a missing entry in STATS_FNS is a ReferenceError only the
 * browser would see, so evaluate it here instead.
 */
test('the embedded stats source parses and computes what node computes', () => {
  const txns = [
    txn({ id: '1', amount: -100, category: 'dagligvarer' }),
    txn({ id: '2', source: 'card', amount: -300, category: 'card spending', counterparty: null }),
    txn({ id: '3', amount: 2000, category: 'inntekt' }),
  ];
  const inBrowser = new Function(
    'TXNS',
    `${embeddedSource()}
     return monthStats('2026-07', TXNS.filter(function (t) { return inMonth(t, '2026-07'); }));`,
  ) as (t: Categorized[]) => ReturnType<typeof monthStats>;
  assert.deepEqual(inBrowser(txns), monthStats('2026-07', txns));
});
