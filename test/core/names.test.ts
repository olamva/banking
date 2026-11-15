import assert from "node:assert/strict";
import { test } from "node:test";
import { branchFinder, countryOf, makeCleaner } from "../../src/core/names.ts";

const card = (counterparty: string, originalCounterparty: string) => ({
  counterparty,
  originalCounterparty,
  typeText: "Varer",
});

test("a card purchase names the branch that the payee name leaves out", () => {
  const rows = [
    {
      ...card("Bunnpris", "BUNNPRIS LERKEN, Trondheim, NORWAY"),
      typeText: "Kredittkort",
    },
    card("Rema 1000", "REMA ELGESETER KLÆBUVEIEN 6 TRONDHEIM"),
    card("Kiwi", "KIWI MOHOLT TRONDHEIM"),
    card("Extra", "EXTRA LILLEBY TRONDHEIM"),
  ];
  const branch = branchFinder(rows);
  assert.deepEqual(rows.map(branch), [
    "Lerken",
    "Elgeseter",
    "Moholt",
    "Lilleby",
  ]);
});

test("a branch keeps a district that many shops share", () => {
  const rows = [
    card("Rema 1000", "REMA 1000 ELGESETER, TRONDHEIM, NORWAY"),
    card("Extra", "EXTRA ELGESETER"),
    card("Samfundet", "STUDENTERSAMFUN ELGESETER"),
    card("Sesam", "SESAM ELGESETER"),
  ];
  assert.equal(branchFinder(rows)(rows[0]!), "Elgeseter");
});

test("a branch with a street added reads as the same branch", () => {
  const rows = [
    card("Bunnpris", "BUNNPRIS LERKEN, Trondheim, NORWAY"),
    card("Bunnpris", "BUNNPRIS LERKEN DYBDAHLS VEI"),
  ];
  assert.deepEqual(rows.map(branchFinder(rows)), ["Lerken", "Lerken"]);
});

test("a cut-off branch reads as the full branch name", () => {
  const rows = [
    card("Rema 1000", "REMA 1000 ELGESETE"),
    card("Rema 1000", "REMA 1000 ELGESETER, TRONDHEIM, NORWAY"),
  ];
  assert.deepEqual(rows.map(branchFinder(rows)), ["Elgeseter", "Elgeseter"]);
});

test("a cut-off branch with an extra word reads as the full branch", () => {
  const rows = [
    card("Bunnpris", "BUNNPRIS LERKEN TR"),
    card("Bunnpris", "BUNNPRIS LERKEN, Trondheim, NORWAY"),
    card("Bunnpris", "Bunnpris Lerkendal"),
  ];
  assert.deepEqual(rows.map(branchFinder(rows)), [
    "Lerkendal",
    "Lerkendal",
    "Lerkendal",
  ]);
});

test("a company form is not a branch", () => {
  const rows = [
    card("Sesam", "Sesam AS"),
    card("Sans Frisør", "SANS FRISØR AS HOLMEN, Trondheim, NORWAY"),
    card("McDonald's", "McDonalds OSLO, NORWAY"),
  ];
  assert.deepEqual(rows.map(branchFinder(rows)), [null, "Holmen", "Oslo"]);
});

test("a branch needs a card purchase and a plain place name", () => {
  const rows = [
    { ...card("Ola Nordmann", "Ola N"), typeText: "Straksbetaling" },
    card("Apple", "APPLE.COM/BILL"),
    card("Voi", "PAYPAL *VOITECHNOLO"),
    card("Naustet Grill", "NAUSTET GRILL"),
    { ...card("Kiwi", "KIWI MOHOLT"), originalCounterparty: undefined },
  ];
  const branch = branchFinder(rows);
  assert.deepEqual(rows.map(branch), [null, null, null, null, null]);
});

test("the country comes off the card's own tail, and only there", () => {
  assert.equal(countryOf("YOSHINOYA, TOKYO, JAPAN"), "Japan");
  assert.equal(countryOf("Nordisk Film Kino, +, NORWAY"), "Norway");
  assert.equal(countryOf("DOMENE AS, Oslo, NOR"), "NOR");
  assert.equal(
    countryOf("stichd sportmerchandis, 's-Hertogenbo, NETHERLANDS"),
    "Netherlands",
  );
  assert.equal(
    countryOf("BARROCK, BA, SEDLARSKA, BRATISLAVA, SLOVAKIA (Slovak Republic)"),
    "Slovakia",
  );

  assert.equal(countryOf("GINA TRICOT STORMOA, LAN ÅLESUND"), null);
  assert.equal(countryOf("SMART STORE, S L P"), null);
  assert.equal(countryOf("Vipps, Ola Nordmann :"), null);
  assert.equal(countryOf("REMA VOLDA INDUSTRIGATA VOLDA"), null);
  assert.equal(countryOf(""), null);
  assert.equal(countryOf("SOMETHING, ELSE, JP.HOTELS.COM"), null);
});

test("a NOK booking with no country in the name is Norway", () => {
  assert.equal(countryOf("REMA VOLDA INDUSTRIGATA VOLDA", "NOK"), "Norway");
  assert.equal(countryOf("CRV*Weekday Trondheim NOR", "NOK"), "Norway");
  assert.equal(countryOf("SOMETHING, ELSE, JP.HOTELS.COM", "NOK"), "Norway");
  assert.equal(countryOf("", "NOK"), "Norway");
});

test("the currency never overrides a country that the name carries", () => {
  // A foreign terminal can charge in NOK. The name is the better evidence.
  assert.equal(countryOf("PUB, DUBLIN, IRELAND", "NOK"), "Ireland");
  // The bank booked this abroad, and the name is too short to say where.
  assert.equal(countryOf("LISEBERG AB", "SEK"), null);
  assert.equal(countryOf("EPC*FORTNITE", "EUR"), null);
});

test("the card's city and country come off the name", () => {
  const clean = makeCleaner([]);
  assert.equal(clean("YOSHINOYA, TOKYO, JAPAN"), "Yoshinoya");
  assert.equal(clean("Gmoakeller, Wien, AUSTRIA"), "Gmoakeller");
  assert.equal(
    clean("Suveniry, BA, F. Liszt, Bratislava, SLOVAKIA (Slovak Republic)"),
    "Suveniry",
  );
});

test("mixed case is left exactly as the bank sent it", () => {
  const clean = makeCleaner([]);
  assert.equal(clean("McDonald's"), "McDonald's");
  assert.equal(clean("Joe & The Juice"), "Joe & The Juice");
  assert.equal(clean("Kaiser Kiosk Berli"), "Kaiser Kiosk Berli");
});

test("a BankAxept street and city are stripped, the shop is not", () => {
  const corpus = [
    "REMA VOLDA INDUSTRIGATA VOLDA",
    "COOP MEGA VOLDA VOLDA",
    "SANS FRISØR AS HOLMEN 1 VOLDA",
    "VOLDA FILMTEATE STORGT. 14 VOLDA",
    "MAT FRA MIDTOESTEN",
  ];
  const clean = makeCleaner(corpus);

  assert.equal(clean("VOLDA FILMTEATE STORGT. 14 VOLDA"), "Volda Filmteate");
  assert.equal(clean("SANS FRISØR AS HOLMEN 1 VOLDA"), "Sans Frisør AS Holmen");
  assert.equal(clean("MAT FRA MIDTOESTEN"), "MAT FRA Midtoesten");
});

test("a word ending one name is not a place", () => {
  const clean = makeCleaner(["MAT FRA MIDTOESTEN", "REMA VOLDA GATA VOLDA"]);
  assert.equal(clean("MAT FRA MIDTOESTEN"), "MAT FRA Midtoesten");
});

test("stripping never eats the name", () => {
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
