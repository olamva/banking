import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rangeToDate } from './sync.ts';

// Enable Banking answers 400 ASPSP_ERROR when date_to is in the future, which
// is every refresh of the month you are currently in.
test('the current month stops at today, not its last calendar day', () => {
  assert.deepEqual(rangeToDate('2026-08', new Date(2026, 7, 8)), {
    from: '2026-08-01',
    to: '2026-08-08',
  });
});

test('a finished month keeps its full range', () => {
  assert.deepEqual(rangeToDate('2026-07', new Date(2026, 7, 8)), {
    from: '2026-07-01',
    to: '2026-07-31',
  });
});

test('the last day of a month is not clamped away', () => {
  assert.deepEqual(rangeToDate('2026-08', new Date(2026, 7, 31)), {
    from: '2026-08-01',
    to: '2026-08-31',
  });
});
