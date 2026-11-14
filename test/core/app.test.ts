import assert from "node:assert/strict";
import { test } from "node:test";
import { appData, appPeriod } from "../../src/core/app.ts";
import { NO_FILTERS } from "../../src/core/select.ts";
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
const at = (key: string) => data.periods.find((p) => p.key === key)!;
const october = at("2026-10");

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
  assert.equal(october.series.spent.length, 12);
  assert.equal(october.series.spent.at(-1), october.totalOut);
  assert.equal(october.series.income.at(-1), october.totalIn);
  assert.equal(at("2025-10").series.spent.length, 31);
});

test("all time sums each month, and an empty month counts as zero", () => {
  const all = at("all");
  assert.equal(all.series.bucket, "month");
  assert.equal(all.series.start, "2025-10");
  assert.equal(all.series.spent.length, 13);
  assert.equal(all.series.spent[1], 0);
  assert.equal(all.totalOut, at("2025").totalOut + at("2026").totalOut);
});

test("a custom range keeps only its own days", () => {
  const range = appPeriod("2026-10-01..2026-10-05", rows, "2026-10-12");
  assert.equal(range.kind, "custom");
  assert.equal(range.totalOut, 250.45);
  assert.equal(range.totalIn, 40.2);
  assert.equal(range.compared, null);
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

test("only counted rows with an imported payee offer a category pattern", () => {
  const typed = appData(
    [
      txn("2026-10-02", -10, { originalCounterparty: " KIWI 123 " }),
      txn("2026-10-03", -20, { originalCounterparty: "KIWI", excluded: true }),
      txn("2026-10-04", -30, { originalCounterparty: "" }),
    ],
    {},
    "2026-10-12",
    "now",
  );
  assert.deepEqual(
    typed.txns.map((t) => t.remember),
    [null, null, "kiwi 123"],
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

test("each period keeps the insights of its own spending", () => {
  assert.equal(at("2025").insights.transactionCount, 2);
  assert.equal(at("2026").insights.transactionCount, 2);
  assert.equal(at("all").insights.transactionCount, 4);
});

test("filters narrow a period and its comparison, and keep the excluded note", () => {
  const kiwi = appPeriod("2026-10", rows, "2026-10-12", {
    ...NO_FILTERS,
    merchants: ["Kiwi"],
  });
  assert.equal(kiwi.totalOut, 250.45);
  assert.equal(kiwi.totalIn, 40.2);
  assert.equal(kiwi.delta?.totalOut, 250.45 - 100.1);
  assert.deepEqual(kiwi.prev, { from: "2025-10-01", to: "2025-10-12" });
  assert.deepEqual(kiwi.subscriptions, []);
  assert.deepEqual(kiwi.excluded, { count: 1, total: 5000 });
  const none = appPeriod("2026-10", rows, "2026-10-12", {
    ...NO_FILTERS,
    merchantsOut: ["Kiwi", "Spotify"],
  });
  assert.equal(none.totalOut, 0);
  assert.equal(none.compared, "this time last year");
});
