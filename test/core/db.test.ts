import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { openDb, queryRange, rebuild, upsertMany } from "../../src/core/db.ts";
import type { Categorized } from "../../src/core/types.ts";

function row(overrides: Partial<Categorized> = {}): Categorized {
  return {
    id: "a1",
    account: "Brukskonto",
    accountKey: "acc1",
    date: "2026-07-15",
    amount: -100,
    description: "Coop",
    counterparty: "Coop",
    country: null,
    bankCategory: "dagligvarer",
    bankSub: null,
    bankCategoryName: null,
    bankSubName: null,
    bankConfidence: null,
    typeText: "VISA Varekjøp",
    remoteAccountNumber: null,
    isRecurring: false,
    isSubscription: false,
    excluded: false,
    reason: null,
    category: "dagligvarer",
    subcategory: null,
    ...overrides,
  };
}

test("upsertMany inserts, then updates in place on re-import", () => {
  const db = openDb(":memory:");
  upsertMany(db, [row({ amount: -50 })]);
  assert.deepEqual(queryRange(db, "2026-07", "2026-07"), [
    row({ amount: -50 }),
  ]);

  upsertMany(db, [row({ amount: -55 })]);
  const rows = queryRange(db, "2026-07", "2026-07");
  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.amount, -55);
  db.close();
});

test('the "excluded" column survives an update despite colliding with the ON CONFLICT excluded.* alias', () => {
  const db = openDb(":memory:");
  upsertMany(db, [row({ excluded: false, reason: null })]);
  upsertMany(db, [row({ excluded: true, reason: "internal transfer" })]);
  const [got] = queryRange(db, "2026-07", "2026-07");
  assert.equal(got?.excluded, true);
  assert.equal(got?.reason, "internal transfer");
  db.close();
});

test("the id is the whole key — SB1 does not reuse one across accounts", () => {
  const db = openDb(":memory:");
  upsertMany(db, [
    row({ account: "Brukskonto", id: "x" }),
    row({ account: "Kredittkort", id: "x" }),
  ]);
  const rows = queryRange(db, "2026-07", "2026-07");
  assert.equal(rows.length, 1);
  assert.equal(
    rows[0]?.account,
    "Kredittkort",
    "the later row wins, as any re-import does",
  );
  db.close();
});

test("queryRange over a single month filters strictly to it", () => {
  const db = openDb(":memory:");
  upsertMany(db, [
    row({ id: "jul", date: "2026-07-31" }),
    row({ id: "aug", date: "2026-08-01" }),
  ]);
  assert.deepEqual(
    queryRange(db, "2026-07", "2026-07").map((r) => r.id),
    ["jul"],
  );
  db.close();
});

test("queryRange is inclusive on both ends", () => {
  const db = openDb(":memory:");
  upsertMany(db, [
    row({ id: "jun", date: "2026-06-30" }),
    row({ id: "jul", date: "2026-07-15" }),
    row({ id: "aug", date: "2026-08-01" }),
  ]);
  assert.deepEqual(
    queryRange(db, "2026-06", "2026-07").map((r) => r.id),
    ["jun", "jul"],
  );
  db.close();
});

test("rebuild drops rows the new import no longer produces", () => {
  const db = openDb(":memory:");
  upsertMany(db, [row({ id: "stale" })]);
  rebuild(db, [row({ id: "fresh" })]);
  assert.deepEqual(
    queryRange(db, "2026-07", "2026-07").map((r) => r.id),
    ["fresh"],
  );
  db.close();
});

test("openDb on an existing file is idempotent and keeps prior data", () => {
  const dir = mkdtempSync(join(tmpdir(), "banking-db-test-"));
  const path = join(dir, "banking.db");
  try {
    const first = openDb(path);
    upsertMany(first, [row()]);
    first.close();

    const second = openDb(path); // schema already exists; must not throw or wipe rows
    assert.deepEqual(
      queryRange(second, "2026-07", "2026-07").map((r) => r.id),
      ["a1"],
    );
    second.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("the bank pair, its names and its confidence round-trip, subcategory included", () => {
  const db = openDb(":memory:");
  const populated = row({
    bankCategory: "helse_og_velvaere",
    bankSub: "apotek",
    bankCategoryName: "Helse og velvære",
    bankSubName: "Apotek",
    bankConfidence: 96,
    category: "helse_og_velvaere",
    subcategory: "apotek",
  });
  upsertMany(db, [populated]);
  assert.deepEqual(queryRange(db, "2026-07", "2026-07"), [populated]);
  db.close();
});
