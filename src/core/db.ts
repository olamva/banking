import { DatabaseSync } from "node:sqlite";
import { DATA_DIR } from "./paths.ts";
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
  country TEXT,
  bankCategory TEXT,
  bankSub TEXT,
  bankCategoryName TEXT,
  bankSubName TEXT,
  bankConfidence INTEGER,
  typeText TEXT,
  remoteAccountNumber TEXT,
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

function monthOf(date: string): string {
  return date.slice(0, 7);
}

export function openDb(path = `${DATA_DIR}/banking.db`): DatabaseSync {
  const db = new DatabaseSync(path);
  db.exec(SCHEMA);
  return db;
}

const UPSERT = `
INSERT INTO transactions
  (id, accountKey, account, date, month, amount, description, counterparty, country,
   bankCategory, bankSub, bankCategoryName, bankSubName, bankConfidence,
   typeText, remoteAccountNumber, isRecurring, isSubscription, excluded, reason, category, subcategory)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
ON CONFLICT (id) DO UPDATE SET
  accountKey = excluded.accountKey,
  account = excluded.account,
  date = excluded.date,
  month = excluded.month,
  amount = excluded.amount,
  description = excluded.description,
  counterparty = excluded.counterparty,
  country = excluded.country,
  bankCategory = excluded.bankCategory,
  bankSub = excluded.bankSub,
  bankCategoryName = excluded.bankCategoryName,
  bankSubName = excluded.bankSubName,
  bankConfidence = excluded.bankConfidence,
  typeText = excluded.typeText,
  remoteAccountNumber = excluded.remoteAccountNumber,
  isRecurring = excluded.isRecurring,
  isSubscription = excluded.isSubscription,
  excluded = excluded.excluded,
  reason = excluded.reason,
  category = excluded.category,
  subcategory = excluded.subcategory
`;

function bindParams(row: Categorized) {
  return [
    row.id,
    row.accountKey,
    row.account,
    row.date,
    monthOf(row.date),
    row.amount,
    row.description,
    row.counterparty,
    row.country,
    row.bankCategory,
    row.bankSub,
    row.bankCategoryName,
    row.bankSubName,
    row.bankConfidence,
    row.typeText,
    row.remoteAccountNumber,
    row.isRecurring ? 1 : 0,
    row.isSubscription ? 1 : 0,
    row.excluded ? 1 : 0,
    row.reason,
    row.category,
    row.subcategory,
  ] as const;
}

export function upsertMany(db: DatabaseSync, rows: Categorized[]): void {
  const stmt = db.prepare(UPSERT);
  db.exec("BEGIN");
  try {
    for (const row of rows) stmt.run(...bindParams(row));
    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
}

type Row = {
  id: string;
  accountKey: string;
  account: string;
  date: string;
  amount: number;
  description: string;
  counterparty: string | null;
  country: string | null;
  bankCategory: string | null;
  bankSub: string | null;
  bankCategoryName: string | null;
  bankSubName: string | null;
  bankConfidence: number | null;
  typeText: string | null;
  remoteAccountNumber: string | null;
  isRecurring: number;
  isSubscription: number;
  excluded: number;
  reason: string | null;
  category: string;
  subcategory: string | null;
};

function toCategorized(row: Row): Categorized {
  return {
    id: row.id,
    accountKey: row.accountKey,
    account: row.account,
    date: row.date,
    amount: row.amount,
    description: row.description,
    counterparty: row.counterparty,
    country: row.country,
    bankCategory: row.bankCategory,
    bankSub: row.bankSub,
    bankCategoryName: row.bankCategoryName,
    bankSubName: row.bankSubName,
    bankConfidence: row.bankConfidence,
    typeText: row.typeText,
    remoteAccountNumber: row.remoteAccountNumber,
    isRecurring: !!row.isRecurring,
    isSubscription: !!row.isSubscription,
    excluded: !!row.excluded,
    reason: row.reason,
    category: row.category,
    subcategory: row.subcategory,
  };
}

// Both bounds are inclusive. A month is YYYY-MM, so a string compare sorts it.
// The tie-break is content, never id alone: SB1 mints a new id on every fetch,
// so ordering one day's rows by id reshuffles them after each sync. The page
// sorts by date only, and its sort is stable, so this order is what a reader
// sees inside a day.
const ORDER = "ORDER BY month, date, accountKey, amount, description, id";

export function queryRange(
  db: DatabaseSync,
  fromMonth: string,
  toMonth: string,
): Categorized[] {
  const rows = db
    .prepare(
      `SELECT * FROM transactions WHERE month >= ? AND month <= ? ${ORDER}`,
    )
    .all(fromMonth, toMonth) as unknown as Row[];
  return rows.map(toCategorized);
}

export function rebuild(db: DatabaseSync, rows: Categorized[]): void {
  db.exec("BEGIN");
  try {
    db.exec("DELETE FROM transactions");
    const stmt = db.prepare(UPSERT);
    for (const row of rows) stmt.run(...bindParams(row));
    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
}
