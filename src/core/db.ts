/**
 * Storage for `Categorized` rows, over node:sqlite. The database is derived
 * and disposable: deleting it must never lose anything, and `rebuild` must
 * reconstruct it from whatever the caller re-derives from data/raw/ alone.
 */
import { DatabaseSync } from 'node:sqlite';
import type { Categorized, Source } from './types.ts';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS transactions (
  source TEXT NOT NULL,
  id TEXT NOT NULL,
  accountKey TEXT NOT NULL,
  date TEXT NOT NULL,
  month TEXT NOT NULL,
  amount REAL NOT NULL,
  description TEXT NOT NULL,
  counterparty TEXT,
  bankCategory TEXT,
  typeText TEXT,
  isRecurring INTEGER NOT NULL,
  isSubscription INTEGER NOT NULL,
  isPending INTEGER NOT NULL,
  excluded INTEGER NOT NULL,
  reason TEXT,
  category TEXT NOT NULL,
  PRIMARY KEY (source, id)
);
CREATE INDEX IF NOT EXISTS idx_transactions_month ON transactions(month);
CREATE INDEX IF NOT EXISTS idx_transactions_category ON transactions(category);
`;

/** Booking date is YYYY-MM-DD Europe/Oslo already, so this is a plain slice. */
function monthOf(date: string): string {
  return date.slice(0, 7);
}

export function openDb(path = 'data/banking.db'): DatabaseSync {
  const db = new DatabaseSync(path);
  db.exec(SCHEMA);
  return db;
}

const UPSERT = `
INSERT INTO transactions
  (source, id, accountKey, date, month, amount, description, counterparty,
   bankCategory, typeText, isRecurring, isSubscription, isPending, excluded, reason, category)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
ON CONFLICT (source, id) DO UPDATE SET
  accountKey = excluded.accountKey,
  date = excluded.date,
  month = excluded.month,
  amount = excluded.amount,
  description = excluded.description,
  counterparty = excluded.counterparty,
  bankCategory = excluded.bankCategory,
  typeText = excluded.typeText,
  isRecurring = excluded.isRecurring,
  isSubscription = excluded.isSubscription,
  isPending = excluded.isPending,
  excluded = excluded.excluded,
  reason = excluded.reason,
  category = excluded.category
`;

function bindParams(row: Categorized) {
  return [
    row.source,
    row.id,
    row.accountKey,
    row.date,
    monthOf(row.date),
    row.amount,
    row.description,
    row.counterparty,
    row.bankCategory,
    row.typeText,
    row.isRecurring ? 1 : 0,
    row.isSubscription ? 1 : 0,
    row.isPending ? 1 : 0,
    row.excluded ? 1 : 0,
    row.reason,
    row.category,
  ] as const;
}

export function upsertMany(db: DatabaseSync, rows: Categorized[]): void {
  const stmt = db.prepare(UPSERT);
  db.exec('BEGIN');
  try {
    for (const row of rows) stmt.run(...bindParams(row));
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

type Row = {
  source: Source;
  id: string;
  accountKey: string;
  date: string;
  amount: number;
  description: string;
  counterparty: string | null;
  bankCategory: string | null;
  typeText: string | null;
  isRecurring: number;
  isSubscription: number;
  isPending: number;
  excluded: number;
  reason: string | null;
  category: string;
};

function toCategorized(row: Row): Categorized {
  return {
    source: row.source,
    id: row.id,
    accountKey: row.accountKey,
    date: row.date,
    amount: row.amount,
    description: row.description,
    counterparty: row.counterparty,
    bankCategory: row.bankCategory,
    typeText: row.typeText,
    isRecurring: !!row.isRecurring,
    isSubscription: !!row.isSubscription,
    isPending: !!row.isPending,
    excluded: !!row.excluded,
    reason: row.reason,
    category: row.category,
  };
}

export function queryMonth(db: DatabaseSync, month: string): Categorized[] {
  const rows = db
    .prepare('SELECT * FROM transactions WHERE month = ? ORDER BY date, id')
    .all(month) as unknown as Row[];
  return rows.map(toCategorized);
}

/** Inclusive on both ends. Months are YYYY-MM, so string comparison sorts correctly. */
export function queryRange(db: DatabaseSync, fromMonth: string, toMonth: string): Categorized[] {
  const rows = db
    .prepare('SELECT * FROM transactions WHERE month >= ? AND month <= ? ORDER BY month, date, id')
    .all(fromMonth, toMonth) as unknown as Row[];
  return rows.map(toCategorized);
}

/**
 * Wipes and reloads. Unlike upsertMany, this also removes rows no longer
 * produced by the pipeline (e.g. a transaction dropped from a re-synced
 * month) — the caller re-derives `rows` from data/raw/ before calling this.
 */
export function rebuild(db: DatabaseSync, rows: Categorized[]): void {
  db.exec('BEGIN');
  try {
    db.exec('DELETE FROM transactions');
    const stmt = db.prepare(UPSERT);
    for (const row of rows) stmt.run(...bindParams(row));
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}
