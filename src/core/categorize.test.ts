import { test } from 'node:test';
import assert from 'node:assert/strict';
import { categorize, loadOverrides } from './categorize.ts';
import type { Classified } from './types.ts';

function classified(overrides: Partial<Classified>): Classified {
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
    excluded: false,
    reason: null,
    ...overrides,
  };
}

test('falls back to bankCategory with no override', () => {
  const [out] = categorize([classified({})], {});
  assert.equal(out.category, 'dagligvarer');
});

test('override beats bankCategory, matched case-insensitively', () => {
  const [out] = categorize([classified({ description: 'VIPPS*Rema 1000' })], {
    'rema 1000': 'groceries',
  });
  assert.equal(out.category, 'groceries');
});

test('card rows without an override land in the card bucket, not ukategorisert', () => {
  const [out] = categorize(
    [classified({ source: 'card', description: 'Varekjøp', bankCategory: null })],
    {},
  );
  assert.equal(out.category, 'card spending');
});

test('an override still applies to a card row', () => {
  const [out] = categorize(
    [classified({ source: 'card', description: 'Netflix', bankCategory: null })],
    { netflix: 'subscriptions' },
  );
  assert.equal(out.category, 'subscriptions');
});

test('an override matches the merchant, which is where a card row carries it', () => {
  // The card's own description is a generic Varekjøp; the merchant only exists
  // in counterparty, filled from the issuer's statement export.
  const [out] = categorize(
    [classified({ source: 'card', description: 'Varekjøp', counterparty: 'KAFFEBAR, OSLO', bankCategory: null })],
    { kaffebar: 'kafe_og_restaurant' },
  );
  assert.equal(out.category, 'kafe_og_restaurant');
});

test('a slash-wrapped pattern is a regex, so a word can be matched as a word', () => {
  const rent = { '/\\bleie\\b/': 'faste_boutgifter' };
  const cat = (description: string) => categorize([classified({ description })], rent)[0]!.category;
  assert.equal(cat('Til: Ola - Leie Juni & Juli'), 'faste_boutgifter');
  assert.equal(cat('LEIE AUGUST'), 'faste_boutgifter');
  // the whole point: these contain "leie" but are not the word
  assert.equal(cat('UTLEIE AS'), 'dagligvarer');
  assert.equal(cat('LEIEBIL BERGEN'), 'dagligvarer');
});

test('a plain pattern stays a substring, so partial words still match', () => {
  const [out] = categorize([classified({ description: 'KAFFEBAR OSLO' })], { kaffe: 'kafe_og_restaurant' });
  assert.equal(out.category, 'kafe_og_restaurant');
});

test('an unparseable regex names itself rather than failing silently', () => {
  assert.throws(() => categorize([classified({})], { '/[unclosed/': 'x' }), /not a valid regex/);
});

test('sb1 row with no bankCategory falls to ukategorisert, not the card bucket', () => {
  const [out] = categorize([classified({ bankCategory: null })], {});
  assert.equal(out.category, 'ukategorisert');
});

test('loadOverrides returns {} when the file is absent', async () => {
  const result = await loadOverrides('does-not-exist.json');
  assert.deepEqual(result, {});
});
