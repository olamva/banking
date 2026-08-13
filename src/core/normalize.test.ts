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
          description: 'raw desc', cleanedDescription: 'Clean Desc', typeText: 'VISA Varekjøp',
        },
        categories: [{ main: 'dagligvarer' }],
        recurring: false,
        subscription: false,
      }],
    },
  }, (dir) => {
    const [txn] = normalizeMonth(dir);
    assert.equal(txn.date, '2026-07-01');
    assert.equal(txn.account, 'acct');
    assert.equal(txn.counterparty, 'Clean Desc');
    assert.equal(txn.bankCategory, 'dagligvarer');
    // Carried through verbatim: `exclude` reads it to tell a transfer from a
    // purchase that merely matches one, so dropping it here would silently
    // turn every coincidence back into an internal transfer.
    assert.equal(txn.typeText, 'VISA Varekjøp');
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

test('an account is named by rules/accounts.json, and by its key when it is not', () => {
  // Same file shape as any other account — the card is an SB1 account like the
  // rest, and the rules file is the only thing that gives any of them a name.
  withMonthDir({
    'card-key.json': {
      transactions: [{
        transaction: {
          id: 'card-1', accountKey: 'card-key', amount: -250,
          date: Date.UTC(2026, 6, 14, 22, 0, 0),
          description: '227 SHOP, Oslo, NORWAY', cleanedDescription: 'SHOP, Oslo, NORWAY',
          typeText: 'Transaksjon', bookingStatus: 'BOOKED',
          // The card sends this placeholder where there is no other party. It
          // must not reach the override haystack looking like an account.
          remoteAccountNumber: '-1',
        },
        categories: [{ main: 'dagligvarer' }],
        recurring: false,
        subscription: false,
      }],
    },
  }, (dir) => {
    const [txn] = normalizeMonth(dir, { 'card-key': 'Kredittkort' });
    assert.equal(txn.account, 'Kredittkort');
    assert.equal(txn.accountKey, 'card-key');
    assert.equal(txn.date, '2026-07-15');
    assert.equal(txn.amount, -250);
    assert.equal(txn.counterparty, 'SHOP, Oslo, NORWAY');
    assert.equal(txn.bankCategory, 'dagligvarer');
    assert.equal(txn.typeText, 'Transaksjon');
    assert.equal(txn.remoteAccountNumber, null);
    // An account the rules file has not named falls back to its key, so a row
    // is never nameless on the page.
    assert.equal(normalizeMonth(dir)[0].account, 'card-key');
  });
});

test('pending rows are dropped, whichever account they are on', () => {
  // A reservation is reissued under a new id once it books, and its amount can
  // still move. Only booked rows go in the store, which is what makes a
  // re-synced month idempotent.
  withMonthDir({
    'acct.json': {
      transactions: [
        {
          transaction: {
            id: 'booked', accountKey: 'acct', amount: -66,
            date: Date.UTC(2026, 7, 6, 22, 0, 0), description: 'd', bookingStatus: 'BOOKED',
          },
          categories: [], recurring: false, subscription: false,
        },
        {
          transaction: {
            id: 'pending', accountKey: 'acct', amount: -119,
            date: Date.UTC(2026, 7, 8, 22, 0, 0), description: 'd', bookingStatus: 'PENDING',
          },
          categories: [], recurring: false, subscription: false,
        },
      ],
    },
  }, (dir) => {
    assert.deepEqual(normalizeMonth(dir).map((t) => t.id), ['booked']);
  });
});

test('a month directory flattens every account file it holds', () => {
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
    'card-key.json': {
      transactions: [{
        transaction: {
          id: 'card-1', accountKey: 'card-key', amount: -10,
          date: Date.UTC(2026, 6, 10, 22, 0, 0), description: 'SHOP, Oslo, NORWAY',
        },
        categories: [{ main: 'dagligvarer' }],
        recurring: false,
        subscription: false,
      }],
    },
  }, (dir) => {
    const names = { acct: 'Brukskonto', 'card-key': 'Kredittkort' };
    const txns = normalizeMonth(dir, names).sort((a, b) => a.account.localeCompare(b.account));
    assert.deepEqual(txns.map((t) => t.account), ['Brukskonto', 'Kredittkort']);
    const bank = txns.find((t) => t.account === 'Brukskonto')!;
    assert.equal(bank.isRecurring, true);
    assert.equal(bank.isSubscription, true);
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

test('the bank subcategory and both i18n names come through, with the confidence', () => {
  withMonthDir({
    'acct.json': {
      transactions: [{
        transaction: {
          id: 'sb1-1', accountKey: 'acct', amount: -249, date: Date.UTC(2026, 5, 30, 22, 0, 0),
          cleanedDescription: 'Apotek 1', typeText: 'VISA Varekjøp',
        },
        // More than one candidate, sorted by confidence down — 441 rows on
        // record look like this. The first is the bank's answer; the rest are
        // the runners-up and are dropped.
        categories: [
          { confidence: 100, main: 'helse_og_velvaere', mainI18n: 'Helse og velvære', sub: 'apotek', subI18n: 'Apotek' },
          { confidence: 41, main: 'ukategorisert', mainI18n: 'Ukategorisert', sub: 'annet', subI18n: 'Ukategorisert' },
        ],
        recurring: false,
        subscription: false,
      }],
    },
  }, (dir) => {
    const [txn] = normalizeMonth(dir);
    assert.equal(txn!.bankCategory, 'helse_og_velvaere');
    assert.equal(txn!.bankSub, 'apotek');
    assert.equal(txn!.bankCategoryName, 'Helse og velvære');
    assert.equal(txn!.bankSubName, 'Apotek');
    assert.equal(txn!.bankConfidence, 100);
  });
});

test('a category with no sub reads as no sub, rather than crashing the rebuild', () => {
  withMonthDir({
    'acct.json': {
      transactions: [{
        transaction: {
          id: 'sb1-1', accountKey: 'acct', amount: -100, date: Date.UTC(2026, 5, 30, 22, 0, 0),
          cleanedDescription: 'Something', typeText: 'VISA Varekjøp',
        },
        // Every row on record carries all four, but the bank has never promised
        // them and one missing key must not take four thousand rows with it.
        categories: [{ main: 'dagligvarer' }],
        recurring: false,
        subscription: false,
      }],
    },
  }, (dir) => {
    const [txn] = normalizeMonth(dir);
    assert.equal(txn!.bankCategory, 'dagligvarer');
    assert.equal(txn!.bankSub, null);
    assert.equal(txn!.bankCategoryName, null);
    assert.equal(txn!.bankSubName, null);
    assert.equal(txn!.bankConfidence, null);
  });
});
