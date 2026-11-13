import assert from "node:assert/strict";
import { test } from "node:test";
import { itemPattern, itemsOf, purchasesOf } from "../../src/core/items.ts";
import type { Receipt, ReceiptLine } from "../../src/core/receipts.ts";
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

test("splits by size when equal sizes are written in different units", () => {
  assert.deepEqual(summary(itemsOf(purchases, true)), [
    "Isbjørn Lite Glutenfri | 1 | 1 | 1 | 190",
    "Isbjørn Lite Glutenfri | 1 | 1 | 1 | 32",
    "Mack Isbjørn Lite | 1 | 1 | 1 | 185",
    "Monster Ultra White | 1 | 2 | 2 | 61",
    "Tine Lettmelk 0.5% | 1 | 1 | 1 | 35",
    "Tine Lettmelk 0.5% | 1 | 3 | 4 | 83",
    "Tine Lettmelk Vanilje | 1 | 1 | 1 | 31",
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
