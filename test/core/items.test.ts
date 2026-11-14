import assert from "node:assert/strict";
import { test } from "node:test";
import {
  itemPattern,
  itemsOf,
  purchasesOf,
  unitPrice,
  withItems,
} from "../../src/core/items.ts";
import type { Receipt, ReceiptLine } from "../../src/core/receipts.ts";
import { matchesFilters, NO_FILTERS } from "../../src/core/select.ts";
import type { Categorized } from "../../src/core/types.ts";

const line = (
  name: string,
  amount: number,
  size?: string,
  qty = 1,
): ReceiptLine => ({
  name,
  ...(size ? { size } : {}),
  qty,
  price: amount / qty,
  amount,
});

const txn = (id: string, at: string, lines: ReceiptLine[]) =>
  ({
    receipt: {
      source: "rema",
      id,
      at: Date.parse(at),
      store: "REMA 1000 Moholt",
      lines,
    } satisfies Receipt,
  }) as Categorized;

const purchases = purchasesOf([
  txn("1", "2026-09-01T10:00:00Z", [
    line("Tine Lettmelk 0.5%", 20, "1 l"),
    line("Tine Lettmelk 0.5%", 20, "1 l"),
    line("Tine Lettmelk 0.5%", 35, "1,75 l"),
    line("Pant", -2),
    line("TAST PANT UTGÅENDE SALG AV EMB", 2),
    line("Pantene Shampoo", 50, "250 ml"),
  ]),
  txn("2", "2026-09-05T22:30:00Z", [line("LETTMELK 0,5% TINE", 22, "1 l")]),
  txn("3", "2026-09-10T10:00:00Z", [
    line("Tine Lettmelk 0.5%", 21, "1 l"),
    line("Tine Lettmelk Vanilje", 31, "1 l"),
    line("Monster Ultra White Bx", 30, "500 ml"),
    line("Isbjørn Lite Glutenfri", 190, "0,5 l · 6 pk"),
  ]),
  txn("4", "2026-09-11T10:00:00Z", [
    line("MONSTER ULTRA WHITE BX", 31, "0,5 l"),
    line("MACK ISBJØRN LITE", 185, "0,5 l × 6"),
    line("Isbjørn Lite Glutenfri Boks", 32, "0,5 l"),
  ]),
  { receipt: undefined } as Categorized,
]);

const summary = (items: ReturnType<typeof itemsOf>) =>
  items
    .map((i) => [i.name, i.sizes.length, i.count, i.qty, i.spent].join(" | "))
    .sort();

test("groups the same product across case, word order and packaging words", () => {
  assert.deepEqual(summary(itemsOf(purchases)), [
    "Isbjørn Lite Glutenfri | 2 | 2 | 2 | 222",
    "Mack Isbjørn Lite | 1 | 1 | 1 | 185",
    "Monster Ultra White | 1 | 2 | 2 | 61",
    "Pantene Shampoo | 1 | 1 | 1 | 50",
    "Tine Lettmelk 0.5% | 2 | 3 | 5 | 118",
    "Tine Lettmelk Vanilje | 1 | 1 | 1 | 31",
  ]);
});

test("a rule renames exact receipt names, and other names lose packaging and shouting", () => {
  const shrunk = purchasesOf(
    [
      txn("5", "2026-10-01T10:00:00Z", [
        line("Tortillachips Ost", 30, "185 g"),
        line("Tortillas R", 20, "6 pk"),
        line("KJØTTDEIG 14% PRIMA LAVPRIS", 60, "400 g"),
      ]),
      txn("6", "2026-11-01T10:00:00Z", [
        line("Maarud Tortilla Cheese", 32, "175 g"),
        line("Maarud Tortilla Cheese Xtra", 33, "175 g"),
      ]),
    ],
    { [itemPattern("Maarud Tortilla Cheese")]: "Tortillachips Ost" },
  );
  assert.deepEqual(summary(itemsOf(shrunk)), [
    "Kjøttdeig 14% Prima Lavpris | 1 | 1 | 1 | 60",
    "Maarud Tortilla Cheese Xtra | 1 | 1 | 1 | 33",
    "Tortillachips Ost | 2 | 2 | 2 | 62",
    "Tortillas REMA 1000 | 1 | 1 | 1 | 20",
  ]);
});

test("an item takes its category from a rule, then the product group, then Uncategorized", () => {
  const group = (code: string, name: string) => ({ group: { code, name } });
  const items = itemsOf(
    purchasesOf(
      [
        txn("7", "2026-10-01T10:00:00Z", [
          { ...line("Nachochips", 30), ...group("101110", "TEX MEX: CHIPS") },
          {
            ...line("Frosne Poteter", 40),
            ...group("131510", "DYPFRYSTE POTETER (DETALJERT)"),
          },
          { ...line("Pizzabunn", 25), ...group("113311", "IKKE I BRUK") },
          { ...line("Gavekort", 100), ...group("241010", "REMA1000 GAVEKORT") },
          { ...line("Bananer", 20), ...group("161010", "BANAN") },
        ]),
        txn("8", "2026-10-02T10:00:00Z", [
          line("Bananer", 22),
          line("Bananer", 21),
          line("Batterier", 50),
        ]),
      ],
      {},
      false,
      { "/^nachochips$/": "Snacks & sweets" },
    ),
  );
  assert.deepEqual(Object.fromEntries(items.map((i) => [i.name, i.category])), {
    Nachochips: "Snacks & sweets",
    "Frosne Poteter": "Frozen/Dypfryste poteter",
    Pizzabunn: "Pantry",
    Gavekort: "Other/Rema1000 gavekort",
    Bananer: "Fruit & veg/Banan",
    Batterier: "Uncategorized",
  });
});

test("splits by size when equal sizes are written in different units", () => {
  assert.deepEqual(summary(itemsOf(purchases, true)), [
    "Isbjørn Lite Glutenfri | 1 | 1 | 1 | 190",
    "Isbjørn Lite Glutenfri | 1 | 1 | 1 | 32",
    "Mack Isbjørn Lite | 1 | 1 | 1 | 185",
    "Monster Ultra White | 1 | 2 | 2 | 61",
    "Pantene Shampoo | 1 | 1 | 1 | 50",
    "Tine Lettmelk 0.5% | 1 | 1 | 1 | 35",
    "Tine Lettmelk 0.5% | 1 | 3 | 4 | 83",
    "Tine Lettmelk Vanilje | 1 | 1 | 1 | 31",
  ]);
});

test("the item filter keeps receipts by the item name, after rules rename lines", () => {
  const rows = withItems(
    [
      txn("7", "2026-10-01T10:00:00Z", [line("TINE LETTMELK 0,5%", 20)]),
      txn("8", "2026-10-02T10:00:00Z", [line("Maarud Tortilla Cheese", 32)]),
      txn("9", "2026-10-03T10:00:00Z", [line("Tortillachips Ost", 30)]),
      { receipt: undefined, category: "x" } as Categorized,
    ],
    { [itemPattern("Maarud Tortilla Cheese")]: "Tortillachips Ost" },
  );
  const ids = (f: Partial<typeof NO_FILTERS>) =>
    rows
      .filter((t) => matchesFilters(t, { ...NO_FILTERS, ...f }))
      .map((t) => t.receipt?.id ?? "none");
  assert.deepEqual(ids({ items: ["Tortillachips Ost"] }), ["8", "9"]);
  assert.deepEqual(ids({ items: ["Tine Lettmelk 0.5%"] }), ["7"]);
  assert.deepEqual(ids({ itemsOut: ["tortillachips ost"] }), ["7", "none"]);
});

test("the item category filter keeps receipts with a line in that category", () => {
  const rows = withItems(
    [
      txn("7", "2026-10-01T10:00:00Z", [line("Tine Lettmelk", 20)]),
      txn("8", "2026-10-02T10:00:00Z", [line("Ringnes Pils", 32)]),
      { receipt: undefined, category: "x" } as Categorized,
    ],
    {},
    { "/lettmelk/": "Dairy & eggs/Milk", "/pils/": "Alcohol" },
  );
  const ids = (f: Partial<typeof NO_FILTERS>) =>
    rows
      .filter((t) => matchesFilters(t, { ...NO_FILTERS, ...f }))
      .map((t) => t.receipt?.id ?? "none");
  assert.deepEqual(ids({ kinds: ["Dairy & eggs"] }), ["7"]);
  assert.deepEqual(ids({ kinds: ["Dairy & eggs/Milk"] }), ["7"]);
  assert.deepEqual(ids({ kindsOut: ["Alcohol"] }), ["7", "none"]);
});

test("prices each purchase by kilo, litre or piece across pack sizes", () => {
  const priced = purchasesOf([
    txn("10", "2026-10-01T10:00:00Z", [
      line("Tortillachips Ost", 37.9, "185 g"),
      line("Maarud Tortilla Cheese", 77.8, "175 g", 2),
      line("Isbjørn Lite Glutenfri", 190, "0,5 l · 6 pk"),
      line("Taco Spice Mix", 23.4, "3 pk · 3 × 25 g"),
      line("Tortillas R", 20, "6 pk"),
      line("Bæreposer", 5),
      { name: "Bananer", qty: 0.5, unit: "kg", price: 30, amount: 15 },
    ]),
  ]).map((p) => {
    const u = unitPrice(p);
    return [p.raw, u && `${u.price.toFixed(2)}/${u.per}`];
  });
  assert.deepEqual(priced, [
    ["Tortillachips Ost", "204.86/kg"],
    ["Maarud Tortilla Cheese", "222.29/kg"],
    ["Isbjørn Lite Glutenfri", "63.33/l"],
    ["Taco Spice Mix", "312.00/kg"],
    ["Tortillas R", "3.33/stk"],
    ["Bæreposer", null],
    ["Bananer", null],
  ]);
});

test("the deposit stays in a can price unless the deposit setting removes it", () => {
  const cans = [
    txn("11", "2026-10-01T10:00:00Z", [
      { ...line("Isbjørn Lite Glutenfri", 249, "0,33 l × 10"), deposit: 20 },
    ]),
  ];
  const perLitre = (withoutDeposit: boolean) =>
    unitPrice(purchasesOf(cans, {}, withoutDeposit)[0]!)!.price.toFixed(2);
  assert.equal(perLitre(false), "75.45");
  assert.equal(perLitre(true), "69.39");
});

test("compares the latest price with the median of two or more earlier prices of the same size", () => {
  const changes = itemsOf(
    purchasesOf([
      txn("20", "2026-10-01T10:00:00Z", [
        line("Kaffe", 60, "250 g"),
        line("Kaffe", 30, "100 g"),
        line("Smør", 40),
        line("Ost", 2),
      ]),
      txn("21", "2026-10-08T10:00:00Z", [
        line("Kaffe", 80, "250 g"),
        line("Smør", 42),
      ]),
      txn("22", "2026-10-15T10:00:00Z", [
        line("Kaffe", 70, "250 g"),
        line("Smør", 41),
      ]),
      txn("23", "2026-10-22T10:00:00Z", [
        line("Kaffe", 30, "100 g"),
        line("Kaffe", 140, "250 g", 2),
        line("Smør", 60, undefined, 2),
      ]),
      txn("24", "2026-10-29T10:00:00Z", [
        line("Kaffe", 36, "100 g"),
        line("Ost", 100),
      ]),
    ]),
  ).map((i) => [i.name, i.change && Math.round(i.change * 100)]);
  assert.deepEqual(changes, [
    ["Kaffe", 20],
    ["Smør", -27],
    ["Ost", null],
  ]);
});

test("dates purchases in Oslo and measures the usual gap in days", () => {
  const milk = itemsOf(purchases, true).find((i) => i.qty === 4)!;
  assert.deepEqual(
    milk.purchases.map((p) => p.date),
    ["2026-09-10", "2026-09-06", "2026-09-01"],
  );
  assert.deepEqual(
    [milk.last, milk.price, milk.medianDays],
    ["2026-09-10", 20.75, 4.5],
  );
});
