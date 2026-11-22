import assert from "node:assert/strict";
import { test } from "node:test";
import type { Filters } from "../../src/core/select.ts";
import {
  cycleFilter,
  distinctCategories,
  distinctCountries,
  distinctMerchants,
  distinctMonths,
  distinctSubcategories,
  groupAt,
  inRange,
  markedItem,
  matchesFilters,
  NO_FILTERS,
  NO_GROUP,
  period,
  personMerchants,
  pruneGroups,
  withGroupAt,
  subcategoryOf,
} from "../../src/core/select.ts";
import type { Categorized } from "../../src/core/types.ts";
import { dropNarrower } from "../../src/core/groups.ts";

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

test("a tap includes a value and a second tap clears it", () => {
  const only = cycleFilter(NO_FILTERS, "merchants", "Kiwi");
  assert.deepEqual(only.merchants, ["Kiwi"]);
  assert.deepEqual(only.merchantsOut, []);

  const off = cycleFilter(only, "merchants", "Kiwi");
  assert.deepEqual(off.merchants, []);
  assert.deepEqual(off.merchantsOut, []);
});

test("an exclude moves a value to except, and a tap on it clears it", () => {
  const only = cycleFilter(NO_FILTERS, "categories", "mat");
  const except = cycleFilter(only, "categories", "mat", true);
  assert.deepEqual(except.categories, []);
  assert.deepEqual(except.categoriesOut, ["mat"]);

  assert.deepEqual(cycleFilter(except, "categories", "mat").categoriesOut, []);
  assert.deepEqual(
    cycleFilter(except, "categories", "mat", true).categoriesOut,
    [],
  );
});

test("country filters include unknown countries and respect exclusions", () => {
  const rows = [
    txn({ id: "local", amount: -1, country: "Norway" }),
    txn({ id: "foreign", amount: -1, country: "Japan" }),
    txn({ id: "unknown", amount: -1, country: null }),
  ];
  const shown = (filters: Partial<Filters>) =>
    rows
      .filter((row) => matchesFilters(row, { ...NO_FILTERS, ...filters }))
      .map((row) => row.id);
  assert.deepEqual(distinctCountries([...rows, rows[0]!]), [
    "Japan",
    "Norway",
    "—",
  ]);
  assert.deepEqual(shown({ countries: ["—"] }), ["unknown"]);
  assert.deepEqual(shown({ countriesOut: ["Norway"] }), ["foreign", "unknown"]);
  assert.deepEqual(
    shown({ countries: ["Japan", "Norway"], countriesOut: ["Japan"] }),
    ["local"],
  );
  assert.deepEqual(shown({ countries: ["Japan"], accounts: ["Other"] }), []);
});

test("matchesFilters: a row shows when it matches any group, and the switches bind every group", () => {
  const kiosk = txn({
    id: "1",
    amount: -22,
    counterparty: "Online",
    category: "kafe_og_restaurant",
    subcategory: "linjeforening_kiosk",
  });
  const rema = txn({
    id: "2",
    amount: -30,
    counterparty: "Rema 1000",
    items: ["monster ultra white"],
  });
  const kiwi = txn({ id: "3", amount: -40, items: ["lett melk tine"] });
  const hidden = txn({
    id: "4",
    amount: -22,
    counterparty: "Online",
    category: "kafe_og_restaurant",
    subcategory: "linjeforening_kiosk",
    excluded: true,
  });
  const all = [kiosk, rema, kiwi, hidden];
  const f: Filters = {
    ...NO_FILTERS,
    merchants: ["Online"],
    or: [{ ...NO_GROUP, items: ["Monster Ultra White"] }],
  };
  const shown = (g: Filters) => all.filter((t) => matchesFilters(t, g));

  assert.deepEqual(shown(f), [kiosk, rema]);
  assert.deepEqual(shown({ ...f, or: [...f.or, NO_GROUP] }), [kiosk, rema]);
  assert.deepEqual(shown({ ...f, search: "rema" }), [rema]);
  assert.deepEqual(shown({ ...f, showExcluded: true }), [kiosk, rema, hidden]);
  assert.deepEqual(shown({ ...NO_FILTERS, or: [NO_GROUP] }), [
    kiosk,
    rema,
    kiwi,
  ]);
});

test("withGroupAt edits one group, and pruneGroups drops the empty ones", () => {
  const f: Filters = {
    ...NO_FILTERS,
    merchants: ["Online"],
    or: [{ ...NO_GROUP, items: ["Monster"] }],
  };
  const added = withGroupAt(f, 2, {
    ...groupAt(f, 2),
    merchants: ["Kiwi"],
    showExcluded: true,
  });
  assert.deepEqual(added.merchants, ["Online"]);
  assert.deepEqual(
    added.or.map((g) => [g.items, g.merchants]),
    [
      [["Monster"], []],
      [[], ["Kiwi"]],
    ],
  );
  assert.equal(added.showExcluded, true);

  const emptied = withGroupAt(added, 0, {
    ...groupAt(added, 0),
    merchants: [],
  });
  assert.equal(emptied.or.length, 2);
  const pruned = pruneGroups(emptied);
  assert.deepEqual([pruned.items, pruned.merchants], [["Monster"], []]);
  assert.deepEqual(pruned.or, [{ ...NO_GROUP, merchants: ["Kiwi"] }]);
  assert.equal(pruneGroups(f), f);
});

test("dropNarrower drops a group that another group already covers", () => {
  const picked: Filters = {
    ...NO_FILTERS,
    merchants: ["Vinmonopolet"],
    items: ["Smirnoff Ice"],
    or: [{ ...NO_GROUP, merchants: ["Vinmonopolet"] }],
  };
  assert.deepEqual(dropNarrower(picked), {
    ...NO_FILTERS,
    merchants: ["Vinmonopolet"],
  });

  const apart: Filters = {
    ...NO_FILTERS,
    items: ["Smirnoff Ice"],
    or: [{ ...NO_GROUP, merchants: ["Vinmonopolet"] }],
  };
  assert.deepEqual(dropNarrower(apart), apart);

  const twins: Filters = {
    ...NO_FILTERS,
    merchants: ["Kiwi"],
    or: [{ ...NO_GROUP, merchants: ["Kiwi"] }],
  };
  assert.deepEqual(dropNarrower(twins), { ...NO_FILTERS, merchants: ["Kiwi"] });

  const wider: Filters = {
    ...NO_FILTERS,
    merchants: ["Kiwi"],
    or: [{ ...NO_GROUP, merchants: ["Kiwi", "Rema"] }],
  };
  assert.deepEqual(dropNarrower(wider), {
    ...NO_FILTERS,
    merchants: ["Kiwi", "Rema"],
  });
});

test("markedItem marks an item that any group names", () => {
  const f: Filters = {
    ...NO_FILTERS,
    merchants: ["Online"],
    or: [{ ...NO_GROUP, items: ["Monster Ultra White"] }],
  };
  assert.equal(markedItem("monster ultra white", f), true);
  assert.equal(markedItem("lett melk tine", f), false);
});
