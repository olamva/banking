import assert from "node:assert/strict";
import { test } from "node:test";
import { itemsOf, purchasesOf } from "../../src/core/items.ts";
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
    "Isbjørn Lite Glutenfri Boks | 2 | 2 | 2 | 222",
    "MACK ISBJØRN LITE | 1 | 1 | 1 | 185",
    "Monster Ultra White Bx | 1 | 2 | 2 | 61",
    "Tine Lettmelk 0.5% | 2 | 3 | 5 | 118",
    "Tine Lettmelk Vanilje | 1 | 1 | 1 | 31",
  ]);
});

test("splits by size when equal sizes are written in different units", () => {
  assert.deepEqual(summary(itemsOf(purchases, true)), [
    "Isbjørn Lite Glutenfri Boks | 1 | 1 | 1 | 32",
    "Isbjørn Lite Glutenfri | 1 | 1 | 1 | 190",
    "MACK ISBJØRN LITE | 1 | 1 | 1 | 185",
    "Monster Ultra White Bx | 1 | 2 | 2 | 61",
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
