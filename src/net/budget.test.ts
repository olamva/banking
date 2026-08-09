import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { remaining, canAfford, note, spend, BudgetExhausted } from './budget.ts';

const ledger = () => join(mkdtempSync(join(tmpdir(), 'budget-')), 'api-budget.json');

const MINUTE = 60_000;

test('nothing on disk is unknown, not empty', () => {
  const path = ledger();
  assert.equal(remaining(path), null);
  assert.equal(canAfford(500, path), true, 'unknown must not refuse');
  assert.doesNotThrow(() => spend(path), 'the first call is what teaches us the figure');
  assert.equal(remaining(path), null, 'and it still knows nothing until the response');
});

test('the bank has the last word, spend only estimates between responses', () => {
  const path = ledger();
  const now = Date.now();

  note(57, path, now);
  assert.equal(remaining(path, now), 57);

  spend(path, now);
  spend(path, now);
  assert.equal(remaining(path, now), 55, 'counted down for calls still in flight');

  note(48, path, now); // the response disagrees; the response wins
  assert.equal(remaining(path, now), 48);
});

test('zero refuses, and says how long rather than naming a cap of ours', () => {
  const path = ledger();
  const now = Date.now();
  note(0, path, now);

  assert.equal(canAfford(1, path, now), false);
  assert.throws(() => spend(path, now), BudgetExhausted);
  assert.throws(() => spend(path, now), /60s for the next/);
});

test('the allowance comes back a request a minute, not all at once in an hour', () => {
  // The whole reason the local rolling-hour cap went: SB1 does not hold a
  // request for 60 minutes after it is fired, it hands the quota back steadily.
  const path = ledger();
  const now = Date.now();
  note(0, path, now);

  assert.equal(remaining(path, now + MINUTE - 1), 0, 'not before the minute is up');
  assert.equal(remaining(path, now + MINUTE), 1);
  assert.equal(remaining(path, now + 10 * MINUTE), 10);
});

test('refills stop at the stated quota, however long nothing has called', () => {
  const path = ledger();
  const now = Date.now();
  note(30, path, now);
  assert.equal(remaining(path, now + 24 * 3600_000), 60, 'a day idle is still 60 an hour');
});

test('a burst does not push its own refill away', () => {
  // `at` advances by whole minutes only. Resetting it to now on every spend
  // would discard the part-minute accrued and starve a busy sweep.
  const path = ledger();
  const now = Date.now();
  note(5, path, now);
  for (let i = 0; i < 5; i++) spend(path, now + 50_000 + i);
  assert.equal(remaining(path, now + 50_000), 0);
  assert.equal(remaining(path, now + MINUTE), 1, 'the minute still lands when it was due');
});

test('canAfford weighs the whole batch, not one call', () => {
  const path = ledger();
  const now = Date.now();
  note(3, path, now);
  assert.equal(canAfford(3, path, now), true);
  assert.equal(canAfford(4, path, now), false);
});

test('a corrupt ledger is forgotten, not fatal', () => {
  const path = ledger();
  note(9, path);
  writeFileSync(path, 'not json');
  assert.equal(remaining(path), null);
});
