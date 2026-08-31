import assert from "node:assert/strict";
import { test } from "node:test";
import {
  axisBounds,
  inRange,
  matchesFilters,
  NO_FILTERS,
  period,
} from "../../src/core/select.ts";
import type { Categorized } from "../../src/core/types.ts";

function txn(
  partial: Partial<Categorized> & { id: string; amount: number },
): Categorized {
  return {
    account: "Brukskonto",
    accountKey: "acc",
    date: "2026-07-15",
    description: "test",
    counterparty: "Kiwi",
    country: null,
    bankCategory: null,
    bankSub: null,
    bankCategoryName: null,
    bankSubName: null,
    bankConfidence: null,
    typeText: null,
    remoteAccountNumber: null,
    isPending: false,
    isRecurring: false,
    isSubscription: false,
    excluded: false,
    reason: null,
    category: "dagligvarer",
    subcategory: null,
    ...partial,
  };
}

test("axisBounds stops a running period at the record, not at its last calendar day", () => {
  const now = "2026-08-09";
  const rows = [txn({ id: "1", amount: -10, date: "2026-08-03" })];

  assert.deepEqual(axisBounds(rows, period("2026-08", now), now), {
    from: "2026-08-01",
    to: "2026-08-09",
  });

  assert.deepEqual(axisBounds(rows, period("2026-02", now), now), {
    from: "2026-02-01",
    to: "2026-02-31",
  });

  assert.equal(axisBounds(rows, period("2026", now), now).to, "2026-08-09");
  assert.equal(axisBounds(rows, period("2025", now), now).to, "2025-12-31");
});

test("axisBounds never stops short of a row dated past today", () => {
  const now = "2026-08-09";
  const rows = [
    txn({ id: "1", amount: -10, date: "2026-08-03" }),
    txn({ id: "2", amount: -20, date: "2026-08-11" }),
  ];
  assert.equal(axisBounds(rows, period("2026-08", now), now).to, "2026-08-11");
  assert.equal(axisBounds(rows, period("2026", now), now).to, "2026-08-11");
});

test("axisBounds falls back to the rows themselves when the period is open at both ends", () => {
  const now = "2026-08-09";
  const rows = [
    txn({ id: "1", amount: -10, date: "2024-03-02" }),
    txn({ id: "2", amount: -10, date: "2022-01-03" }),
  ];
  assert.deepEqual(axisBounds(rows, period("all", now), now), {
    from: "2022-01-03",
    to: "2026-08-09",
  });

  const empty = axisBounds([], period("all", now), now);
  assert.deepEqual(empty, { from: now, to: now });
});

test("matchesFilters: category and search", () => {
  const t = txn({
    id: "1",
    amount: -123.45,
    description: "Rema 1000",
    counterparty: "Rema",
    category: "dagligvarer",
  });
  assert.equal(matchesFilters(t, NO_FILTERS), true);
  assert.equal(
    matchesFilters(t, { ...NO_FILTERS, categories: ["transport"] }),
    false,
  );
  assert.equal(matchesFilters(t, { ...NO_FILTERS, search: "rema" }), true);
  assert.equal(matchesFilters(t, { ...NO_FILTERS, search: "kiwi" }), false);
});

test("matchesFilters: excluded rows are hidden unless showExcluded, and no other filter overrides it", () => {
  const transfer = txn({
    id: "1",
    amount: -3706,
    excluded: true,
    reason: "internal transfer",
  });
  const spend = txn({ id: "2", amount: -123 });

  assert.equal(matchesFilters(transfer, NO_FILTERS), false);
  assert.equal(matchesFilters(spend, NO_FILTERS), true);
  assert.equal(
    matchesFilters(transfer, { ...NO_FILTERS, showExcluded: true }),
    true,
  );

  const named = { ...NO_FILTERS, merchants: ["Kiwi"] };
  assert.equal(matchesFilters(transfer, named), false);
  assert.equal(
    matchesFilters(transfer, { ...named, showExcluded: true }),
    true,
  );

  assert.equal(
    matchesFilters(transfer, {
      ...NO_FILTERS,
      showExcluded: true,
      search: "nothing",
    }),
    false,
  );
});

test("matchesFilters: several categories at once, and none means all", () => {
  const groceries = txn({ id: "1", amount: -100, category: "dagligvarer" });
  const transport = txn({ id: "2", amount: -50, category: "transport" });
  const rent = txn({ id: "3", amount: -18000, category: "faste_boutgifter" });
  const all = [groceries, transport, rent];

  const two = { ...NO_FILTERS, categories: ["dagligvarer", "transport"] };
  assert.deepEqual(
    all.filter((t) => matchesFilters(t, two)),
    [groceries, transport],
  );
  assert.equal(all.filter((t) => matchesFilters(t, NO_FILTERS)).length, 3);
});

test("matchesFilters: exclude hides exactly what include would have kept", () => {
  const groceries = txn({ id: "1", amount: -100, category: "dagligvarer" });
  const transport = txn({ id: "2", amount: -50, category: "transport" });
  const rent = txn({ id: "3", amount: -18000, category: "faste_boutgifter" });
  const all = [groceries, transport, rent];

  const list = ["dagligvarer", "transport"];
  const kept = all.filter((t) =>
    matchesFilters(t, { ...NO_FILTERS, categories: list }),
  );
  const dropped = all.filter((t) =>
    matchesFilters(t, { ...NO_FILTERS, categoriesOut: list }),
  );
  assert.deepEqual(dropped, [rent]);
  assert.deepEqual(
    [...kept, ...dropped].sort((a, b) => a.id.localeCompare(b.id)),
    all,
  );

  assert.equal(
    all.filter((t) => matchesFilters(t, { ...NO_FILTERS, categoriesOut: [] }))
      .length,
    3,
  );
});

test("matchesFilters: a category, minus one subcategory of it", () => {
  const gift = txn({
    id: "1",
    amount: 500,
    category: "innskudd",
    subcategory: "familie",
  });
  const salary = txn({
    id: "2",
    amount: 20000,
    category: "innskudd",
    subcategory: "lonn",
  });
  const spend = txn({ id: "3", amount: -100, category: "dagligvarer" });
  const all = [gift, salary, spend];

  assert.deepEqual(
    all.filter((t) =>
      matchesFilters(t, {
        ...NO_FILTERS,
        categories: ["innskudd"],
        categoriesOut: ["innskudd/familie"],
      }),
    ),
    [salary],
  );

  assert.equal(
    matchesFilters(gift, {
      ...NO_FILTERS,
      categories: ["innskudd/familie"],
      categoriesOut: ["innskudd"],
    }),
    false,
  );

  assert.deepEqual(
    all.filter((t) =>
      matchesFilters(t, {
        ...NO_FILTERS,
        accounts: ["Brukskonto"],
        accountsOut: ["Brukskonto"],
      }),
    ),
    [],
  );
});

test("period: a month covers its own days and nothing either side of it", () => {
  const p = period("2026-02", "2026-08-09");
  assert.deepEqual(
    [p.kind, p.from, p.to],
    ["month", "2026-02-01", "2026-02-31"],
  );
  const inside = (date: string) =>
    inRange(txn({ id: "1", amount: -1, date }), p.from, p.to);
  assert.equal(inside("2026-02-01"), true);
  assert.equal(inside("2026-02-28"), true);
  assert.equal(inside("2026-01-31"), false);
  assert.equal(inside("2026-03-01"), false);
  assert.deepEqual(p.prev, {
    from: "2025-02-01",
    to: "2025-02-31",
    label: "last year",
  });
});

test("period: a year, and its previous window is the year before", () => {
  const p = period("2026", "2027-03-04");
  assert.deepEqual(
    [p.kind, p.from, p.to],
    ["year", "2026-01-01", "2026-12-31"],
  );
  assert.deepEqual(p.prev, {
    from: "2025-01-01",
    to: "2025-12-31",
    label: "last year",
  });
});

test("period: a period still running is compared against the same slice of the previous one", () => {
  assert.deepEqual(period("2026-08", "2026-08-09").prev, {
    from: "2025-08-01",
    to: "2025-08-09",
    label: "this time last year",
  });
  assert.deepEqual(period("2026", "2026-08-09").prev, {
    from: "2025-01-01",
    to: "2025-08-09",
    label: "this time last year",
  });

  assert.equal(period("2024-02", "2024-02-29").prev!.to, "2023-02-29");
  assert.equal(
    inRange(
      txn({ id: "1", amount: -1, date: "2023-02-28" }),
      "2023-02-01",
      "2023-02-29",
    ),
    true,
  );
  assert.equal(
    inRange(
      txn({ id: "2", amount: -1, date: "2023-03-01" }),
      "2023-02-01",
      "2023-02-29",
    ),
    false,
  );

  assert.equal(period("2026-07", "2026-08-09").prev!.label, "last year");
  assert.equal(period("2025", "2026-08-09").prev!.label, "last year");
});

test("period: all time, and anything unrecognised, is unbounded and has no previous", () => {
  for (const p of [period("all"), period("sideways"), period("")]) {
    assert.deepEqual([p.kind, p.from, p.to, p.prev], ["all", null, null, null]);
  }
});

test("period: a custom range bounds what was typed and has no previous window", () => {
  const p = period("2026-03-04..2026-03-10");
  assert.deepEqual(
    [p.kind, p.from, p.to, p.prev],
    ["custom", "2026-03-04", "2026-03-10", null],
  );

  assert.deepEqual(
    [period("..2026-03-10").from, period("..2026-03-10").to],
    [null, "2026-03-10"],
  );
  assert.equal(period("2026-03-04..").to, null);
  assert.equal(period("..").kind, "custom");

  assert.equal(period("2026-03..2026-05").kind, "all");
});
