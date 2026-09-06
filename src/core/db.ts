import { DatabaseSync } from "node:sqlite";
import { DB_FILE } from "./paths.ts";
import type { Categorized } from "./types.ts";

const SCHEMA = `
CREATE TABLE IF NOT EXISTS transactions (
  id TEXT NOT NULL,
  accountKey TEXT NOT NULL,
  account TEXT NOT NULL,
  date TEXT NOT NULL,
  month TEXT NOT NULL,
  amount REAL NOT NULL,
  description TEXT NOT NULL,
  counterparty TEXT,
  originalCounterparty TEXT,
  categorySource TEXT,
  country TEXT,
  bankCategory TEXT,
  bankSub TEXT,
  bankCategoryName TEXT,
  bankSubName TEXT,
  bankConfidence INTEGER,
  typeText TEXT,
  remoteAccountNumber TEXT,
  isPending INTEGER NOT NULL DEFAULT 0,
  isRecurring INTEGER NOT NULL,
  isSubscription INTEGER NOT NULL,
  excluded INTEGER NOT NULL,
  reason TEXT,
  category TEXT NOT NULL,
  subcategory TEXT,
  PRIMARY KEY (id)
);
CREATE INDEX IF NOT EXISTS idx_transactions_month ON transactions(month);
CREATE INDEX IF NOT EXISTS idx_transactions_category ON transactions(category, subcategory);
`;

export function openDb(path = DB_FILE): DatabaseSync {
  const db = new DatabaseSync(path);
  db.exec(SCHEMA);
  const columns = db.prepare("PRAGMA table_info(transactions)").all() as {
    name: string;
  }[];
  if (!columns.some(({ name }) => name === "isPending"))
    db.exec(
      "ALTER TABLE transactions ADD COLUMN isPending INTEGER NOT NULL DEFAULT 0",
    );
  for (const field of ["originalCounterparty", "categorySource"])
    if (!columns.some(({ name }) => name === field))
      db.exec(`ALTER TABLE transactions ADD COLUMN ${field} TEXT`);
  return db;
}

const COLUMNS = [
  "id",
  "accountKey",
  "account",
  "date",
  "amount",
  "description",
  "counterparty",
  "originalCounterparty",
  "categorySource",
  "country",
  "bankCategory",
  "bankSub",
  "bankCategoryName",
  "bankSubName",
  "bankConfidence",
  "typeText",
  "remoteAccountNumber",
  "isPending",
  "isRecurring",
  "isSubscription",
  "excluded",
  "reason",
  "category",
  "subcategory",
] as const satisfies readonly (keyof Categorized)[];

const UPSERT = `
INSERT INTO transactions (${COLUMNS.join(", ")}, month)
VALUES (${COLUMNS.map(() => "?").join(", ")}, ?)
ON CONFLICT (id) DO UPDATE SET
  ${[...COLUMNS, "month"]
    .filter((key) => key !== "id")
    .map((key) => `${key} = excluded.${key}`)
    .join(", ")}
`;

export function upsertMany(
  db: DatabaseSync,
  rows: Categorized[],
  clear = false,
): void {
  const stmt = db.prepare(UPSERT);
  db.exec("BEGIN");
  try {
    if (clear) db.exec("DELETE FROM transactions");
    for (const row of rows)
      stmt.run(
        row.id,
        row.accountKey,
        row.account,
        row.date,
        row.amount,
        row.description,
        row.counterparty,
        row.originalCounterparty ?? null,
        row.categorySource ?? null,
        row.country,
        row.bankCategory,
        row.bankSub,
        row.bankCategoryName,
        row.bankSubName,
        row.bankConfidence,
        row.typeText,
        row.remoteAccountNumber,
        row.isPending ? 1 : 0,
        row.isRecurring ? 1 : 0,
        row.isSubscription ? 1 : 0,
        row.excluded ? 1 : 0,
        row.reason,
        row.category,
        row.subcategory,
        row.date.slice(0, 7),
      );
    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
}

// SB1 changes IDs on each fetch. Sort by content first to keep each day in a stable order.
const ORDER = "ORDER BY month, date, accountKey, amount, description, id";

export function queryRange(
  db: DatabaseSync,
  fromMonth: string,
  toMonth: string,
): Categorized[] {
  const rows = db
    .prepare(
      `SELECT ${COLUMNS.join(", ")} FROM transactions WHERE month >= ? AND month <= ? ${ORDER}`,
    )
    .all(fromMonth, toMonth) as unknown as Categorized[];
  for (const row of rows) {
    // SQLite returns objects with no prototype and stores flags as integers.
    Object.setPrototypeOf(row, Object.prototype);
    if (row.originalCounterparty === null) delete row.originalCounterparty;
    if (row.categorySource === null) delete row.categorySource;
    row.isPending = !!row.isPending;
    row.isRecurring = !!row.isRecurring;
    row.isSubscription = !!row.isSubscription;
    row.excluded = !!row.excluded;
  }
  return rows;
}

export function rebuild(db: DatabaseSync, rows: Categorized[]): void {
  upsertMany(db, rows, true);
}
