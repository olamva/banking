import assert from "node:assert/strict";
import { test } from "node:test";
import { categoryTerms, MISS, searchRank } from "../../src/core/search.ts";

test("searchRank ignores Norwegian letters and accents", () => {
  assert.notEqual(searchRank("kjokken", "Kjøkkenutstyr"), MISS);
  assert.notEqual(searchRank("strom", "Strøm"), MISS);
  assert.notEqual(searchRank("klaer", "Klær og utstyr"), MISS);
  assert.notEqual(searchRank("cafe", "Café Løkka"), MISS);
});

test("searchRank finds a category by its English name", () => {
  const terms = categoryTerms("dagligvarer/dagligvarer");
  assert.equal(searchRank("groceries", "Dagligvarer"), MISS);
  assert.notEqual(searchRank("groceries", "Dagligvarer", terms), MISS);
  assert.notEqual(
    searchRank("salary", "Lønn", categoryTerms("innskudd/lonn")),
    MISS,
  );
});

test("searchRank finds a renamed category by its slug words", () => {
  const terms = categoryTerms("kafe_og_restaurant/linjeforening_kiosk");
  assert.equal(searchRank("linjeforening kiosk", "Linjeforeningskiosk"), MISS);
  assert.notEqual(
    searchRank("linjeforening kiosk", "Linjeforeningskiosk", terms),
    MISS,
  );
});

test("searchRank allows typos in longer words only", () => {
  assert.notEqual(searchRank("resturant", "Restaurant"), MISS);
  assert.notEqual(searchRank("kafee", "Kaffebrenneriet"), MISS);
  assert.notEqual(searchRank("rmea", "Rema 1000"), MISS);
  assert.equal(searchRank("bus", "Bas"), MISS);
  assert.equal(searchRank("kiwi", "Coop"), MISS);
});

test("searchRank needs every query word", () => {
  assert.notEqual(searchRank("rema stor", "Rema 1000 Storo"), MISS);
  assert.equal(searchRank("rema kiwi", "Rema 1000 Storo"), MISS);
});

test("searchRank ranks closer matches first", () => {
  const ranks = [
    searchRank("rema", "Rema 1000"),
    searchRank("rema", "Coop Rema"),
    searchRank("ema", "Rema 1000"),
    searchRank("food", "Dagligvarer", categoryTerms("dagligvarer")),
    searchRank("remq", "Rema 1000"),
  ];
  assert.deepEqual(ranks, ranks.toSorted());
  assert.equal(new Set(ranks).size, ranks.length);
});
