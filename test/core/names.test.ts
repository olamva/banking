import assert from "node:assert/strict";
import { test } from "node:test";
import { countryOf, makeCleaner } from "../../src/core/names.ts";

/**
 * The shapes, not the corpus. Every string here is one SB1 actually sends, but
 * the point of each case is the *form* — a card tail, a BankAxept line, a name
 * the bank already cleaned — so this keeps passing when the record changes.
 */

test("the country comes off the card's own tail, and only there", () => {
  assert.equal(countryOf("YOSHINOYA, TOKYO, JAPAN"), "Japan");
  assert.equal(countryOf("Nordisk Film Kino, +, NORWAY"), "Norway");
  assert.equal(
    countryOf("stichd sportmerchandis, 's-Hertogenbo, NETHERLANDS"),
    "Netherlands",
  );
  // One country arrives with its long form in brackets. The chip takes the name.
  assert.equal(
    countryOf("BARROCK, BA, SEDLARSKA, BRATISLAVA, SLOVAKIA (Slovak Republic)"),
    "Slovakia",
  );

  // Two segments is a city, a store code or a person — never a country. This is
  // the whole guard, so it is the case worth pinning.
  assert.equal(countryOf("GINA TRICOT STORMOA, LAN ÅLESUND"), null);
  assert.equal(countryOf("SMART STORE, S L P"), null);
  assert.equal(countryOf("Vipps, Ola Munthe Vassbotn :"), null);
  // No comma at all: BankAxept and every transfer.
  assert.equal(countryOf("REMA VOLDA INDUSTRIGATA VOLDA"), null);
  assert.equal(countryOf(""), null);
  // Three segments whose tail is a terminal reference rather than a place.
  assert.equal(countryOf("SOMETHING, ELSE, JP.HOTELS.COM"), null);
});

test("the card's city and country come off the name", () => {
  const clean = makeCleaner([]);
  assert.equal(clean("YOSHINOYA, TOKYO, JAPAN"), "Yoshinoya");
  assert.equal(clean("Gmoakeller, Wien, AUSTRIA"), "Gmoakeller");
  // The cut is at the *first* comma, so a name carrying its own commas loses
  // them too — `Suveniry, BA, F. Liszt, Bratislava, SLOVAKIA` is a souvenir
  // shop, and `Suveniry` is the part that names it.
  assert.equal(
    clean("Suveniry, BA, F. Liszt, Bratislava, SLOVAKIA (Slovak Republic)"),
    "Suveniry",
  );
});

test("mixed case is left exactly as the bank sent it", () => {
  const clean = makeCleaner([]);
  // The bank only sends mixed case where it has already cleaned the name, so
  // re-casing would only ever damage it.
  assert.equal(clean("McDonald's"), "McDonald's");
  assert.equal(clean("Joe & The Juice"), "Joe & The Juice");
  assert.equal(clean("Kaiser Kiosk Berli"), "Kaiser Kiosk Berli");
});

test("a BankAxept street and city are stripped, the shop is not", () => {
  // The corpus is what says VOLDA is a town: it ends several unrelated names.
  const corpus = [
    "REMA VOLDA INDUSTRIGATA VOLDA",
    "COOP MEGA VOLDA VOLDA",
    "SANS FRISØR AS HOLMEN 1 VOLDA",
    "VOLDA FILMTEATE STORGT. 14 VOLDA",
    "MAT FRA MIDTOESTEN",
  ];
  const clean = makeCleaner(corpus);

  assert.equal(clean("VOLDA FILMTEATE STORGT. 14 VOLDA"), "Volda Filmteate");
  // The ceiling, pinned rather than papered over: `HOLMEN` is a street the
  // corpus has never seen end another name and that no suffix rule catches, so
  // one word of address survives. The town and the house number still go, which
  // is the difference between readable and raw — and a payee this often seen has
  // a rules line naming it outright, which is where exactness lives.
  assert.equal(clean("SANS FRISØR AS HOLMEN 1 VOLDA"), "Sans Frisør AS Holmen");
  // A name with nothing but a shop in it keeps every word. `MAT` and `FRA` stay
  // shouted because the casing rule cannot tell a three-letter word from a
  // three-letter initialism — the deliberate trade that keeps `UPS` and `AS`
  // right, and the reason a payee this ugly is worth a rules line instead.
  assert.equal(clean("MAT FRA MIDTOESTEN"), "MAT FRA Midtoesten");
});

test("a word ending one name is not a place", () => {
  // `MIDTOESTEN` ends exactly one name, so it is part of that shop's name and
  // must survive. This is the difference between the corpus deciding and a
  // stoplist guessing.
  const clean = makeCleaner(["MAT FRA MIDTOESTEN", "REMA VOLDA GATA VOLDA"]);
  assert.equal(clean("MAT FRA MIDTOESTEN"), "MAT FRA Midtoesten");
});

test("stripping never eats the name", () => {
  // Every token looks like a place, and two words still come back.
  const corpus = Array.from({ length: 4 }, (_, i) => `SHOP ${i} OSLO OSLO`);
  const clean = makeCleaner([...corpus, "A OSLO", "B OSLO", "C OSLO"]);
  assert.equal(clean("OSLO OSLO OSLO"), "Oslo Oslo");
});

test("company forms and initialisms survive title case", () => {
  const clean = makeCleaner([]);
  assert.equal(clean("UPS NORWAY AS"), "UPS Norway AS");
  assert.equal(clean("THS ENGROS AS"), "THS Engros AS");
  assert.equal(clean("CFS FOUNDATION"), "CFS Foundation");
  assert.equal(clean("INATUR NORGE AS"), "Inatur Norge AS");
});
