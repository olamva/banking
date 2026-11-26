import assert from "node:assert/strict";
import { test } from "node:test";
import { buildLabels, NO_SUB, tidy } from "../../src/core/labels.ts";
import type { Categorized } from "../../src/core/types.ts";

function row(overrides: Partial<Categorized>): Categorized {
  return {
    id: "1",
    accountKey: "a",
    account: "Brukskonto",
    date: "2026-07-01",
    amount: -100,
    description: "x",
    counterparty: "x",
    country: null,
    bankCategory: "dagligvarer",
    bankSub: "dagligvarer",
    bankCategoryName: "Dagligvarer",
    bankSubName: "Matvarer",
    bankConfidence: 100,
    typeText: null,
    remoteAccountNumber: null,
    isPending: false,
    isRecurring: false,
    isSubscription: false,
    excluded: false,
    reason: null,
    category: "dagligvarer",
    subcategory: "dagligvarer",
    ...overrides,
  };
}

test("the bank names a pair that has no English name", () => {
  const l = buildLabels([
    row({
      bankCategory: "bolig",
      bankSub: "husleie",
      bankCategoryName: "Bolig",
      bankSubName: "Husleie",
    }),
  ]);
  assert.equal(l.category("bolig"), "Bolig");
  assert.equal(l.subcategory("bolig", "husleie"), "Husleie");
});

test("rules/labels.json wins over the bank, which is what a rename is for", () => {
  const l = buildLabels([row({})], { dagligvarer: "Mat" });
  assert.equal(l.category("dagligvarer"), "Mat");
});

test("a slug nothing names is tidied, which is already right for most of ours", () => {
  assert.equal(tidy("medlemskap_og_veldedighet"), "Medlemskap og veldedighet");
  assert.equal(tidy("faste_utgifter"), "Faste utgifter");
  const l = buildLabels([]);
  assert.equal(l.category("kontantuttak"), "Kontantuttak");
});

test("our renamed main still finds the bank name of the sub underneath it", () => {
  const l = buildLabels([
    row({
      bankCategory: "faste_boutgifter",
      bankSub: "fjernvarme",
      bankCategoryName: "Faste boutgifter",
      bankSubName: "Fjernvarme",
      category: "boutgifter",
      subcategory: "fjernvarme",
    }),
  ]);
  assert.equal(l.subcategory("boutgifter", "fjernvarme"), "Fjernvarme");
  assert.equal(l.category("boutgifter"), "Boutgifter");
});

test("a row with no second level says so rather than showing an empty cell", () => {
  assert.equal(buildLabels([]).subcategory("vipps", null), NO_SUB);
});

test("where two mains share a sub slug, the fallback takes the first on record", () => {
  const l = buildLabels([
    row({ bankCategory: "reise", bankSub: "taxi", bankSubName: "Drosje" }),
    row({ bankCategory: "transport", bankSub: "taxi", bankSubName: "Taxi" }),
  ]);
  assert.equal(l.subcategory("vaar_egen_main", "taxi"), "Drosje");
  assert.equal(l.subcategory("transport", "taxi"), "Taxi");
  assert.equal(l.subcategory("reise", "taxi"), "Drosje");
});
