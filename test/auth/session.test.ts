import assert from "node:assert/strict";
import { test } from "node:test";
import { allowed } from "../../src/auth/session.ts";

test("an empty allowlist denies everybody", () => {
  assert.equal(allowed("ola@example.com", undefined), false);
  assert.equal(allowed("ola@example.com", ""), false);
  assert.equal(allowed("ola@example.com", "  ,  "), false);
});

test("the allowlist ignores case and spacing, and matches whole addresses", () => {
  const list = " Ola@Example.com , two@example.com ";
  assert.equal(allowed("ola@example.com", list), true);
  assert.equal(allowed("OLA@EXAMPLE.COM", list), true);
  assert.equal(allowed("two@example.com", list), true);
  assert.equal(allowed("la@example.com", list), false);
  assert.equal(allowed("ola@example.com.evil.com", list), false);
  assert.equal(allowed("", list), false);
});
