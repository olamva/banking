import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ageMinutes, monthsToRefresh, singleFlight } from './serve.ts';

test('never synced reads as no age, which is what forces the first pull', () => {
  assert.equal(ageMinutes({}), null);
});

test('age is measured from the last attempt, not the last success', () => {
  const now = Date.now();
  assert.equal(ageMinutes({ lastAttempt: now - 30 * 60_000 }, now), 30);
});

test('early in a month the previous one is refreshed too, for late card postings', () => {
  assert.deepEqual(monthsToRefresh(new Date(2026, 7, 3)), ['2026-07', '2026-08']);
  assert.deepEqual(monthsToRefresh(new Date(2026, 7, 7)), ['2026-07', '2026-08']);
});

test('past the first week only the current month is refreshed', () => {
  assert.deepEqual(monthsToRefresh(new Date(2026, 7, 8)), ['2026-08']);
  assert.deepEqual(monthsToRefresh(new Date(2026, 7, 31)), ['2026-08']);
});

test('the year boundary rolls back correctly', () => {
  assert.deepEqual(monthsToRefresh(new Date(2026, 0, 2)), ['2025-12', '2026-01']);
});

// This is the one that caught a real bug: three tabs each ran a full refresh
// and spent 18 requests, because the guard sat behind an await.
test('concurrent callers join one run instead of starting their own', async () => {
  const join = singleFlight();
  let runs = 0;
  const work = async () => {
    runs++;
    await new Promise((r) => setTimeout(r, 20));
  };
  await Promise.all([join(work), join(work), join(work)]);
  assert.equal(runs, 1);
});

test('a later call starts a fresh run once the first has settled', async () => {
  const join = singleFlight();
  let runs = 0;
  const work = async () => {
    runs++;
  };
  await join(work);
  await join(work);
  assert.equal(runs, 2);
});

test('a failed run still clears the gate, so it is retried rather than wedged', async () => {
  const join = singleFlight();
  let runs = 0;
  const boom = async () => {
    runs++;
    throw new Error('sync failed');
  };
  await assert.rejects(join(boom));
  await assert.rejects(join(boom));
  assert.equal(runs, 2);
});
