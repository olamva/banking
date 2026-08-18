import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { remaining } from "../../src/net/budget.ts";
import {
  monthRange,
  noteLimits,
  RateLimited,
  ReauthRequired,
} from "../../src/net/sb1.ts";

/** Never the real ledger: these tests would spend the day's budget on paper. */
const ledger = () =>
  join(mkdtempSync(join(tmpdir(), "sb1-")), "api-budget.json");

test("monthRange covers whole months", () => {
  assert.deepEqual(monthRange("2026-07"), {
    from: "2026-07-01",
    to: "2026-07-31",
  });
  assert.deepEqual(monthRange("2026-02"), {
    from: "2026-02-01",
    to: "2026-02-28",
  });
  assert.deepEqual(monthRange("2024-02"), {
    from: "2024-02-01",
    to: "2024-02-29",
  }); // leap
  assert.deepEqual(monthRange("2026-12"), {
    from: "2026-12-01",
    to: "2026-12-31",
  }); // year rollover
  assert.throws(() => monthRange("2026-7"));
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

test("a 429 is the bank refusing outright, told apart from the ledger refusing for it", () => {
  const path = ledger();
  const limits = (status: number, headers: Record<string, string>) =>
    caught(() => noteLimits(status, new Headers(headers), path));

  const err = limits(429, {
    "x-ratelimit-remaining": "0",
    "retry-after": "42",
  });
  assert.ok(err instanceof RateLimited, "a 429 is not a generic failure");
  assert.equal(err.retryAfter, "42");
  assert.match(err.message, /42s/);

  // SB1 sends no Retry-After of its own, so the message has to survive without one.
  const bare = limits(429, { "x-ratelimit-remaining": "0" });
  assert.ok(bare instanceof RateLimited);
  assert.match(bare.message, /does not say for how long/);

  assert.ok(limits(401, {}) instanceof ReauthRequired);
  assert.equal(limits(200, {}), null);
});

test("the bank publishes what is left on every response, and that is the ledger", () => {
  // The one place its real ceiling is ever visible, and now the only figure we
  // keep — this repo assumed 60 an hour, which the API states nowhere.
  const path = ledger();
  noteLimits(200, new Headers({ "x-ratelimit-remaining": "57" }), path);
  assert.equal(remaining(path), 57);

  // Even on the refusal, which is the response that most wants recording.
  assert.throws(() =>
    noteLimits(429, new Headers({ "x-ratelimit-remaining": "0" }), path),
  );
  assert.equal(remaining(path), 0);

  // A response without the header leaves the last known figure alone rather
  // than reading absence as zero.
  noteLimits(200, new Headers(), path);
  assert.equal(remaining(path), 0);
});

test("recording the zero from a 429 is what starts the refill clock", () => {
  const path = ledger();
  const now = Date.now();
  assert.throws(() =>
    noteLimits(429, new Headers({ "x-ratelimit-remaining": "0" }), path, now),
  );
  assert.equal(remaining(path, now), 0);
  // A minute on there is one to spend again, which is why a 429 does not need a
  // Retry-After — SB1 sends none, and the refill rate answers the question.
  assert.equal(remaining(path, now + 60_000), 1);
});
