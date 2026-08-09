import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bankRemaining, monthRange, noteLimits, RateLimited, ReauthRequired } from './sb1.ts';

test('monthRange covers whole months', () => {
  assert.deepEqual(monthRange('2026-07'), { from: '2026-07-01', to: '2026-07-31' });
  assert.deepEqual(monthRange('2026-02'), { from: '2026-02-01', to: '2026-02-28' });
  assert.deepEqual(monthRange('2024-02'), { from: '2024-02-01', to: '2024-02-29' }); // leap
  assert.deepEqual(monthRange('2026-12'), { from: '2026-12-01', to: '2026-12-31' }); // year rollover
  assert.throws(() => monthRange('2026-7'));
});

/** `assert.throws` returns nothing, and these assertions are about the error itself. */
const caught = (fn: () => void): unknown => {
  try {
    fn();
    return null;
  } catch (e) {
    return e;
  }
};

test('a 429 is the bank refusing, told apart from our own ledger refusing first', () => {
  const limits = (status: number, headers: Record<string, string>) =>
    caught(() => noteLimits(status, new Headers(headers)));

  const err = limits(429, { 'x-ratelimit-remaining': '0', 'retry-after': '42' });
  assert.ok(err instanceof RateLimited, 'a 429 is not a generic failure');
  assert.equal(err.retryAfter, '42');
  assert.match(err.message, /42s/);

  // SB1 sends no Retry-After of its own, so the message has to survive without one.
  const bare = limits(429, { 'x-ratelimit-remaining': '0' });
  assert.ok(bare instanceof RateLimited);
  assert.match(bare.message, /does not say for how long/);

  assert.ok(limits(401, {}) instanceof ReauthRequired);
  assert.equal(limits(200, {}), null);
});

test('the bank publishes what is left on every response, 429 or not', () => {
  // The one place its real ceiling is ever visible — this repo assumed 60 an
  // hour, which is not a number the API states anywhere.
  noteLimits(200, new Headers({ 'x-ratelimit-remaining': '57' }));
  assert.equal(bankRemaining(), 57);

  // Even on the refusal, which is the response that most wants recording.
  assert.throws(() => noteLimits(429, new Headers({ 'x-ratelimit-remaining': '0' })));
  assert.equal(bankRemaining(), 0);

  // A response without the header leaves the last known figure alone rather
  // than reading absence as zero.
  noteLimits(200, new Headers());
  assert.equal(bankRemaining(), 0);
});
