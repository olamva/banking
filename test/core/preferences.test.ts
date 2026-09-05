import assert from "node:assert/strict";
import { test } from "node:test";
import {
  preferenceKey,
  readPreference,
  reviewGroups,
} from "../../src/core/preferences.ts";
import { categorize, renamePayees } from "../../src/core/categorize.ts";
import { compile, haystackOf } from "../../src/core/match.ts";
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

test("remembered categories use original identity and preserve exclusions", () => {
  const key = preferenceKey(row)!;
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
  assert.equal(preferenceKey(renamed[0]!), key);
  const out = categorize(
    renamed,
    { "raw shop": "old" },
    [],
    {},
    new Set(),
    [],
    [],
    { [key]: "home/furniture" },
  );
  assert.deepEqual(
    out.map((t) => t.category),
    ["home", "home", "old", "old", "old", "food", "overfoering"],
  );
  assert.equal(out[0]!.categorySource, "Remembered category");
  assert.equal(out[0]!.subcategory, "furniture");
  assert.deepEqual(
    out.map((t) => [t.amount, t.excluded, t.reason]),
    rows.map((t) => [t.amount, t.excluded, t.reason]),
  );
});

test("preferences reject incomplete and noncanonical identities", () => {
  for (const key of [
    "[]",
    "{}",
    "null",
    '["shop","card",0,""]',
    '["shop","",-1,""]',
    '["SHOP","card",-1,""]',
    '["shop","card",-1,"",123]',
  ])
    assert.throws(() => readPreference(key));
  assert.equal(preferenceKey({ ...row, counterparty: null }), null);
  assert.equal(preferenceKey({ ...row, typeText: null }), null);
  assert.equal(preferenceKey({ ...row, amount: 0 }), null);
  assert.equal(
    preferenceKey({
      ...row,
      originalCounterparty: "",
      counterparty: "Named by rule",
    }),
    null,
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

test("review groups include only eligible unconfirmed identities", () => {
  const rows = categorize(
    [
      row,
      { ...row, id: "later", date: "2026-09-02" },
      { ...row, typeText: "Giro" },
      { ...row, excluded: true },
    ],
    {},
  );
  const groups = reviewGroups(rows, {});
  assert.equal(groups.length, 2);
  assert.equal(groups[0]!.length, 2);
  assert.equal(groups[0]![0]!.id, "later");
  assert.equal(reviewGroups(rows, { [preferenceKey(row)!]: "food" }).length, 1);
  assert.equal(reviewGroups(categorize([row], { shop: "food" }), {}).length, 0);
});
