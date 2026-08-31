import assert from "node:assert/strict";
import { test } from "node:test";
import { reconcile, unexplained } from "../../src/core/reconcile.ts";
import type { Txn } from "../../src/core/types.ts";

function txn(over: Partial<Txn>): Txn {
  return {
    id: "1",
    account: "A",
    accountKey: "a",
    date: "2026-07-01",
    amount: -100,
    description: "Rema 1000",
    counterparty: "Rema 1000",
    country: null,
    bankCategory: null,
    bankSub: null,
    bankCategoryName: null,
    bankSubName: null,
    bankConfidence: null,
    typeText: "VISA Varekjøp",
    remoteAccountNumber: null,
    isPending: false,
    isRecurring: false,
    isSubscription: false,
    ...over,
  };
}

test("an account whose rows explain its balance has no gap", () => {
  const lines = reconcile(
    [
      txn({ id: "1", accountKey: "a", amount: 500 }),
      txn({ id: "2", accountKey: "a", amount: -200 }),
    ],
    { a: { mine: true, name: "A" } },
    new Map([["a", 300]]),
  );
  assert.deepEqual(
    lines.map((l) => [l.rows, l.expected, l.actual, l.gap]),
    [[300, 300, 300, 0]],
  );
  assert.deepEqual(unexplained(lines), []);
});

test("an opening balance closes a gap the history cannot reach", () => {
  const rows = [txn({ id: "1", accountKey: "a", amount: 100 })];
  const balance = new Map([["a", 3710.5]]);

  const before = reconcile(rows, { a: { mine: true, name: "A" } }, balance);
  assert.equal(before[0].gap, 3610.5);
  assert.equal(unexplained(before).length, 1);

  const after = reconcile(
    rows,
    { a: { mine: true, name: "A", opening: 3610.5 } },
    balance,
  );
  assert.equal(after[0].expected, 3710.5);
  assert.equal(after[0].gap, 0);
  assert.deepEqual(unexplained(after), []);
});

test("every row counts, including the ones the totals exclude", () => {
  const lines = reconcile(
    [
      txn({ id: "1", accountKey: "a", amount: -500, typeText: "Overføring" }),
      txn({ id: "2", accountKey: "b", amount: 500, typeText: "Overføring" }),
    ],
    { a: { mine: true, name: "A" }, b: { mine: true, name: "B" } },
    new Map([
      ["a", -500],
      ["b", 500],
    ]),
  );
  assert.deepEqual(unexplained(lines), []);
});

test("a float residue is not a discrepancy", () => {
  const lines = reconcile(
    [
      txn({ id: "1", accountKey: "a", amount: 0.1 }),
      txn({ id: "2", accountKey: "a", amount: 0.2 }),
    ],
    { a: { mine: true, name: "A" } },
    new Map([["a", 0.3]]),
  );
  assert.equal(lines[0].gap, 0);
});

test("an account the bank reported no balance for is left out", () => {
  const lines = reconcile(
    [txn({ id: "1", accountKey: "a", amount: 10 })],
    { a: { mine: true, name: "A" }, issuer: { mine: false, number: "99" } },
    new Map([["a", 10]]),
  );
  assert.deepEqual(
    lines.map((l) => l.name),
    ["A"],
  );
});
