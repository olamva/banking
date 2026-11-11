import assert from "node:assert/strict";
import { test } from "node:test";
import { reviewGroups } from "../../src/core/review.ts";
import type { Categorized } from "../../src/core/types.ts";

const row = (
  id: string,
  payee: string,
  categorySource: string,
  extra: Partial<Categorized> = {},
): Categorized => ({
  id,
  accountKey: "a",
  account: "Daily",
  date: "2026-09-01",
  amount: -100,
  description: payee,
  counterparty: payee,
  originalCounterparty: payee,
  country: null,
  bankCategory: null,
  bankSub: null,
  bankCategoryName: null,
  bankSubName: null,
  bankConfidence: null,
  remoteAccountNumber: null,
  typeText: "Card",
  isPending: false,
  isRecurring: false,
  isSubscription: false,
  excluded: false,
  reason: null,
  category: "food",
  subcategory: null,
  categorySource,
  ...extra,
});

test("review groups unconfirmed payees and puts guessed ones first", () => {
  const groups = reviewGroups([
    row("bank", "Shop", "Bank category", { date: "2026-10-01" }),
    row("bank-again", "SHOP ", "Bank category", { date: "2026-10-02" }),
    row("guess", "Abroad", "Travel estimate"),
    row("ruled", "Ruled", "Category rule"),
    row("moved", "Moved", "Bank category", { excluded: true }),
    row("nameless", "", "Needs review"),
  ]);
  assert.deepEqual(
    groups.map((g) => [g.guessed, g.txns.map((t) => t.id)]),
    [
      [true, ["guess"]],
      [false, ["bank-again", "bank"]],
    ],
  );
});
