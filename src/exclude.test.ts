import { test } from 'node:test';
import assert from 'node:assert/strict';
import { exclude } from './exclude.ts';
import type { Txn } from './types.ts';

function txn(overrides: Partial<Txn>): Txn {
  return {
    id: '1',
    source: 'sb1',
    accountKey: 'a',
    date: '2026-07-01',
    amount: -100,
    description: 'Rema 1000',
    counterparty: 'Rema 1000',
    bankCategory: 'dagligvarer',
    isRecurring: false,
    isSubscription: false,
    isPending: false,
    ...overrides,
  };
}

const accounts = { a: { mine: true }, b: { mine: true }, c: { mine: false } };

test('flags both sides of an internal transfer', () => {
  const out = exclude(
    [
      txn({ id: '1', accountKey: 'a', amount: -500, date: '2026-07-01' }),
      txn({ id: '2', accountKey: 'b', amount: 500, date: '2026-07-01' }),
    ],
    accounts,
  );
  assert.equal(out[0].excluded, true);
  assert.equal(out[0].reason, 'internal transfer');
  assert.equal(out[1].excluded, true);
  assert.equal(out[1].reason, 'internal transfer');
});

test('does not flag a transfer touching a non-mine account', () => {
  const out = exclude(
    [
      txn({ id: '1', accountKey: 'a', amount: -500, date: '2026-07-01' }),
      txn({ id: '2', accountKey: 'c', amount: 500, date: '2026-07-01' }),
    ],
    accounts,
  );
  assert.equal(out[0].excluded, false);
  assert.equal(out[0].reason, null);
});

test('does not flag an ordinary purchase with no counterpart', () => {
  const out = exclude([txn({ id: '1', accountKey: 'a', amount: -300 })], accounts);
  assert.equal(out[0].excluded, false);
  assert.equal(out[0].reason, null);
});

test('flags a Kredittbanken bill payment by description', () => {
  const out = exclude(
    [txn({ id: '1', accountKey: 'a', amount: -5738, description: 'Kredittbanken ASA' })],
    accounts,
  );
  assert.equal(out[0].excluded, true);
  assert.equal(out[0].reason, 'credit card bill payment');
});

test('flags the bill payment the issuer books under its other name', () => {
  const out = exclude(
    [txn({ id: '1', accountKey: 'a', amount: -2493, description: 'Kredittbanken - del av SpareBank 1' })],
    accounts,
  );
  assert.equal(out[0].excluded, true);
  assert.equal(out[0].reason, 'credit card bill payment');
});

test('both legs of a bill payment are flagged, so the pair nets to zero', () => {
  // The card credit posts days after the bank debit, so no amount+date rule
  // pairs them — each leg is caught by its own description.
  const out = exclude(
    [
      txn({ id: '1', accountKey: 'a', amount: -1629.11, date: '2026-03-31', description: 'Kredittbanken ASA' }),
      txn({ id: '2', source: 'card', accountKey: 'card', amount: 1629.11, date: '2026-04-01', description: 'Innbetalinger', counterparty: null, bankCategory: null }),
    ],
    accounts,
  );
  assert.equal(out[0].reason, 'credit card bill payment');
  assert.equal(out[1].reason, 'credit card bill payment (card side)');
  assert.equal(out.reduce((sum, t) => sum + (t.excluded ? t.amount : 0), 0), 0);
});

test('a card refund is spending returned, not a bill payment, so it stays in', () => {
  const out = exclude(
    [txn({ id: '1', source: 'card', accountKey: 'card', amount: 2395, description: 'Varekjøp', counterparty: null, bankCategory: null })],
    accounts,
  );
  assert.equal(out[0].excluded, false);
  assert.equal(out[0].reason, null);
});
