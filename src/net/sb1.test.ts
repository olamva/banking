import { test } from 'node:test';
import assert from 'node:assert/strict';
import { monthRange } from './sb1.ts';

test('monthRange covers whole months', () => {
  assert.deepEqual(monthRange('2026-07'), { from: '2026-07-01', to: '2026-07-31' });
  assert.deepEqual(monthRange('2026-02'), { from: '2026-02-01', to: '2026-02-28' });
  assert.deepEqual(monthRange('2024-02'), { from: '2024-02-01', to: '2024-02-29' }); // leap
  assert.deepEqual(monthRange('2026-12'), { from: '2026-12-01', to: '2026-12-31' }); // year rollover
  assert.throws(() => monthRange('2026-7'));
});
