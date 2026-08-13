import assert from 'node:assert/strict';
import test from 'node:test';
import type { Categorized } from '../../core/types.ts';
import { fmtNOKExact, txnFields } from './format.ts';

const row: Categorized = {
  id: 'row-1',
  accountKey: 'secret-key',
  account: 'Brukskonto',
  date: '2026-07-04',
  amount: -249.5,
  description: 'a description',
  counterparty: null,
  bankCategory: 'dagligvarer',
  bankSub: 'andre_dagligvarer',
  bankCategoryName: 'Dagligvarer',
  bankSubName: 'Andre dagligvarer',
  bankConfidence: 100,
  remoteAccountNumber: null,
  typeText: 'VISA Varekjøp',
  isRecurring: false,
  isSubscription: false,
  excluded: false,
  reason: null,
  category: 'dagligvarer',
  subcategory: null,
};

test('txnFields never shows the account key', () => {
  const names = txnFields(row).map(([name]) => name);
  assert.ok(!names.includes('Account key'));
  assert.ok(!txnFields(row).some(([, value]) => value === 'secret-key'));
});

test('txnFields drops the fields the bank sent nothing for', () => {
  const names = txnFields(row).map(([name]) => name);
  assert.ok(!names.includes('Merchant'), 'a null counterparty is no row');
  assert.ok(!names.includes('Excluded because'), 'a null reason is no row');
  assert.deepEqual(
    txnFields(row).find(([name]) => name === 'Excluded'),
    ['Excluded', 'No'],
    'a false boolean is still a row',
  );
});

test('txnFields keeps the øre, unlike every summed figure', () => {
  const amount = txnFields(row).find(([name]) => name === 'Amount');
  assert.equal(amount?.[1], fmtNOKExact(-249.5));
  assert.match(amount![1], /50/);
});

test('txnFields names a field after its key when it reads as one', () => {
  const names = txnFields(row).map(([name]) => name);
  assert.ok(names.includes('Bank confidence'));
  assert.ok(names.includes('Transaction ID'), 'and after FIELD_NAMES when not');
});
