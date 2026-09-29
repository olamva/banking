import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { openDb, queryRange, rebuild } from "../../src/core/db.ts";
import type { Categorized } from "../../src/core/types.ts";

function row(overrides: Partial<Categorized> = {}): Categorized {
  return {
    id: "a1",
    account: "Brukskonto",
    accountKey: "acc1",
    card: false,
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
    isPending: false,
    isRecurring: false,
    isSubscription: false,
    excluded: false,
    reason: null,
    category: "dagligvarer",
    subcategory: null,
    ...overrides,
  };
}

test("the card account flag round-trips", () => {
  const db = openDb(":memory:");
  rebuild(db, [row({ card: true })]);
  assert.equal(queryRange(db, "2026-07", "2026-07")[0]?.card, true);
  db.close();
});

test('a repeated id keeps its last row, "excluded" included despite the ON CONFLICT excluded.* alias', () => {
  const db = openDb(":memory:");
  rebuild(db, [
    row({ amount: -50, excluded: false, reason: null }),
    row({ amount: -55, excluded: true, reason: "internal transfer" }),
  ]);
  assert.deepEqual(queryRange(db, "2026-07", "2026-07"), [
    row({ amount: -55, excluded: true, reason: "internal transfer" }),
  ]);
  db.close();
});

test("queryRange over a single month filters strictly to it", () => {
  const db = openDb(":memory:");
  rebuild(db, [
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
  rebuild(db, [
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
  rebuild(db, [row({ id: "stale" })]);
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
    rebuild(first, [row()]);
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

test("openDb adds the pending flag to an existing database", () => {
  const dir = mkdtempSync(join(tmpdir(), "banking-db-test-"));
  const path = join(dir, "banking.db");
  try {
    const legacy = openDb(path);
    rebuild(legacy, [row()]);
    legacy.exec("ALTER TABLE transactions DROP COLUMN isPending");
    legacy.close();
    const upgraded = openDb(path);
    assert.deepEqual(queryRange(upgraded, "2026-07", "2026-07"), [row()]);
    rebuild(upgraded, [row({ isPending: true })]);
    assert.deepEqual(queryRange(upgraded, "2026-07", "2026-07"), [
      row({ isPending: true }),
    ]);
    upgraded.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a failed database write preserves the previous rows", (t) => {
  const db = openDb(":memory:");
  t.after(() => db.close());
  const original = row();
  rebuild(db, [original]);
  assert.throws(
    () =>
      rebuild(db, [
        row({ amount: -50 }),
        row({ id: "invalid", amount: null as unknown as number }),
      ]),
    /NOT NULL/,
  );
  assert.deepEqual(queryRange(db, "2026-07", "2026-07"), [original]);
  rebuild(db, []);
  assert.deepEqual(queryRange(db, "2026-07", "2026-07"), []);
});

// SB1 mints a new id for a transaction every time the code fetches it. A sort
// that breaks a tie on id therefore reshuffles one day's rows on every refresh.
test("rows on one date keep their order when every id changes", () => {
  const day = "2026-07-15";
  const three = (ids: [string, string, string]) => [
    row({ id: ids[0], date: day, amount: -50, description: "Rema" }),
    row({ id: ids[1], date: day, amount: -20, description: "Narvesen" }),
    row({ id: ids[2], date: day, amount: -90, description: "Coop" }),
  ];
  const seen = (rows: ReturnType<typeof three>) => {
    const db = openDb(":memory:");
    rebuild(db, rows);
    const out = queryRange(db, "2026-07", "2026-07").map((t) => t.description);
    db.close();
    return out;
  };

  const first = seen(three(["zzz", "mmm", "aaa"]));
  const second = seen(three(["aaa", "zzz", "mmm"]));
  assert.deepEqual(second, first);
  assert.equal(new Set(first).size, 3, "all three rows survive");
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
    originalCounterparty: "",
    categorySource: "Remembered category",
  });
  rebuild(db, [populated]);
  assert.deepEqual(queryRange(db, "2026-07", "2026-07"), [populated]);
  db.close();
});
