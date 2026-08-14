/**
 * Storage for `Categorized` rows, over node:sqlite. The database is derived
 * and disposable: deleting it must never lose anything, and `rebuild` must
 * reconstruct it from whatever the caller re-derives from data/raw/ alone.
 */
import { DatabaseSync } from "node:sqlite";
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

/** Booking date is YYYY-MM-DD Europe/Oslo already, so this is a plain slice. */
function monthOf(date: string): string {
  return date.slice(0, 7);
}

export function openDb(path = "data/banking.db"): DatabaseSync {
  const db = new DatabaseSync(path);
  db.exec(SCHEMA);
  return db;
}

const UPSERT = `
INSERT INTO transactions
  (id, accountKey, account, date, month, amount, description, counterparty,
   bankCategory, bankSub, bankCategoryName, bankSubName, bankConfidence,
   typeText, remoteAccountNumber, isRecurring, isSubscription, excluded, reason, category, subcategory)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
ON CONFLICT (id) DO UPDATE SET
  accountKey = excluded.accountKey,
  account = excluded.account,
  date = excluded.date,
  month = excluded.month,
  amount = excluded.amount,
  description = excluded.description,
  counterparty = excluded.counterparty,
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

/** Inclusive on both ends. Months are YYYY-MM, so string comparison sorts correctly. */
export function queryRange(
  db: DatabaseSync,
  fromMonth: string,
  toMonth: string,
): Categorized[] {
  const rows = db
    .prepare(
      "SELECT * FROM transactions WHERE month >= ? AND month <= ? ORDER BY month, date, id",
    )
    .all(fromMonth, toMonth) as unknown as Row[];
  return rows.map(toCategorized);
}

/**
 * Wipes and reloads. Unlike upsertMany, this also removes rows no longer
 * produced by the pipeline (e.g. a transaction dropped from a re-synced
 * month) — the caller re-derives `rows` from data/raw/ before calling this.
 */
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
