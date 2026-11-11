import assert from "node:assert/strict";
import { test } from "node:test";
import { categorize, renamePayees } from "../../src/core/categorize.ts";
import {
  compile,
  haystackOf,
  readRule,
  ruleKey,
} from "../../src/core/match.ts";
import { overlaps, narrowings } from "../../src/core/narrowings.ts";
import type { Classified } from "../../src/core/types.ts";

const row: Classified = {
  id: "one",
  accountKey: "daily",
  account: "Daily",
  date: "2026-09-01",
  amount: -100,
  description: "Card purchase",
  counterparty: "RAW SHOP",
  country: null,
  bankCategory: "food",
  bankSub: "groceries",
  bankCategoryName: null,
  bankSubName: null,
  bankConfidence: 100,
  remoteAccountNumber: "recipient-a",
  typeText: "Card",
  isPending: false,
  isRecurring: false,
  isSubscription: false,
  excluded: false,
  reason: null,
};

test("a rule with more conditions beats a plain pattern in any line order and keeps exclusions", () => {
  const narrow = ruleKey({
    pattern: "raw shop",
    type: "card",
    direction: "out",
    account: "recipient-a",
  });
  const rows = [
    row,
    { ...row, id: "booked-again", date: "2026-10-01", amount: -250 },
    { ...row, amount: 100 },
    { ...row, typeText: "Giro" },
    { ...row, remoteAccountNumber: "recipient-b" },
    { ...row, counterparty: "OTHER SHOP" },
    { ...row, excluded: true, reason: "internal transfer" },
  ];
  const renamed = renamePayees(rows, { "raw shop": "Display name" });
  for (const categories of [
    { "raw shop": "old", [narrow]: "home/furniture" },
    { [narrow]: "home/furniture", "raw shop": "old" },
  ]) {
    const out = categorize(renamed, categories);
    assert.deepEqual(
      out.map((t) => t.category),
      ["home", "home", "old", "old", "old", "food", "overfoering"],
    );
    assert.equal(out[0]!.categorySource, "Category rule");
    assert.equal(out[0]!.subcategory, "furniture");
    assert.deepEqual(
      out.map((t) => [t.amount, t.excluded, t.reason]),
      rows.map((t) => [t.amount, t.excluded, t.reason]),
    );
  }
});

test("rules reject malformed and noncanonical conditions", () => {
  for (const key of [
    "{}",
    '{"pattern":"shop"}',
    '{"pattern":"","type":"card"}',
    '{"pattern":"shop","direction":"sideways"}',
    '{"pattern":"shop","colour":"red"}',
    '{"type":"card","pattern":"shop"}',
    '{"pattern":"shop","account":1}',
    "{not json",
  ])
    assert.throws(() => readRule(key, "test"), /not a valid rule/);
  assert.deepEqual(readRule("shop", "test"), { pattern: "shop" });
  assert.equal(ruleKey({ pattern: "shop" }), "shop");
});

test("only rules with the same number of conditions conflict", () => {
  const rows = categorize([row], {});
  const narrow = ruleKey({ pattern: "shop", direction: "out" });
  assert.deepEqual(
    overlaps(rows, { "raw shop": "food", [narrow]: "home" }),
    [],
  );
  assert.equal(
    overlaps(rows, {
      [narrow]: "home",
      [ruleKey({ pattern: "raw", type: "card" })]: "food",
    }).length,
    1,
  );
});

test("renaming preserves the exact preview input, including an absent original payee", () => {
  for (const original of [row, { ...row, counterparty: null }]) {
    const renamed = renamePayees([original], {
      purchase: "Invented display name",
    })[0]!;
    assert.equal(haystackOf(renamed), haystackOf(original));
    assert.equal(compile("invented", "test")(haystackOf(renamed)), false);
    assert.equal(
      compile("raw shop", "test")(haystackOf(renamed)),
      original.counterparty !== null,
    );
    assert.equal(
      renamePayees([renamed], { purchase: "Second name" })[0]!
        .originalCounterparty,
      original.counterparty ?? "",
    );
  }
});

test("collision reports retain differing subcategories and payee names", () => {
  const rows = categorize([row], {});
  const categories = { "raw shop": "food/groceries", shop: "food/dining" };
  assert.equal(overlaps(rows, categories)[0]!.harmless, false);
  assert.equal(narrowings(rows, categories).length, 1);
  assert.equal(
    overlaps(rows, { "raw shop": "food/groceries", shop: "food/groceries" })[0]!
      .harmless,
    true,
  );
  assert.equal(
    overlaps(
      [{ ...rows[0]!, excluded: true }],
      { "raw shop": "Known name", shop: "Other name" },
      true,
    ).length,
    1,
  );
});

test("stateful regex flags do not alternate rule matches", () => {
  const match = compile("/shop/g", "test");
  assert.deepEqual(
    [match("shop"), match("shop"), match("shop")],
    [true, true, true],
  );
});
