import assert from "node:assert/strict";
import { test } from "node:test";
import { spendingInsights } from "../../src/core/insights.ts";
import type { Categorized } from "../../src/core/types.ts";

const txn = (
  partial: Partial<Categorized> & { id: string; amount: number; date: string },
): Categorized => ({
  account: "Card",
  accountKey: "card",
  card: true,
  description: "Purchase",
  counterparty: "Kiwi",
  country: "Norway",
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
  category: "groceries",
  subcategory: null,
  ...partial,
});

test("ranks merchants by transactions and spending with stable tie breaks", () => {
  const insights = spendingInsights([
    txn({ id: "1", amount: -100, date: "2026-09-01", counterparty: "Kiwi" }),
    txn({ id: "2", amount: -50, date: "2026-09-02", counterparty: "Kiwi" }),
    txn({ id: "3", amount: -500, date: "2026-09-03", counterparty: "Meny" }),
    txn({ id: "4", amount: -150, date: "2026-09-04", counterparty: "Rema" }),
    txn({ id: "5", amount: -25, date: "2026-09-05", counterparty: "Rema" }),
  ]);
  assert.deepEqual(
    insights.topByTransactions.map((merchant) => merchant.merchant),
    ["Rema", "Kiwi", "Meny"],
  );
  assert.deepEqual(
    insights.topBySpend.map((merchant) => merchant.merchant),
    ["Meny", "Rema", "Kiwi"],
  );
  assert.deepEqual(
    [insights.transactionCount, insights.merchantCount, insights.total],
    [5, 3, 825],
  );
});

test("uses the description when a transaction has no counterparty", () => {
  const [merchant] = spendingInsights([
    txn({
      id: "1",
      amount: -12.5,
      date: "2026-09-01",
      counterparty: null,
      description: "Local kiosk",
    }),
  ]).merchants;
  assert.equal(merchant?.merchant, "Local kiosk");
  assert.equal(merchant?.average, 12.5);
});

test("ignores income, zero amounts, and excluded transfers", () => {
  const insights = spendingInsights([
    txn({ id: "out", amount: -10, date: "2026-09-01" }),
    txn({ id: "in", amount: 50, date: "2026-09-01" }),
    txn({ id: "zero", amount: 0, date: "2026-09-01" }),
    txn({ id: "excluded", amount: -1000, date: "2026-09-01", excluded: true }),
  ]);
  assert.equal(insights.transactionCount, 1);
  assert.equal(insights.total, 10);
});

test("keeps debit spending in rankings but not in purchase-date habits", () => {
  const insights = spendingInsights([
    txn({ id: "1", amount: -10, date: "2026-09-21", card: false }),
    txn({ id: "2", amount: -20, date: "2026-09-22", card: true }),
  ]);
  assert.equal(insights.transactionCount, 2);
  assert.equal(insights.merchants[0]?.count, 2);
  assert.equal(insights.merchants[0]?.activeDays, 1);
  assert.equal(insights.weekdays[0]?.count, 0);
  assert.equal(insights.weekdays[1]?.count, 1);
});

test("counts one merchant visit per date instead of one per charge", () => {
  const insights = spendingInsights([
    txn({ id: "1", amount: -10, date: "2026-09-19" }),
    txn({ id: "2", amount: -20, date: "2026-09-19" }),
  ]);
  assert.equal(insights.transactionCount, 2);
  assert.equal(insights.weekdays[5]?.count, 1);
  assert.equal(insights.merchants[0]?.activeDays, 1);
});

test("projects expected returns on or after the requested date", () => {
  const [habit] = spendingInsights(
    [
      txn({ id: "1", amount: -10, date: "2026-08-01" }),
      txn({ id: "2", amount: -10, date: "2026-08-08" }),
      txn({ id: "3", amount: -10, date: "2026-08-15" }),
    ],
    "2026-09-22",
  ).merchants;
  assert.equal(habit?.returnPattern?.expectedNext, "2026-09-26");
});

test("reports weekday leaders and shares from unique visit days", () => {
  const insights = spendingInsights([
    txn({ id: "1", amount: -10, date: "2026-09-21", counterparty: "A" }),
    txn({ id: "2", amount: -20, date: "2026-09-21", counterparty: "A" }),
    txn({ id: "3", amount: -30, date: "2026-09-21", counterparty: "B" }),
    txn({ id: "4", amount: -40, date: "2026-09-22", counterparty: "B" }),
  ]);
  assert.deepEqual(insights.weekdays[0], {
    weekday: "Monday",
    count: 2,
    total: 60,
    share: 2 / 3,
    topMerchant: "A",
    topMerchantCount: 1,
  });
  assert.equal(insights.weekdays[1]?.weekday, "Tuesday");
  assert.equal(insights.weekdays[1]?.count, 1);
});

test("deduplicates visit days before it calculates return gaps", () => {
  const [habit] = spendingInsights([
    txn({ id: "1", amount: -10, date: "2026-01-01" }),
    txn({ id: "2", amount: -20, date: "2026-01-01" }),
    txn({ id: "3", amount: -30, date: "2026-01-08" }),
    txn({ id: "4", amount: -40, date: "2026-01-22" }),
    txn({ id: "5", amount: -50, date: "2026-02-05" }),
  ]).merchants;
  assert.equal(habit?.count, 5);
  assert.equal(habit?.activeDays, 4);
  assert.deepEqual(habit?.returnPattern, {
    medianDays: 14,
    lowDays: 14,
    highDays: 14,
    expectedNext: "2026-02-19",
    active: true,
  });
});

test("advances active forecasts beyond the latest selected transaction", () => {
  const habits = spendingInsights([
    txn({ id: "1", amount: -10, date: "2026-01-01", counterparty: "Active" }),
    txn({ id: "2", amount: -10, date: "2026-01-08", counterparty: "Active" }),
    txn({ id: "3", amount: -10, date: "2026-01-15", counterparty: "Active" }),
    txn({ id: "4", amount: -10, date: "2026-01-22", counterparty: "Other" }),
  ]).merchants;
  const active = habits.find((habit) => habit.merchant === "Active");
  assert.equal(active?.returnPattern?.expectedNext, "2026-01-22");
  assert.equal(active?.returnPattern?.active, true);
});

test("marks a forecast inactive when the merchant has gone stale", () => {
  const habits = spendingInsights([
    txn({ id: "1", amount: -10, date: "2025-01-01", counterparty: "Old" }),
    txn({ id: "2", amount: -10, date: "2025-01-08", counterparty: "Old" }),
    txn({ id: "3", amount: -10, date: "2025-01-15", counterparty: "Old" }),
    txn({
      id: "4",
      amount: -10,
      date: "2026-01-01",
      counterparty: "Current",
    }),
  ]).merchants;
  const old = habits.find((habit) => habit.merchant === "Old");
  assert.equal(old?.returnPattern?.active, false);
});

test("requires three distinct visit days before predicting a return", () => {
  const [habit] = spendingInsights([
    txn({ id: "1", amount: -10, date: "2026-01-01" }),
    txn({ id: "2", amount: -20, date: "2026-01-08" }),
  ]).merchants;
  assert.equal(habit?.returnPattern, null);
});

test("finds a merchant's dominant category and weekday", () => {
  const [habit] = spendingInsights([
    txn({ id: "1", amount: -10, date: "2026-09-21", category: "coffee" }),
    txn({ id: "2", amount: -20, date: "2026-09-28", category: "coffee" }),
    txn({ id: "3", amount: -30, date: "2026-10-06", category: "food" }),
  ]).merchants;
  assert.equal(habit?.favoriteWeekday, "Monday");
  assert.equal(habit?.favoriteWeekdayCount, 2);
  assert.equal(habit?.topCategory, "coffee");
});

test("counts Friday through Sunday as weekend visit days", () => {
  const [habit] = spendingInsights([
    txn({ id: "1", amount: -10, date: "2026-04-24" }),
    txn({ id: "2", amount: -20, date: "2026-04-26" }),
    txn({ id: "3", amount: -30, date: "2026-05-30" }),
    txn({ id: "4", amount: -40, date: "2026-08-18" }),
    txn({ id: "5", amount: -50, date: "2026-08-18" }),
  ]).merchants;
  assert.equal(habit?.activeDays, 4);
  assert.equal(habit?.weekendVisitCount, 3);
});

test("returns seven empty weekday rows for an empty selection", () => {
  const insights = spendingInsights([]);
  assert.equal(insights.weekdays.length, 7);
  assert.ok(insights.weekdays.every((day) => day.count === 0));
  assert.deepEqual(insights.merchants, []);
});
