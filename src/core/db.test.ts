import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDb, upsertMany, queryMonth, queryRange, rebuild } from './db.ts';
import type { Categorized } from './types.ts';

function row(overrides: Partial<Categorized> = {}): Categorized {
  return {
    id: 'a1',
    source: 'sb1',
    accountKey: 'acc1',
    date: '2026-07-15',
    amount: -100,
    description: 'Coop',
    counterparty: 'Coop',
    bankCategory: 'dagligvarer',
    isRecurring: false,
    isSubscription: false,
    isPending: false,
    excluded: false,
    reason: null,
    category: 'dagligvarer',
    ...overrides,
  };
}

test('upsertMany inserts, then updates in place on re-import (card rows flip PDNG)', () => {
  const db = openDb(':memory:');
  upsertMany(db, [row({ isPending: true, amount: -50 })]);
  assert.deepEqual(queryMonth(db, '2026-07'), [row({ isPending: true, amount: -50 })]);

  upsertMany(db, [row({ isPending: false, amount: -55 })]);
  const rows = queryMonth(db, '2026-07');
  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.isPending, false);
  assert.equal(rows[0]?.amount, -55);
  db.close();
});

test('the "excluded" column survives an update despite colliding with the ON CONFLICT excluded.* alias', () => {
  const db = openDb(':memory:');
  upsertMany(db, [row({ excluded: false, reason: null })]);
  upsertMany(db, [row({ excluded: true, reason: 'internal transfer' })]);
  const [got] = queryMonth(db, '2026-07');
  assert.equal(got?.excluded, true);
  assert.equal(got?.reason, 'internal transfer');
  db.close();
});

test('(source, id) is the key — same id on both sources coexists', () => {
  const db = openDb(':memory:');
  upsertMany(db, [row({ source: 'sb1', id: 'x' }), row({ source: 'card', id: 'x' })]);
  assert.equal(queryMonth(db, '2026-07').length, 2);
  db.close();
});

test('queryMonth filters strictly to that month', () => {
  const db = openDb(':memory:');
  upsertMany(db, [
    row({ id: 'jul', date: '2026-07-31' }),
    row({ id: 'aug', date: '2026-08-01' }),
  ]);
  assert.deepEqual(
    queryMonth(db, '2026-07').map((r) => r.id),
    ['jul'],
  );
  db.close();
});

test('queryRange is inclusive on both ends', () => {
  const db = openDb(':memory:');
  upsertMany(db, [
    row({ id: 'jun', date: '2026-06-30' }),
    row({ id: 'jul', date: '2026-07-15' }),
    row({ id: 'aug', date: '2026-08-01' }),
  ]);
  assert.deepEqual(
    queryRange(db, '2026-06', '2026-07').map((r) => r.id),
    ['jun', 'jul'],
  );
  db.close();
});

test('rebuild drops rows the new import no longer produces', () => {
  const db = openDb(':memory:');
  upsertMany(db, [row({ id: 'stale' })]);
  rebuild(db, [row({ id: 'fresh' })]);
  assert.deepEqual(
    queryMonth(db, '2026-07').map((r) => r.id),
    ['fresh'],
  );
  db.close();
});

test('openDb on an existing file is idempotent and keeps prior data', () => {
  const dir = mkdtempSync(join(tmpdir(), 'banking-db-test-'));
  const path = join(dir, 'banking.db');
  try {
    const first = openDb(path);
    upsertMany(first, [row()]);
    first.close();

    const second = openDb(path); // schema already exists; must not throw or wipe rows
    assert.deepEqual(
      queryMonth(second, '2026-07').map((r) => r.id),
      ['a1'],
    );
    second.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
