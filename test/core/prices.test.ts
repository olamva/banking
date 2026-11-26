import assert from "node:assert/strict";
import { test } from "node:test";
import { priceReceipts } from "../../src/core/receipts.ts";
import type { Txn } from "../../src/core/types.ts";

const txn = (id: string, amount: number): Txn => ({
  id,
  accountKey: "a",
  account: "Brukskonto",
  date: "2026-11-13",
  amount,
  description: "PayPal_*Online Linjefo",
  counterparty: "Online",
  country: null,
  bankCategory: null,
  bankSub: null,
  bankCategoryName: null,
  bankSubName: null,
  bankConfidence: null,
  remoteAccountNumber: null,
  typeText: "VISA Varekjøp",
  isPending: false,
  isRecurring: false,
  isSubscription: false,
});

test("a price rule with an amount beats a rule without one", () => {
  const rows = [txn("drink", -22.7), txn("other", -25.5), txn("in", 22.7)];
  const found = priceReceipts(rows, {
    '{"pattern":"online linj","amount":"-22.70"}': "Monster Ultra White",
    '{"pattern":"online linj","direction":"out"}': "Kiosk",
  });
  assert.deepEqual(
    rows.map((t) => found.get(t)?.lines.map((l) => [l.name, l.amount])),
    [[["Monster Ultra White", 22.7]], [["Kiosk", 25.5]], undefined],
  );
});
