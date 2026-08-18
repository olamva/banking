import assert from "node:assert/strict";
import { test } from "node:test";
import type { SeriesPoint } from "../../src/core/stats.ts";
import {
  cumulative,
  dailySeries,
  monthStats,
  monthlySeries,
  spendTrend,
  subsAndRecurring,
  subscriptionGroups,
  totals,
  withGaps,
  yearStats,
} from "../../src/core/stats.ts";
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

test("totals: in, out, net", () => {
  const txns = [
    txn({ id: "1", amount: -100.5, category: "dagligvarer" }),
    txn({ id: "2", amount: -49.5, category: "transport" }),
    txn({ id: "3", amount: 2000, category: "inntekt" }),
  ];
  const stats = monthStats("2026-07", txns);
  assert.equal(stats.totalOut, 150);
  assert.equal(stats.totalIn, 2000);
  assert.equal(stats.net, 1850);
});

test("excluded rows are kept out of totals but reported", () => {
  const txns = [
    txn({ id: "1", amount: -100, category: "dagligvarer" }),
    txn({ id: "2", amount: -500, excluded: true, reason: "internal transfer" }),
    txn({ id: "3", amount: 500, excluded: true, reason: "internal transfer" }),
  ];
  const stats = monthStats("2026-07", txns);
  assert.equal(stats.totalOut, 100);
  assert.deepEqual(stats.excluded, { count: 2, total: 1000 });

  const t = totals(txns);
  assert.deepEqual(t.excluded, stats.excluded);
  assert.deepEqual(
    [t.totalIn, t.totalOut, t.net],
    [stats.totalIn, stats.totalOut, stats.net],
  );
});

test("spending splits by account, and a nameless row is still out of topCounterparties", () => {
  const txns = [
    txn({
      id: "1",
      amount: -100,
      category: "dagligvarer",
      counterparty: "Kiwi",
    }),
    txn({
      id: "2",
      account: "Kredittkort",
      amount: -300,
      category: "kort",
      counterparty: null,
    }),
    txn({ id: "3", account: "Kredittkort", amount: 5000, counterparty: null }),
    txn({
      id: "4",
      amount: -9000,
      excluded: true,
      reason: "internal transfer",
    }),
  ];
  const stats = monthStats("2026-07", txns);
  assert.deepEqual(stats.accounts, [
    { account: "Kredittkort", total: 300, share: 0.75 },
    { account: "Brukskonto", total: 100, share: 0.25 },
  ]);
  assert.equal(stats.topCounterparties.length, 1);
  assert.equal(stats.topCounterparties[0].counterparty, "Kiwi");
});

test("category shares sum to exactly 1, not 0.9997", () => {
  const txns = [
    txn({ id: "1", amount: -1, category: "a" }),
    txn({ id: "2", amount: -1, category: "b" }),
    txn({ id: "3", amount: -1, category: "c" }),
  ];
  const stats = monthStats("2026-07", txns);
  const total = stats.categories.reduce((s, c) => s + c.share, 0);
  assert.ok(Math.abs(total - 1) < 1e-9, `shares summed to ${total}`);
});

test("month-over-month delta, overall and per category", () => {
  const current = [txn({ id: "1", amount: -150, category: "dagligvarer" })];
  const previous = [txn({ id: "2", amount: -100, category: "dagligvarer" })];
  const stats = monthStats("2026-07", current, previous);
  assert.deepEqual(stats.delta, { totalIn: 0, totalOut: 50, net: -50 });
  const cat = stats.categoryDeltas.find((c) => c.category === "dagligvarer");
  assert.deepEqual(cat, {
    category: "dagligvarer",
    current: 150,
    previous: 100,
    delta: 50,
  });
});

test("delta is null with no previous month", () => {
  const stats = monthStats("2026-07", [txn({ id: "1", amount: -10 })]);
  assert.equal(stats.delta, null);
  assert.deepEqual(stats.categoryDeltas, []);
});

test("subscriptions and recurring rows are surfaced, excluded rows are not", () => {
  const txns = [
    txn({ id: "1", amount: -99, isSubscription: true }),
    txn({ id: "2", amount: -20, isRecurring: true }),
    txn({
      id: "3",
      amount: -500,
      isSubscription: true,
      excluded: true,
      reason: "transfer",
    }),
  ];
  const stats = monthStats("2026-07", txns);
  assert.equal(stats.subscriptions.length, 1);
  assert.equal(stats.subscriptions[0].id, "1");
  assert.equal(stats.recurring.length, 1);
  assert.equal(stats.recurring[0].id, "2");
});

test("subsAndRecurring merges the two lists without repeating a row", () => {
  const both = txn({
    id: "1",
    amount: -99,
    isSubscription: true,
    isRecurring: true,
    date: "2026-07-20",
  });
  const subOnly = txn({
    id: "2",
    amount: -20,
    isSubscription: true,
    date: "2026-07-05",
  });
  const recOnly = txn({
    id: "3",
    amount: -30,
    isRecurring: true,
    date: "2026-07-10",
  });

  const merged = subsAndRecurring(
    monthStats("2026-07", [both, subOnly, recOnly]),
  );
  assert.deepEqual(
    merged.map((t) => t.id),
    ["2", "3", "1"],
    "deduplicated and sorted by date",
  );
});

test("subsAndRecurring keys on the id alone", () => {
  const row = txn({
    id: "x",
    amount: -99,
    isSubscription: true,
    isRecurring: true,
  });
  assert.equal(subsAndRecurring(monthStats("2026-07", [row])).length, 1);
});

test("subscriptionGroups counts every row of a payee that is flagged anywhere", () => {
  const rent = (date: string, isRecurring = false) =>
    txn({
      id: date,
      amount: -6100,
      counterparty: "Theo leie",
      category: "husleie",
      date,
      isRecurring,
    });

  const [group] = subscriptionGroups([
    rent("2024-06-14", true),
    rent("2024-07-19"),
    rent("2024-08-15"),
  ]);
  assert.deepEqual(
    [group!.count, group!.total, group!.last],
    [3, 18300, "2024-08-15"],
  );

  assert.deepEqual(
    subscriptionGroups([rent("2024-06-14"), rent("2024-07-19")]),
    [],
  );

  const groups = subscriptionGroups([
    rent("2024-06-14", true),
    txn({
      id: "x",
      amount: -50,
      counterparty: "Rema 1000",
      date: "2024-06-15",
    }),
  ]);
  assert.deepEqual(
    groups.map((g) => g.name),
    ["Theo leie"],
  );
});

test("subscriptionGroups ignores excluded rows", () => {
  const groups = subscriptionGroups([
    txn({
      id: "1",
      amount: -99,
      counterparty: "Spotify",
      isSubscription: true,
      date: "2026-07-01",
    }),
    txn({
      id: "2",
      amount: -500,
      counterparty: "Spotify",
      excluded: true,
      reason: "transfer",
      date: "2026-07-02",
    }),
  ]);
  assert.deepEqual([groups[0]!.count, groups[0]!.total], [1, 99]);
});

test("subscriptionGroups sums the charges per name, newest category, latest date", () => {
  const groups = subscriptionGroups([
    txn({
      id: "1",
      amount: -99,
      counterparty: "Spotify",
      category: "diverse",
      date: "2026-06-01",
      isSubscription: true,
    }),
    txn({
      id: "2",
      amount: -99,
      counterparty: "Spotify",
      category: "underholdning",
      date: "2026-07-01",
    }),
    txn({
      id: "3",
      amount: -499,
      counterparty: "Telenor",
      category: "faste_utgifter",
      date: "2026-07-04",
      isSubscription: true,
    }),
    txn({
      id: "4",
      account: "Kredittkort",
      amount: -50,
      counterparty: null,
      description: "Varekjøp",
      category: "ukategorisert",
      date: "2026-07-09",
      isRecurring: true,
    }),
  ]);

  assert.deepEqual(groups, [
    {
      name: "Telenor",
      category: "faste_utgifter",
      count: 1,
      total: 499,
      latest: 499,
      last: "2026-07-04",
    },
    {
      name: "Spotify",
      category: "underholdning",
      count: 2,
      total: 198,
      latest: 99,
      last: "2026-07-01",
    },
    {
      name: "Varekjøp",
      category: "ukategorisert",
      count: 1,
      total: 50,
      latest: 50,
      last: "2026-07-09",
    },
  ]);
});

test("subscriptionGroups prices a group at its last payment, not its average", () => {
  const [risen] = subscriptionGroups([
    txn({
      id: "1",
      amount: -99,
      counterparty: "Spotify",
      date: "2026-05-01",
      isSubscription: true,
    }),
    txn({ id: "2", amount: -99, counterparty: "Spotify", date: "2026-06-01" }),
    txn({ id: "3", amount: -129, counterparty: "Spotify", date: "2026-07-01" }),
  ]);
  assert.deepEqual([risen!.latest, risen!.total], [129, 327]);

  const [split] = subscriptionGroups([
    txn({
      id: "1",
      amount: -60,
      counterparty: "Storage",
      date: "2026-07-01",
      isSubscription: true,
    }),
    txn({ id: "2", amount: -40, counterparty: "Storage", date: "2026-07-01" }),
    txn({ id: "3", amount: 10, counterparty: "Storage", date: "2026-07-01" }),
  ]);
  assert.deepEqual([split!.latest, split!.total], [90, 90]);

  const [reversed] = subscriptionGroups([
    txn({
      id: "1",
      amount: -129,
      counterparty: "Spotify",
      date: "2026-07-01",
      isSubscription: true,
    }),
    txn({ id: "2", amount: -99, counterparty: "Spotify", date: "2026-05-01" }),
  ]);
  assert.equal(reversed!.latest, 129);
});

test("subscriptionGroups nets a refund off its own group", () => {
  const groups = subscriptionGroups([
    txn({
      id: "1",
      amount: -300,
      counterparty: "HelloFresh",
      date: "2026-07-01",
      isSubscription: true,
    }),
    txn({
      id: "2",
      amount: 100,
      counterparty: "HelloFresh",
      date: "2026-07-05",
    }),
  ]);
  assert.deepEqual(groups, [
    {
      name: "HelloFresh",
      category: "dagligvarer",
      count: 2,
      total: 200,
      latest: -100,
      last: "2026-07-05",
    },
  ]);
});

test("spendTrend fits the drawn axis, holes included", () => {
  const p = (at: string, totalOut: number): SeriesPoint => ({
    at,
    totalIn: 0,
    totalOut,
  });

  assert.deepEqual(spendTrend([p("a", 100), p("b", 200), p("c", 300)]), {
    slope: 100,
    intercept: 100,
  });

  const fit = spendTrend([p("a", 0), p("b", 0), p("c", 300)])!;
  assert.equal(Math.round(fit.slope), 150);
  assert.equal(Math.round(fit.intercept), -50);

  assert.equal(
    spendTrend([p("a", 0), ...Array(11).fill(null), p("b", 1200)])!.slope,
    100,
  );

  assert.equal(spendTrend([p("a", 50), p("b", 50)])?.slope, 0);
  assert.equal(spendTrend([p("a", 1)]), null);
  assert.equal(spendTrend([null, p("a", 1), null]), null);
  assert.equal(spendTrend([]), null);
});

test("spendTrend never reads income", () => {
  const fit = spendTrend([
    { at: "2026-01", totalIn: 300, totalOut: 100 },
    { at: "2026-02", totalIn: 200, totalOut: 200 },
    { at: "2026-03", totalIn: 100, totalOut: 300 },
  ]);
  assert.deepEqual(fit, { slope: 100, intercept: 100 });
});

test("withGaps keeps every calendar month between the first and the last", () => {
  const m = (at: string): SeriesPoint => ({ at, totalIn: 0, totalOut: 0 });

  const gapped = withGaps([m("2025-05"), m("2025-08")]);
  assert.deepEqual(
    gapped.map((x) => x?.at ?? null),
    ["2025-05", null, null, "2025-08"],
  );

  assert.deepEqual(
    withGaps([m("2024-11"), m("2025-02")]).map((x) => x?.at ?? null),
    ["2024-11", null, null, "2025-02"],
  );

  assert.deepEqual(
    withGaps([m("2026-01"), m("2026-02")]).map((x) => x?.at),
    ["2026-01", "2026-02"],
  );
  assert.equal(withGaps([m("2026-01")]).length, 1);
  assert.deepEqual(withGaps([]), []);

  assert.deepEqual(
    withGaps([m("2025-08"), m("2025-05")]).map((x) => x?.at ?? null),
    ["2025-05", null, null, "2025-08"],
  );
});

test("dailySeries covers the whole range, spending or not", () => {
  const series = dailySeries(
    [
      txn({ id: "1", amount: -100, date: "2026-07-02" }),
      txn({ id: "2", amount: 500, date: "2026-07-04" }),
    ],
    "2026-07-01",
    "2026-07-05",
  );
  assert.deepEqual(
    series.map((p) => [p.at, p.totalOut, p.totalIn]),
    [
      ["2026-07-01", 0, 0],
      ["2026-07-02", 100, 0],
      ["2026-07-03", 0, 0],
      ["2026-07-04", 0, 500],
      ["2026-07-05", 0, 0],
    ],
  );
});

test("dailySeries stops on the real last day of a month, not the -31 bound", () => {
  const feb = dailySeries([], "2026-02-01", "2026-02-31");
  assert.equal(feb.length, 28);
  assert.equal(feb.at(-1)?.at, "2026-02-28");

  assert.equal(dailySeries([], "2024-02-01", "2024-02-31").length, 29);

  assert.equal(dailySeries([], "2025-12-30", "2026-01-02").length, 4);
  assert.deepEqual(dailySeries([], "2026-07-02", "2026-07-01"), []);
});

test("dailySeries skips excluded rows", () => {
  const [day] = dailySeries(
    [
      txn({
        id: "1",
        amount: -100,
        date: "2026-07-01",
        account: "Kredittkort",
      }),
      txn({ id: "2", amount: -50, date: "2026-07-01" }),
      txn({
        id: "3",
        amount: -9000,
        date: "2026-07-01",
        excluded: true,
        reason: "internal transfer",
      }),
    ],
    "2026-07-01",
    "2026-07-01",
  );
  assert.equal(day?.totalOut, 150);
});

test("cumulative runs the totals forward and never loses a øre over a long series", () => {
  const running = cumulative([
    { at: "2026-07-01", totalIn: 0, totalOut: 100.1 },
    { at: "2026-07-02", totalIn: 2000, totalOut: 0 },
    { at: "2026-07-03", totalIn: 0, totalOut: 50.2 },
  ]);
  assert.deepEqual(
    running.map((p) => [p.at, p.totalOut, p.totalIn]),
    [
      ["2026-07-01", 100.1, 0],
      ["2026-07-02", 100.1, 2000],
      ["2026-07-03", 150.3, 2000],
    ],
  );

  const tenth = Array.from({ length: 365 }, (_, i) => ({
    at: `d${i}`,
    totalIn: 0,
    totalOut: 0.1,
    cardOut: 0,
  }));
  assert.equal(cumulative(tenth).at(-1)?.totalOut, 36.5);

  assert.deepEqual(cumulative([]), []);
});

test("a cumulative series ends on the same numbers as totals()", () => {
  const txns = [
    txn({ id: "1", amount: -100.5, date: "2026-07-01" }),
    txn({ id: "2", amount: -49.5, date: "2026-07-03" }),
    txn({ id: "3", amount: 2000, date: "2026-07-04" }),
    txn({
      id: "4",
      amount: -900,
      date: "2026-07-31",
      excluded: true,
      reason: "internal transfer",
    }),
  ];
  const sums = totals(txns);
  const last = cumulative(dailySeries(txns, "2026-07-01", "2026-07-31")).at(-1);
  assert.equal(last?.totalOut, sums.totalOut);
  assert.equal(last?.totalIn, sums.totalIn);

  assert.equal(cumulative(monthlySeries(txns)).at(-1)?.totalOut, sums.totalOut);
});

test("yearStats builds a monthly series and per-category totals across the year", () => {
  const months = [
    {
      month: "2026-06",
      txns: [
        txn({
          id: "1",
          amount: -100,
          category: "dagligvarer",
          date: "2026-06-10",
        }),
      ],
    },
    {
      month: "2026-07",
      txns: [
        txn({
          id: "2",
          amount: -200,
          category: "dagligvarer",
          date: "2026-07-10",
        }),
        txn({
          id: "3",
          account: "Kredittkort",
          amount: -100,
          category: "kort",
          counterparty: null,
          date: "2026-07-11",
        }),
      ],
    },
  ];
  const stats = yearStats("2026", months);
  assert.deepEqual(
    stats.months.map((m) => m.month),
    ["2026-06", "2026-07"],
  );
  const dagligvarer = stats.categories.find(
    (c) => c.category === "dagligvarer",
  );
  assert.equal(dagligvarer?.total, 300);
  assert.equal(stats.averageMonth.totalOut, 200);
});

test("subcategories share within their own parent, not across the page", () => {
  const s = monthStats("2026-07", [
    txn({
      id: "1",
      amount: -300,
      category: "kafe_og_restaurant",
      subcategory: "fastfood",
    }),
    txn({
      id: "2",
      amount: -100,
      category: "kafe_og_restaurant",
      subcategory: "kafe",
    }),
    txn({
      id: "3",
      amount: -600,
      category: "dagligvarer",
      subcategory: "dagligvarer",
    }),
  ]);
  assert.equal(
    s.categories.reduce((n, c) => n + c.share, 0),
    1,
  );

  const eating = s.subcategories.filter(
    (x) => x.category === "kafe_og_restaurant",
  );
  assert.deepEqual(
    eating.map((x) => [x.subcategory, x.total, x.share]),
    [
      ["fastfood", 300, 0.75],
      ["kafe", 100, 0.25],
    ],
  );
  assert.equal(
    s.subcategories.filter((x) => x.category === "dagligvarer")[0]!.share,
    1,
  );
});

test("a row with no subcategory is a slice of its parent, not a missing one", () => {
  const s = monthStats("2026-07", [
    txn({ id: "1", amount: -100, category: "vipps", subcategory: null }),
    txn({ id: "2", amount: -300, category: "vipps", subcategory: null }),
  ]);
  assert.deepEqual(s.subcategories, [
    { category: "vipps", subcategory: null, total: 400, share: 1 },
  ]);
  assert.equal(
    s.subcategories.reduce((n, x) => n + x.total, 0),
    s.categories.reduce((n, c) => n + c.total, 0),
  );
});

test("income and excluded rows stay out of the subcategory totals, as they do the categories", () => {
  const s = monthStats("2026-07", [
    txn({
      id: "1",
      amount: -100,
      category: "dagligvarer",
      subcategory: "dagligvarer",
    }),
    txn({ id: "2", amount: 5000, category: "innskudd", subcategory: "lonn" }),
    txn({
      id: "3",
      amount: -900,
      category: "overfoering",
      subcategory: null,
      excluded: true,
      reason: "internal transfer",
    }),
  ]);
  assert.deepEqual(s.subcategories, [
    {
      category: "dagligvarer",
      subcategory: "dagligvarer",
      total: 100,
      share: 1,
    },
  ]);
});

test("the income breakdowns are the spending ones over the other sign, and the two never mix", () => {
  const s = monthStats("2026-07", [
    txn({
      id: "1",
      amount: -100,
      category: "dagligvarer",
      subcategory: "dagligvarer",
    }),
    txn({
      id: "2",
      amount: 5000,
      account: "Brukskonto",
      counterparty: "Arbeidsgiver",
      category: "innskudd",
      subcategory: "lonn",
    }),
    txn({
      id: "3",
      amount: 1000,
      account: "Sparekonto",
      counterparty: "Mor",
      category: "innskudd",
      subcategory: "familie",
    }),
    txn({
      id: "4",
      amount: 900,
      category: "overfoering",
      excluded: true,
      reason: "internal transfer",
    }),
  ]);

  assert.deepEqual(s.incomeCategories, [
    { category: "innskudd", total: 6000, share: 1 },
  ]);
  assert.deepEqual(s.incomeSubcategories, [
    { category: "innskudd", subcategory: "lonn", total: 5000, share: 0.8333 },
    {
      category: "innskudd",
      subcategory: "familie",
      total: 1000,
      share: 0.1667,
    },
  ]);
  assert.deepEqual(s.incomeAccounts, [
    { account: "Brukskonto", total: 5000, share: 0.8333 },
    { account: "Sparekonto", total: 1000, share: 0.1667 },
  ]);
  assert.deepEqual(
    s.topIncomeCounterparties.map((c) => [c.counterparty, c.total, c.count]),
    [
      ["Arbeidsgiver", 5000, 1],
      ["Mor", 1000, 1],
    ],
  );

  assert.deepEqual(s.categories, [
    { category: "dagligvarer", total: 100, share: 1 },
  ]);
  assert.deepEqual(s.accounts, [
    { account: "Brukskonto", total: 100, share: 1 },
  ]);
  assert.equal(
    s.topIncomeCounterparties.some((c) => c.counterparty === "Kiwi"),
    false,
  );
  assert.equal(s.totalIn, 6000);
  assert.equal(s.totalOut, 100);
});
