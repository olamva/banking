import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { normalizeMonth } from './normalize.ts';

function withMonthDir(files: Record<string, unknown>, run: (dir: string) => void) {
  const dir = mkdtempSync(join(tmpdir(), 'normalize-test-'));
  try {
    for (const [name, data] of Object.entries(files)) {
      writeFileSync(join(dir, name), JSON.stringify(data));
    }
    run(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test('SB1 date formats at Oslo midnight, not UTC', () => {
  // 2026-06-30T22:00:00Z is 2026-07-01 00:00 in Europe/Oslo (summer, UTC+2).
  // Formatting as UTC would wrongly put this row in June.
  const midnightOslo = Date.UTC(2026, 5, 30, 22, 0, 0);
  withMonthDir({
    'acct.json': {
      transactions: [{
        transaction: {
          id: 'sb1-1', accountKey: 'acct', amount: -100, date: midnightOslo,
          description: 'raw desc', cleanedDescription: 'Clean Desc',
        },
        categories: [{ main: 'dagligvarer' }],
        recurring: false,
        subscription: false,
      }],
    },
  }, (dir) => {
    const [txn] = normalizeMonth(dir);
    assert.equal(txn.date, '2026-07-01');
    assert.equal(txn.source, 'sb1');
    assert.equal(txn.counterparty, 'Clean Desc');
    assert.equal(txn.bankCategory, 'dagligvarer');
    assert.equal(txn.isPending, false);
  });
});

test('SB1 falls back to remoteAccountName when cleanedDescription is absent', () => {
  withMonthDir({
    'acct.json': {
      transactions: [{
        transaction: {
          id: 'sb1-1', accountKey: 'acct', amount: -6100, date: Date.UTC(2026, 5, 30, 22, 0, 0),
          typeText: 'Betaling med melding', remoteAccountName: 'Theo leie',
        },
        categories: [{ main: 'ukategorisert' }],
        recurring: false,
        subscription: false,
      }],
    },
  }, (dir) => {
    const [txn] = normalizeMonth(dir);
    // description stays the bank's own type text — the exclusion rules match on it.
    assert.equal(txn.description, 'Betaling med melding');
    assert.equal(txn.counterparty, 'Theo leie');
  });
});

test('card DBIT/CRDT sign and pending status', () => {
  withMonthDir({
    'eb-account.json': {
      account: { uid: 'card-uid' },
      transactions: [
        {
          transaction_id: 'card-1', transaction_amount: { amount: '250.00' },
          credit_debit_indicator: 'DBIT', booking_date: '2026-07-15',
          remittance_information: ['Varekjøp'], status: 'BOOK',
        },
        {
          transaction_id: 'card-2', transaction_amount: { amount: '50.00' },
          credit_debit_indicator: 'CRDT', booking_date: '2026-07-16',
          remittance_information: [], status: 'PDNG',
        },
      ],
    },
  }, (dir) => {
    const txns = normalizeMonth(dir);
    assert.equal(txns.length, 2);
    assert.equal(txns[0].source, 'card');
    assert.equal(txns[0].accountKey, 'card-uid');
    assert.equal(txns[0].date, '2026-07-15');
    assert.equal(txns[0].amount, -250);
    assert.equal(txns[0].counterparty, null);
    assert.equal(txns[0].bankCategory, null);
    assert.equal(txns[0].isPending, false);
    assert.equal(txns[1].amount, 50);
    assert.equal(txns[1].isPending, true);
  });
});

test('card rows with no booking_date yet are skipped, not dated by transaction_date', () => {
  // Enable Banking returns the same open-pending rows in every month's
  // query regardless of range; without a booking_date they can't be
  // attributed to any month, and transaction_date is explicitly off-limits.
  withMonthDir({
    'eb-account.json': {
      account: { uid: 'card-uid' },
      transactions: [{
        transaction_id: 'pending-1', transaction_amount: { amount: '99.00' },
        credit_debit_indicator: 'DBIT', booking_date: null, transaction_date: '2026-08-08',
        remittance_information: [], status: 'PDNG',
      }],
    },
  }, (dir) => {
    assert.deepEqual(normalizeMonth(dir), []);
  });
});

test('mixed month directory flattens both shapes together', () => {
  withMonthDir({
    'acct.json': {
      transactions: [{
        transaction: {
          id: 'sb1-1', accountKey: 'acct', amount: -42, date: Date.UTC(2026, 6, 10, 22, 0, 0),
          description: 'd', cleanedDescription: 'c',
        },
        categories: [{ main: 'transport' }],
        recurring: true,
        subscription: true,
      }],
    },
    'eb-card.json': {
      account: { uid: 'card-uid' },
      transactions: [{
        transaction_id: 'card-1', transaction_amount: { amount: '10.00' },
        credit_debit_indicator: 'DBIT', booking_date: '2026-07-11',
        remittance_information: ['Varekjøp'], status: 'BOOK',
      }],
    },
  }, (dir) => {
    const txns = normalizeMonth(dir).sort((a, b) => a.source.localeCompare(b.source));
    assert.deepEqual(txns.map((t) => t.source), ['card', 'sb1']);
    const sb1 = txns.find((t) => t.source === 'sb1')!;
    assert.equal(sb1.isRecurring, true);
    assert.equal(sb1.isSubscription, true);
  });
});

test('an SB1 row with no description at all falls back to typeText', () => {
  // Both description keys are simply absent on some rows. `description` must
  // stay a string: exclude() calls .includes() on it for every transaction.
  withMonthDir({
    'acct.json': {
      transactions: [{
        transaction: {
          id: 'sb1-nodesc', accountKey: 'acct', amount: -2000,
          date: Date.UTC(2024, 7, 25, 22, 0, 0), typeText: 'Overføring',
        },
        categories: [],
        recurring: false,
        subscription: false,
      }],
    },
  }, (dir) => {
    const [txn] = normalizeMonth(dir);
    assert.equal(txn.description, 'Overføring');
    assert.equal(txn.counterparty, null);
  });
});
