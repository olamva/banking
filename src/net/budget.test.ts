import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { used, remaining, canAfford, spend, BudgetExhausted, HOURLY_CAP } from './budget.ts';

const ledger = () => join(mkdtempSync(join(tmpdir(), 'budget-')), 'api-budget.json');
const HOUR = 3600_000;

test('an absent ledger means nothing has been spent', () => {
  assert.equal(used(ledger()), 0);
  assert.equal(remaining(ledger()), HOURLY_CAP);
});

test('calls older than an hour fall out of the window', () => {
  const path = ledger();
  const now = Date.now();
  writeFileSync(path, JSON.stringify([now - HOUR - 1000, now - 60_000]));
  assert.equal(used(path, now), 1);
});

test('spend records, and refuses at the cap rather than hitting the bank limit', () => {
  const path = ledger();
  const now = Date.now();
  for (let i = 0; i < HOURLY_CAP; i++) spend(path, now);
  assert.equal(used(path, now), HOURLY_CAP);
  assert.throws(() => spend(path, now), BudgetExhausted);
});

test('the cap frees up as the window slides, without a restart', () => {
  const path = ledger();
  const start = Date.now();
  for (let i = 0; i < HOURLY_CAP; i++) spend(path, start);
  assert.equal(canAfford(1, path, start), false);
  assert.equal(canAfford(1, path, start + HOUR + 1), true);
});

test('canAfford weighs the whole batch, not one call', () => {
  const path = ledger();
  const now = Date.now();
  for (let i = 0; i < HOURLY_CAP - 3; i++) spend(path, now);
  assert.equal(canAfford(3, path, now), true);
  assert.equal(canAfford(4, path, now), false);
});

test('a corrupt ledger is ignored rather than wedging every command', () => {
  const path = ledger();
  writeFileSync(path, 'not json at all');
  assert.equal(used(path), 0);
});
