import assert from "node:assert/strict";
import { test } from "node:test";
import { appData } from "../../src/core/app.ts";
import { totals } from "../../src/core/stats.ts";
import type { Categorized } from "../../src/core/types.ts";

const txn = (
  date: string,
  amount: number,
  extra: Partial<Categorized> = {},
): Categorized => ({
  id: `${date}${amount}`,
  account: "Brukskonto",
  accountKey: "acc",
  date,
  amount,
  description: "KIWI 123 OSLO",
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
  ...extra,
});

const rows = [
  txn("2025-10-03", -100.1),
  txn("2025-10-20", -900),
  txn("2026-10-02", -250.45),
  txn("2026-10-05", 40.2),
  txn("2026-10-05", -5000, {
    excluded: true,
    reason: "Internal transfer",
    category: "overfoering",
  }),
  txn("2026-10-09", -99, { counterparty: "Spotify", isSubscription: true }),
];

const data = appData(rows, { dagligvarer: "Food" }, "2026-10-12", "now");
const october = data.months.find((m) => m.month === "2026-10")!;

test("a month reconciles with the totals of its rows to the øre", () => {
  const sum = totals(rows.filter((t) => t.date.startsWith("2026-10")));
  assert.equal(october.totalOut, sum.totalOut);
  assert.equal(october.totalIn, sum.totalIn);
  assert.equal(october.net, sum.net);
  assert.deepEqual(october.excluded, { count: 1, total: 5000 });
});

test("the current month compares with the same days last year", () => {
  assert.equal(october.compared, "this time last year");
  assert.equal(october.delta?.totalOut, 349.45 - 100.1);
});

test("the day series runs to today and ends on the month totals", () => {
  assert.equal(october.spentByDay.length, 12);
  assert.equal(october.spentByDay.at(-1), october.totalOut);
  assert.equal(october.incomeByDay.at(-1), october.totalIn);
  assert.equal(
    data.months.find((m) => m.month === "2025-10")!.spentByDay.length,
    31,
  );
});

test("excluded rows stay in the list with their reason", () => {
  assert.equal(data.txns.length, rows.length);
  assert.equal(data.txns[0]!.date, "2026-10-09");
  assert.equal(
    data.txns.find((t) => t.amount === -5000)!.excluded,
    "Internal transfer",
  );
  assert.deepEqual(
    october.subscriptions.map((s) => s.name),
    ["Spotify"],
  );
  assert.equal(data.labels.dagligvarer, "Food");
});

test("only counted rows with a payee and payment type offer a remembered category", () => {
  const typed = appData(
    [
      txn("2026-10-02", -10, { typeText: "Varekjøp" }),
      txn("2026-10-03", -20, { typeText: "Varekjøp", excluded: true }),
      txn("2026-10-04", -30),
    ],
    {},
    "2026-10-12",
    "now",
  );
  assert.deepEqual(
    typed.txns.map((t) => t.remember !== null),
    [false, false, true],
  );
});

test("the month compares categories with the period before it", () => {
  assert.deepEqual(
    october.changes.map((d) => [d.category, d.current, d.previous]),
    [["dagligvarer", 349.45, 100.1]],
  );
  assert.deepEqual(
    october.accounts.map((a) => a.account),
    ["Brukskonto"],
  );
});

test("each year keeps the insights of its own spending", () => {
  const year = (y: string) => data.years.find((d) => d.year === y)!.insights;
  assert.equal(year("2025").transactionCount, 2);
  assert.equal(year("2026").transactionCount, 2);
  assert.equal(data.insights.transactionCount, 4);
});
