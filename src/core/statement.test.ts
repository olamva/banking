import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseStatement, enrich, statementRange } from './statement.ts';
import type { Txn } from './types.ts';

function card(partial: Partial<Txn> & { id: string; amount: number }): Txn {
  return {
    source: 'card',
    accountKey: 'card',
    date: '2026-07-15',
    description: 'Varekjøp',
    counterparty: null,
    bankCategory: null,
    typeText: null,
    remoteAccountNumber: null,
    isRecurring: false,
    isSubscription: false,
    isPending: false,
    ...partial,
  };
}

const CSV =
  '"Kjøpsdato";"Posteringsdato";"Beskrivelse";"Beløp";"Kortholders fornavn"\n' +
  '"2026-07-14";"2026-07-15";"KAFFEBAR, OSLO";"-109,90";"FORNAVN"\n' +
  '"2026-07-14";"2026-07-15";"Innbetaling";"5738,00";"FORNAVN"\n';

test('parses the semicolon export, Norwegian decimals and the booking date', () => {
  const rows = parseStatement(CSV);
  assert.equal(rows.length, 2);
  // Posteringsdato, not Kjøpsdato — Txn commits to the booking date.
  assert.deepEqual(rows[0], { date: '2026-07-15', amount: -109.9, merchant: 'KAFFEBAR, OSLO' });
  assert.equal(rows[1]!.amount, 5738);
});

test('strips the BOM the export ships with', () => {
  assert.equal(parseStatement('﻿' + CSV).length, 2);
});

test('fills the merchant on card rows, matching booking date and amount', () => {
  const out = enrich([card({ id: '1', amount: -109.9 })], parseStatement(CSV));
  assert.equal(out[0]!.counterparty, 'KAFFEBAR, OSLO');
});

test('leaves description alone, so the exclusion rules still see the source wording', () => {
  const out = enrich([card({ id: '1', amount: 5738, description: 'Innbetalinger' })], parseStatement(CSV));
  assert.equal(out[0]!.description, 'Innbetalinger');
  assert.equal(out[0]!.counterparty, 'Innbetaling');
});

test('never touches SB1 rows, which have a counterparty of their own', () => {
  const sb1: Txn = { ...card({ id: '1', amount: -109.9 }), source: 'sb1', counterparty: 'Rema' };
  assert.equal(enrich([sb1], parseStatement(CSV))[0]!.counterparty, 'Rema');
});

test('a card row with no statement line keeps its null merchant', () => {
  const out = enrich([card({ id: '1', amount: -1 })], parseStatement(CSV));
  assert.equal(out[0]!.counterparty, null);
});

test('statementRange spans the booking dates, which names the stored file', () => {
  const rows = parseStatement(
    '"a";"b";"c";"d";"e"\n' +
      '"2026-07-14";"2026-07-15";"X";"-1,00";"F"\n' +
      '"2026-02-26";"2026-02-27";"Y";"-1,00";"F"\n',
  );
  assert.deepEqual(statementRange(rows), { from: '2026-02-27', to: '2026-07-15' });
});

test('same date and amount: each row takes a distinct line, totals unaffected either way', () => {
  const csv =
    '"a";"b";"c";"d";"e"\n' +
    '"2026-07-14";"2026-07-15";"SHOP A";"-50,00";"F"\n' +
    '"2026-07-14";"2026-07-15";"SHOP B";"-50,00";"F"\n';
  const out = enrich([card({ id: '1', amount: -50 }), card({ id: '2', amount: -50 })], parseStatement(csv));
  assert.deepEqual(out.map((t) => t.counterparty).sort(), ['SHOP A', 'SHOP B']);
});
