import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { categorize, loadOverrides, loadPeers, loadSubscriptions } from './categorize.ts';
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
    typeText: 'VISA Varekjøp',
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

/**
 * The excluded rows are transfers, and the toggle that lists them is the only
 * place they are ever seen — filing them under "no idea" said less than the
 * reason already on the row.
 */
test('an excluded row with nothing else to go on is a transfer, not uncategorized', () => {
  const transfer = classified({ bankCategory: null, excluded: true, reason: 'internal transfer' });
  assert.equal(categorize([transfer], {})[0]!.category, 'overfoering');

  // Only the fallback: a bank category and an override both still win.
  assert.equal(categorize([{ ...transfer, bankCategory: 'sparing' }], {})[0]!.category, 'sparing');

  // Both of the bank's catch-alls are "no category", including the one it
  // spells out on the row — otherwise a transfer keeps the bank's shrug.
  for (const bankCategory of ['diverse', 'ukategorisert']) {
    assert.equal(categorize([{ ...transfer, bankCategory }], {})[0]!.category, 'overfoering');
  }
  assert.equal(categorize([transfer], { 'rema 1000': 'groceries' })[0]!.category, 'groceries');

  // And nothing that is still counted changes.
  assert.equal(categorize([classified({ bankCategory: null })], {})[0]!.category, 'ukategorisert');
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
  assert.deepEqual(await loadOverrides('does-not-exist.json'), {});
  assert.deepEqual(await loadPeers('nor-this-one.json'), []);
});

/**
 * The peer list is checked after overrides.json, so a person who shares a
 * string with a merchant can still be placed by hand.
 */
test('an explicit override beats a name in the peer list', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'categorize-'));
  const overrides = join(dir, 'o.json');
  const peers = join(dir, 'p.json');
  await writeFile(overrides, JSON.stringify({ 'sit kafe': 'kafe_og_restaurant' }));
  await writeFile(peers, JSON.stringify(['ola nordmann', 'sit kafe']));

  const cat = (description: string) =>
    categorize([classified({ description, counterparty: null, bankCategory: null })], {
      'sit kafe': 'kafe_og_restaurant',
    }, [], ['ola nordmann', 'sit kafe'])[0]!.category;

  assert.equal(cat('SIT KAFE REALFAG'), 'kafe_og_restaurant');
  assert.equal(cat('Ola Nordmann'), 'vipps');
  assert.deepEqual(await loadOverrides(overrides), { 'sit kafe': 'kafe_og_restaurant' });
  assert.deepEqual(await loadPeers(peers), ['ola nordmann', 'sit kafe']);
});

/**
 * A flatmate is two relationships at once, and the description is the bare name
 * in both — so only the bank's own row type can tell forty coffees from the
 * standing monthly rent, and 158 000 kr of it sat under `vipps` until it did.
 */
test('a named person is a peer payment or rent, by the row type the bank gave it', () => {
  const cat = (typeText: string | null, amount = -100) =>
    categorize(
      [classified({ description: 'Ola Nordmann', counterparty: 'Ola Nordmann', bankCategory: null, typeText, amount })],
      {},
      [],
      ['ola nordmann'],
    )[0]!.category;

  // Settled instantly, or on the card: a Vipps payment.
  assert.equal(cat('Straksbetaling'), 'vipps');
  assert.equal(cat('Straksbetaling - ekstern betalingstjeneste'), 'vipps');
  assert.equal(cat('VISA Varekjøp'), 'vipps');
  assert.equal(cat(null), 'vipps');

  // Set up once and left running: rent.
  assert.equal(cat('Overførsel', 6100), 'husleie');
  assert.equal(cat('Giro', 6000), 'husleie');
  assert.equal(cat('MobilGiro m/melding til forfall i dag', 5700), 'husleie');

  // Between own accounts is the bank's wording for a family transfer, not rent.
  assert.equal(cat('Overførsel mellom egne kontoer', 4000), 'vipps');
  assert.equal(cat('Overførsel mellom egne kontoer i MobilBank, forfall i dag', 12200), 'vipps');

  // The gate only applies to a name on the list; nobody else is touched.
  assert.equal(
    categorize([classified({ description: 'Rema 1000', typeText: 'Overførsel' })], {}, [], ['ola nordmann'])[0]!
      .category,
    'dagligvarer',
  );
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

test("the bank's faste_boutgifter is renamed, and an override still wins over it", () => {
  const [renamed] = categorize([classified({ bankCategory: 'faste_boutgifter' })], {}, []);
  assert.equal(renamed.category, 'faste_utgifter');

  // Every other bank slug still passes through untouched.
  const [kept] = categorize([classified({ bankCategory: 'dagligvarer' })], {}, []);
  assert.equal(kept.category, 'dagligvarer');

  const [overridden] = categorize(
    [classified({ description: 'Telenor', bankCategory: 'faste_boutgifter' })],
    { telenor: 'medier_og_underholdning' },
    [],
  );
  assert.equal(overridden.category, 'medier_og_underholdning');
});
