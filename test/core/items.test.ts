import assert from "node:assert/strict";
import { test } from "node:test";
import { itemsOf, purchasesOf } from "../../src/core/items.ts";
import type { Receipt, ReceiptLine } from "../../src/core/receipts.ts";
import type { Categorized } from "../../src/core/types.ts";

const line = (name: string, amount: number, qty = 1): ReceiptLine => ({
  name,
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

test("groups receipt lines into items with one purchase per receipt", () => {
  const items = itemsOf(
    purchasesOf([
      txn("1", "2026-09-01T10:00:00Z", [
        line("Tine Lettmelk", 20),
        line("Tine Lettmelk", 20),
        line("Pant", -2),
      ]),
      txn("2", "2026-09-05T22:30:00Z", [line("TINE LETTMELK", 22)]),
      txn("3", "2026-09-10T10:00:00Z", [
        line("tine lettmelk", 21),
        line("Bananer", 15.5, 0.62),
      ]),
      { receipt: undefined } as Categorized,
    ]),
  );
  const milk = items.find((i) => i.key === "tine lettmelk")!;
  assert.deepEqual(
    [milk.count, milk.qty, milk.spent, milk.price],
    [3, 4, 83, 20.75],
  );
  assert.deepEqual([milk.last, milk.name], ["2026-09-10", "tine lettmelk"]);
  assert.deepEqual(
    milk.purchases.map((p) => p.date),
    ["2026-09-10", "2026-09-06", "2026-09-01"],
  );
  assert.equal(milk.medianDays, 4.5);
  assert.deepEqual(items.map((i) => i.key).sort(), [
    "bananer",
    "tine lettmelk",
  ]);
});
