import assert from "node:assert/strict";
import { test } from "node:test";
import type { Filters } from "../../src/core/select.ts";
import {
  AXES,
  axisBounds,
  distinctCategories,
  distinctMerchants,
  distinctMonths,
  distinctSubcategories,
  inRange,
  matchesFilters,
  NO_FILTERS,
  period,
  personMerchants,
  subcategoryOf,
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

test("inRange is inclusive at both ends, and an open end bounds nothing", () => {
  const t = txn({ id: "1", amount: -10, date: "2026-07-15" });
  assert.equal(inRange(t, "2026-07-15", "2026-07-15"), true);
  assert.equal(inRange(t, "2026-07-16", null), false);
  assert.equal(inRange(t, null, "2026-07-14"), false);
  assert.equal(inRange(t, null, null), true);
  assert.equal(inRange(t, "2025-12-31", "2026-12-31"), true);
});

test("a month in January compares against January the year before", () => {
  assert.deepEqual(period("2026-01", "2026-08-09").prev, {
    from: "2025-01-01",
    to: "2025-01-31",
    label: "last year",
  });
});

test("distinctMonths is sorted and deduplicated", () => {
  const txns = [
    txn({ id: "1", amount: -1, date: "2026-07-10" }),
    txn({ id: "2", amount: -1, date: "2026-06-10" }),
    txn({ id: "3", amount: -1, date: "2026-07-20" }),
  ];
  assert.deepEqual(distinctMonths(txns), ["2026-06", "2026-07"]);
});

test("matchesFilters: merchants, alongside the categories, and on the description when there is no counterparty", () => {
  const rema = txn({
    id: "1",
    amount: -100,
    counterparty: "Rema 1000",
    category: "dagligvarer",
  });
  const kiwi = txn({
    id: "2",
    amount: -50,
    counterparty: "Kiwi",
    category: "dagligvarer",
  });
  const card = txn({
    id: "3",
    amount: -20,
    counterparty: null,
    description: "Varekjøp",
    category: "ukategorisert",
  });
  const all = [rema, kiwi, card];

  const only = (f: Partial<typeof NO_FILTERS>) =>
    all.filter((t) => matchesFilters(t, { ...NO_FILTERS, ...f }));
  assert.deepEqual(only({ merchants: ["Rema 1000"] }), [rema]);
  assert.deepEqual(only({ merchantsOut: ["Rema 1000"] }), [kiwi, card]);
  assert.deepEqual(only({ merchants: ["Varekjøp"] }), [card]);
  assert.deepEqual(
    only({ merchants: ["Rema 1000"], categories: ["transport"] }),
    [],
  );
  assert.equal(only({ merchantsOut: [] }).length, 3);
  assert.deepEqual(
    only({ merchants: ["Rema 1000", "Kiwi"], merchantsOut: ["Kiwi"] }),
    [rema],
  );
});

test("distinctMerchants falls back to the description and is sorted and deduplicated", () => {
  const txns = [
    txn({ id: "1", amount: -1, counterparty: "Kiwi" }),
    txn({ id: "2", amount: -1, counterparty: null, description: "Apple" }),
    txn({ id: "3", amount: -1, counterparty: "Kiwi" }),
  ];
  assert.deepEqual(distinctMerchants(txns), ["Apple", "Kiwi"]);
});

test("distinctCategories drives the filter chips, so it is sorted and deduplicated", () => {
  const txns = [
    txn({ id: "1", amount: -1, category: "transport" }),
    txn({ id: "2", amount: -1, category: "dagligvarer" }),
    txn({ id: "3", amount: -1, category: "transport" }),
  ];
  assert.deepEqual(distinctCategories(txns), ["dagligvarer", "transport"]);
});

test("the account filter is the third axis, and works either way round", () => {
  const rows = [
    txn({ id: "1", amount: -100, account: "Brukskonto" }),
    txn({ id: "2", amount: -100, account: "Mastercard Ung" }),
  ];
  const shown = (f: Partial<Filters>) =>
    rows
      .filter((t) => matchesFilters(t, { ...NO_FILTERS, ...f }))
      .map((t) => t.id);

  assert.deepEqual(shown({ accounts: ["Mastercard Ung"] }), ["2"]);
  assert.deepEqual(shown({ accountsOut: ["Mastercard Ung"] }), ["1"]);
  assert.deepEqual(shown({ accountsOut: [] }), ["1", "2"]);
  assert.deepEqual(
    shown({ accounts: ["Brukskonto"], categories: ["reise"] }),
    [],
  );
});

test("AXES names every list filter with the field holding its exclusions", () => {
  for (const [list, out] of Object.entries(AXES)) {
    assert.ok(
      Array.isArray(NO_FILTERS[list as keyof typeof AXES]),
      `${list} is a list`,
    );
    assert.deepEqual(NO_FILTERS[out], [], `${out} is an empty list`);
  }
});

test("the category filter matches the pair, so one sub under two mains stays apart", () => {
  const trip = txn({
    id: "1",
    amount: -100,
    category: "reise",
    subcategory: "kollektivtransport",
  });
  const commute = txn({
    id: "2",
    amount: -100,
    category: "bil_og_transport",
    subcategory: "kollektivtransport",
  });
  const f = { ...NO_FILTERS, categories: ["reise/kollektivtransport"] };
  assert.equal(matchesFilters(trip, f), true);
  assert.equal(matchesFilters(commute, f), false);
});

test("a category and a subcategory of some other category are a union, not an empty page", () => {
  const loan = txn({
    id: "1",
    amount: -100,
    category: "annet_lan_og_gjeld",
    subcategory: "studielan",
  });
  const other = txn({
    id: "2",
    amount: -100,
    category: "dagligvarer",
    subcategory: "andre_dagligvarer",
  });
  const neither = txn({
    id: "3",
    amount: -100,
    category: "dagligvarer",
    subcategory: "dagligvarer",
  });
  const f = {
    ...NO_FILTERS,
    categories: ["annet_lan_og_gjeld", "dagligvarer/andre_dagligvarer"],
  };
  assert.equal(matchesFilters(loan, f), true);
  assert.equal(matchesFilters(other, f), true);
  assert.equal(matchesFilters(neither, f), false);
});

test("a category listed alone still takes all of its subcategories with it", () => {
  const f = { ...NO_FILTERS, categories: ["dagligvarer"] };
  assert.equal(
    matchesFilters(
      txn({
        id: "1",
        amount: -100,
        category: "dagligvarer",
        subcategory: "andre_dagligvarer",
      }),
      f,
    ),
    true,
  );
  const not = { ...NO_FILTERS, categoriesOut: ["dagligvarer"] };
  assert.equal(
    matchesFilters(
      txn({
        id: "1",
        amount: -100,
        category: "dagligvarer",
        subcategory: "andre_dagligvarer",
      }),
      not,
    ),
    false,
  );
});

test("excluding one subcategory leaves its siblings in", () => {
  const f = { ...NO_FILTERS, categoriesOut: ["dagligvarer/andre_dagligvarer"] };
  assert.equal(
    matchesFilters(
      txn({
        id: "1",
        amount: -100,
        category: "dagligvarer",
        subcategory: "andre_dagligvarer",
      }),
      f,
    ),
    false,
  );
  assert.equal(
    matchesFilters(
      txn({
        id: "2",
        amount: -100,
        category: "dagligvarer",
        subcategory: "dagligvarer",
      }),
      f,
    ),
    true,
  );
});

test("a category whose rows have no subcategory is still selectable", () => {
  const bare = txn({
    id: "1",
    amount: -100,
    category: "vipps",
    subcategory: null,
  });
  assert.equal(
    matchesFilters(bare, { ...NO_FILTERS, categories: ["vipps/"] }),
    true,
  );
  assert.equal(subcategoryOf(bare), "vipps/");
});

test("distinctSubcategories lists the pairs, including the unnamed remainder", () => {
  assert.deepEqual(
    distinctSubcategories([
      txn({
        id: "1",
        amount: -100,
        category: "reise",
        subcategory: "flybilletter",
      }),
      txn({ id: "2", amount: -100, category: "vipps", subcategory: null }),
    ]),
    ["reise/flybilletter", "vipps/"],
  );
});

test("a merchant is a person when any row of theirs is a peer payment", () => {
  const rows = [
    txn({
      id: "a",
      amount: -8000,
      counterparty: "Flatmate",
      category: "faste_boutgifter",
      subcategory: "boligutgifter",
    }),
    txn({
      id: "b",
      amount: -120,
      counterparty: "Flatmate",
      category: "diverse",
      subcategory: "vennebetaling",
    }),
    txn({
      id: "c",
      amount: 500,
      counterparty: "Relative",
      category: "innskudd",
      subcategory: "familie",
    }),
    txn({
      id: "d",
      amount: -240,
      counterparty: "Georgios Giannakis",
      category: "kafe_og_restaurant",
      subcategory: "restaurant",
    }),
  ];

  const people = personMerchants(rows);
  assert.ok(people.has("Flatmate"));
  assert.ok(people.has("Relative"));
  assert.ok(!people.has("Georgios Giannakis"));
  assert.equal(people.size, 2);
});
