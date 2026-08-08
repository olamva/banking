import { test } from 'node:test';
import assert from 'node:assert/strict';
import { categorize, loadOverrides, loadSubscriptions } from './categorize.ts';
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

test('a domestic card row without an override is uncategorized, like an sb1 one', () => {
  const [out] = categorize(
    [classified({ source: 'card', description: 'Varekjøp', counterparty: 'KAFFEBAR, OSLO, NOR', bankCategory: null })],
    {},
  );
  assert.equal(out.category, 'ukategorisert');
});

test('a card row bought abroad is travel, by the merchant country', () => {
  const cat = (counterparty: string | null) =>
    categorize([classified({ source: 'card', description: 'Varekjøp', counterparty, bankCategory: null })], {})[0]!
      .category;
  assert.equal(cat('LAWSON, TOKYO, JPN'), 'reise');
  assert.equal(cat('KAFFEBAR, OSLO, NOR'), 'ukategorisert');
  // no country at all: the issuer's own rows, which are never a trip
  assert.equal(cat('Omkostninger regningsbetaling'), 'ukategorisert');
  assert.equal(cat(null), 'ukategorisert');
  // a city that ends in three letters is not a country code
  assert.equal(cat('BAKERIET, OSLO'), 'ukategorisert');
});

test('an override beats the travel rule, so a foreign biller can be placed', () => {
  const [out] = categorize(
    [classified({ source: 'card', description: 'Varekjøp', counterparty: 'APPLE.COM/BILL, CORK, IRL', bankCategory: null })],
    { 'apple.com/bill': 'medier_og_underholdning' },
  );
  assert.equal(out.category, 'medier_og_underholdning');
});

test("the bank's catch-all collapses into ukategorisert", () => {
  const [out] = categorize([classified({ bankCategory: 'diverse' })], {});
  assert.equal(out.category, 'ukategorisert');
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

test('sb1 row with no bankCategory falls to ukategorisert', () => {
  const [out] = categorize([classified({ bankCategory: null })], {});
  assert.equal(out.category, 'ukategorisert');
});

test('loadOverrides returns {} when the file is absent', async () => {
  const result = await loadOverrides('does-not-exist.json');
  assert.deepEqual(result, {});
});

test('loadSubscriptions returns [] when the file is absent', async () => {
  assert.deepEqual(await loadSubscriptions('does-not-exist.json'), []);
});

test('a subscription pattern flags a card row the bank could never flag', () => {
  const [out] = categorize(
    [
      classified({
        source: 'card',
        description: 'Varekjøp',
        counterparty: 'GOOGLE *YouTubePremium, LONDON, GBR',
        bankCategory: null,
      }),
    ],
    { youtubepremium: 'medier_og_underholdning' },
    ['youtubepremium'],
  );
  // the point of the second axis: a category *and* the flag, not one or the other
  assert.equal(out.category, 'medier_og_underholdning');
  assert.equal(out.isSubscription, true);
});

test("a subscription pattern only adds to the bank's flag, never clears it", () => {
  const [flagged] = categorize([classified({ isSubscription: true })], {}, []);
  assert.equal(flagged.isSubscription, true);
  const [unflagged] = categorize([classified({ isSubscription: false })], {}, ['nothing-matches']);
  assert.equal(unflagged.isSubscription, false);
});

test('a subscription pattern names its own file when the regex is broken', () => {
  assert.throws(() => categorize([classified({})], {}, ['/[unclosed/']), /subscriptions\.json/);
});
