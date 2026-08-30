import assert from "node:assert/strict";
import { test } from "node:test";
import {
  monthStats,
  subsAndRecurring,
  subscriptionGroups,
  totals,
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
