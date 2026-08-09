import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { categorize, loadOverrides, loadPayees, loadPeers, loadSubscriptions, renamePayees } from './categorize.ts';
import type { Classified } from './types.ts';

/** The card, as `rules/accounts.json` names it — the travel guess sees these rows and no others. */
const CARDS = new Set(['card']);

function classified(overrides: Partial<Classified>): Classified {
  return {
    id: '1',
    account: 'Brukskonto',
    accountKey: 'a',
    date: '2026-07-01',
    amount: -100,
    description: 'Rema 1000',
    counterparty: 'Rema 1000',
    bankCategory: 'dagligvarer',
    typeText: 'VISA Varekjøp',
    remoteAccountNumber: null,
    isRecurring: false,
    isSubscription: false,
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

test('a domestic card row the bank did not classify is uncategorized', () => {
  const [out] = categorize(
    [classified({ account: 'Kredittkort', description: 'KAFFEBAR, Oslo, NORWAY', counterparty: 'KAFFEBAR, Oslo, NORWAY', bankCategory: null })],
    {},
  );
  assert.equal(out.category, 'ukategorisert');
});

test('a card row bought abroad is travel, by the merchant country', () => {
  const cat = (counterparty: string | null, bankCategory: string | null = null) =>
    categorize(
      [classified({ accountKey: 'card', description: counterparty ?? '', counterparty, bankCategory })],
      {}, [], [], {}, CARDS,
    )[0]!.category;
  assert.equal(cat('LAWSON, TOKYO, JAPAN'), 'reise');
  // The old Enable Banking wording, a three-letter code, reads the same way.
  assert.equal(cat('LAWSON, TOKYO, JPN'), 'reise');
  assert.equal(cat('KAFFEBAR, Oslo, NORWAY'), 'ukategorisert');
  assert.equal(cat('KAFFEBAR, OSLO, NOR'), 'ukategorisert');
  // A foreign terminal sometimes sends only the town. The bank writes NORWAY on
  // every domestic one, so a bare town at the end still means abroad.
  assert.equal(cat('ANISEED, MYTILINI'), 'reise');
  // No comma, so nothing that could be a place: the issuer's own rows, and
  // Norwegian payees that carry no country at all.
  assert.equal(cat('Omkostninger regningsbetaling'), 'ukategorisert');
  assert.equal(cat('DUTY-FREE GARDERMOEN'), 'ukategorisert');
  assert.equal(cat(null), 'ukategorisert');
});

test('the travel guess is card rows only — a deposit row of the same shape is not a trip', () => {
  // 23 rows of the record match this pattern without being near a trip.
  const [out] = categorize(
    [classified({ accountKey: 'a', counterparty: 'MOBILGIRO M/KID, FORF. I DAG TRANS(ER) TYPE', bankCategory: null })],
    {}, [], [], {}, CARDS,
  );
  assert.equal(out.category, 'ukategorisert');
});

test("the bank's own category beats the travel guess", () => {
  // The guess is a fallback for rows the bank shrugged at. A supermarket in
  // Vienna is groceries that happened abroad, and `Telenor Norge AS, Mobil`
  // only looks foreign — the category is what stops both being read as a trip.
  const cat = (counterparty: string, bankCategory: string) =>
    categorize(
      [classified({ accountKey: 'card', description: counterparty, counterparty, bankCategory })],
      {}, [], [], {}, CARDS,
    )[0]!.category;
  assert.equal(cat('Interspar Dankt Wien, AUSTRIA', 'dagligvarer'), 'dagligvarer');
  assert.equal(cat('Telenor Norge AS, Mobil', 'faste_boutgifter'), 'faste_utgifter');
  // …but a catch-all is no category, so those still fall through to it.
  assert.equal(cat('Centimeter am Spittel, WIEN, AUSTRIA', 'diverse'), 'reise');
});

test('an override beats the travel rule, so a foreign biller can be placed', () => {
  const [out] = categorize(
    [classified({ account: 'Kredittkort', description: 'APPLE.COM/BILL, CORK, IRELAND', counterparty: 'APPLE.COM/BILL, CORK, IRELAND', bankCategory: null })],
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
    [classified({ account: 'Kredittkort', description: 'Netflix', bankCategory: null })],
    { netflix: 'subscriptions' },
  );
  assert.equal(out.category, 'subscriptions');
});

test('an override matches the merchant, not only the raw description', () => {
  // The card's raw description carries a terminal number the cleaned one drops,
  // so a pattern written for the merchant has to reach `counterparty`.
  const [out] = categorize(
    [classified({ account: 'Kredittkort', description: '227 KAFFEBAR, Oslo, NORWAY', counterparty: 'KAFFEBAR, Oslo, NORWAY', bankCategory: null })],
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
 * The peer list is checked after rules/overrides.json, so a person who shares a
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
      { 'ola nordmann': 'husleie' },
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

/**
 * The row type says how the money moved and never why, so the category is per
 * name: a lump from a flatmate is rent, and the identical lump from a friend
 * was a share of a trip. Nothing on the row separates those two.
 */
test('a lump transfer takes the category its sender is named with, and only then', () => {
  const row = classified({
    description: 'Kari Nordmann',
    counterparty: 'Kari Nordmann',
    bankCategory: null,
    typeText: 'Giro',
    amount: 11850,
  });
  const cat = (giro: Record<string, string>, over = row) =>
    categorize([over], {}, [], ['kari nordmann'], giro)[0]!.category;

  // Unnamed, so it stays what it always was: money from a person.
  assert.equal(cat({}), 'vipps');
  assert.equal(cat({ 'kari nordmann': 'husleie' }), 'husleie');
  assert.equal(cat({ 'kari nordmann': 'reise' }), 'reise');

  // Named, but settled instantly: still the coffee, not the standing payment.
  assert.equal(cat({ 'kari nordmann': 'husleie' }, { ...row, typeText: 'Straksbetaling' }), 'vipps');

  // A name here reaches nobody else's rows.
  assert.equal(cat({ 'ola nordmann': 'husleie' }), 'vipps');
});

test('loadSubscriptions returns [] when the file is absent', async () => {
  assert.deepEqual(await loadSubscriptions('does-not-exist.json'), []);
});

test('a subscription pattern flags a card row the bank could never flag', () => {
  const [out] = categorize(
    [
      classified({
        account: 'Kredittkort',
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

/**
 * One payee, two things billed under one name. SiT sends rent and the gym as
 * `Sit` with the same type and the same bank category — the account number they
 * are billed from is the only field that differs, so it is in the haystack.
 */
test('the payee account number is matchable, so one name can bill two things', () => {
  const sit = (remoteAccountNumber: string, amount: number) =>
    classified({ description: 'Sit', counterparty: 'Sit', bankCategory: null, remoteAccountNumber, amount });
  const rules = { '42121144527': 'helse_og_velvaere', '/\\bsit\\b/': 'husleie' };

  assert.equal(categorize([sit('42121144527', -185)], rules)[0]!.category, 'helse_og_velvaere');
  assert.equal(categorize([sit('42004151326', -10416)], rules)[0]!.category, 'husleie');
  // No account number at all still falls through to the name.
  assert.equal(categorize([sit('', -3819)], rules)[0]!.category, 'husleie');
});

/**
 * A landlord who writes the month into every payment is eleven payees to
 * anything counting by name, which listed one standing rent eleven times.
 */
test('renamePayees collapses a payee that writes the month into every payment', () => {
  const row = (description: string, remoteAccountNumber: string | null = null) => ({
    description,
    counterparty: description,
    remoteAccountNumber,
  });
  const rows = [
    row('SIMEN LEIE Februar Husleie'),
    row('SIMEN LEIE Mars Husleie'),
    row('Theo leie'),
    row('Theo leie Husleie Juli'),
    row('Rema 1000'),
  ];
  const renamed = renamePayees(rows, { 'simen leie': 'Simen leie', 'theo leie': 'Theo leie' });

  assert.deepEqual(renamed.map((r) => r.counterparty), [
    'Simen leie',
    'Simen leie',
    'Theo leie',
    'Theo leie',
    'Rema 1000',
  ]);
  // The month is still in the description, which is what the search box reads.
  assert.equal(renamed[0]!.description, 'SIMEN LEIE Februar Husleie');
  // No file, no work: the array comes back as it went in.
  assert.equal(renamePayees(rows, {}), rows);
});

/**
 * SB1 sends a few transfers with no name on them at all — a bare `Overføring`
 * and an account number. The account is then the only thing that says who the
 * other party was, so the payee patterns have to be able to see it.
 */
test('renamePayees names a row the bank left nameless, by account number', () => {
  const rows = [
    { description: 'Overføring', counterparty: null, remoteAccountNumber: '39910000001' },
    { description: 'Overføring', counterparty: null, remoteAccountNumber: '39910000002' },
  ];
  const renamed = renamePayees(rows, { '39910000001': 'Ola Nordmann' });

  assert.deepEqual(renamed.map((r) => r.counterparty), ['Ola Nordmann', null]);
});

test('loadPayees returns {} when the file is absent', async () => {
  assert.deepEqual(await loadPayees('does-not-exist.json'), {});
});
