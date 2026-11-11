import assert from "node:assert/strict";
import { test } from "node:test";
import { bulkPlan } from "../../src/core/bulkRules.ts";
import { compile, haystackOf } from "../../src/core/match.ts";
import type { Categorized } from "../../src/core/types.ts";

const row: Categorized = {
  id: "one",
  accountKey: "a",
  account: "Daily",
  date: "2026-09-01",
  amount: -100,
  description: "Card: SHOP (A+B) / online?",
  counterparty: "Shop",
  originalCounterparty: "SHOP (A+B)",
  country: null,
  bankCategory: null,
  bankSub: null,
  bankCategoryName: null,
  bankSubName: null,
  bankConfidence: null,
  remoteAccountNumber: "recipient-a",
  typeText: "Card",
  isPending: false,
  isRecurring: false,
  isSubscription: false,
  excluded: false,
  reason: null,
  category: "food",
  subcategory: null,
};

test("bulk rename escapes imported text and previews matching rows outside selection", () => {
  const same = {
    ...row,
    id: "new-id",
    date: "2026-10-01",
    counterparty: "Other display",
  };
  const other = { ...row, remoteAccountNumber: "recipient-b" };
  const extended = { ...row, description: `Unrelated ${row.description}` };
  const all = [row, same, other, extended];
  const plan = bulkPlan([row], all, "payees");
  assert.equal(plan.keys.length, 1);
  assert.deepEqual(plan.matches, [row, same]);
  assert.equal(plan.outside, 1);
  const match = compile(plan.keys[0]!, "payees");
  assert.deepEqual(
    all.filter((t) => match(haystackOf(t))),
    plan.matches,
  );
  assert.equal(match(`${haystackOf(row)}\n`), false);
});

test("bulk category preview groups by imported payee and skips exclusions", () => {
  const same = { ...row, id: "new-id", amount: 250, counterparty: "Renamed" };
  const excluded = { ...row, excluded: true };
  const unnamed = { ...row, originalCounterparty: "" };
  const other = { ...row, originalCounterparty: "OTHER" };
  const all = [row, same, excluded, unnamed, other];
  const plan = bulkPlan([row, excluded, unnamed], all, "categories");
  assert.deepEqual(plan.keys, ["shop (a+b)"]);
  assert.deepEqual(plan.matches, [row, same]);
  assert.equal(plan.skipped, 2);
  assert.equal(plan.outside, 1);
});

test("bulk edits refuse stale imported names and empty selections", () => {
  const stale = { ...row, originalCounterparty: undefined };
  for (const file of ["payees", "categories"] as const) {
    assert.deepEqual(bulkPlan([], [row], file).keys, []);
    assert.deepEqual(bulkPlan([stale], [stale], file).keys, []);
  }
});

test("bulk rename matches literal line breaks without matching a longer description", () => {
  const multiline = { ...row, description: "SHOP\n(A+B)\rstore" };
  const plan = bulkPlan([multiline], [multiline], "payees");
  const match = compile(plan.keys[0]!, "payees");
  assert.equal(match(haystackOf(multiline)), true);
  assert.equal(
    match(
      haystackOf({
        ...multiline,
        description: `${multiline.description} other`,
      }),
    ),
    false,
  );
});

test("bulk edits retain existing filters and include the new name or category", async () => {
  const { bulkFilters } = await import("../../src/core/bulkRules.ts");
  const { NO_FILTERS } = await import("../../src/core/select.ts");
  const before = {
    ...NO_FILTERS,
    merchants: ["Shop", "Cafe"],
    categories: ["food"],
  };
  assert.deepEqual(bulkFilters(before, "payees", "Unified"), {
    ...before,
    merchants: ["Shop", "Cafe", "Unified"],
  });
  assert.deepEqual(bulkFilters(before, "categories", "home/furniture"), {
    ...before,
    categories: ["food", "home/furniture"],
  });
  assert.deepEqual(bulkFilters(before, "payees", "Shop"), before);
  assert.deepEqual(bulkFilters(NO_FILTERS, "payees", "Unified"), NO_FILTERS);
});
