import assert from "node:assert/strict";
import { test } from "node:test";
import { reconcile, unexplained } from "./reconcile.ts";
import type { Txn } from "./types.ts";

function txn(over: Partial<Txn>): Txn {
  return {
    id: "1",
    account: "A",
    accountKey: "a",
    date: "2026-07-01",
    amount: -100,
    description: "Rema 1000",
    counterparty: "Rema 1000",
    bankCategory: null,
    bankSub: null,
    bankCategoryName: null,
    bankSubName: null,
    bankConfidence: null,
    typeText: "VISA Varekjøp",
    remoteAccountNumber: null,
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

/**
 * SB1 serves no history before 2003, so an account older than that holds money
 * no row accounts for. `opening` is what closes it — 3 610,50 on the real
 * Sparekonto, whose first row is a 100 kr standing transfer in 2011.
 */
test("an opening balance closes a gap the history cannot reach", () => {
  const rows = [txn({ id: "1", accountKey: "a", amount: 100 })];
  const balance = new Map([["a", 3710.5]]);

  // Without it, the money is there and nothing explains it.
  const before = reconcile(rows, { a: { mine: true, name: "A" } }, balance);
  assert.equal(before[0].gap, 3610.5);
  assert.equal(unexplained(before).length, 1);

  // With it, the account adds up.
  const after = reconcile(
    rows,
    { a: { mine: true, name: "A", opening: 3610.5 } },
    balance,
  );
  assert.equal(after[0].expected, 3710.5);
  assert.equal(after[0].gap, 0);
  assert.deepEqual(unexplained(after), []);
});

/**
 * A balance question, not a spending one. `reconcile` is handed `Txn`, before
 * anything is flagged, precisely so no exclusion rule can hide a hole from the
 * one check that looks outside the repo for its answer.
 */
test("every row counts, including the ones the totals exclude", () => {
  // An internal transfer: money really did leave a and arrive at b.
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
    // 0.1 + 0.2 is 0.30000000000000004 in binary floating point.
    new Map([["a", 0.3]]),
  );
  assert.equal(lines[0].gap, 0);
});

test("an account the bank reported no balance for is left out", () => {
  // `issuer` and `investment` entries exist for their number alone — there is
  // no balance to check them against and no rows of their own.
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
