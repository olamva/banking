import assert from "node:assert/strict";
import { test } from "node:test";
import { allowed } from "../../src/auth/session.ts";
import {
  claimTypes,
  GOOGLE_EMAIL_CLAIM,
  principalEmail,
} from "../../src/web/principal.ts";

const header = (claims: Array<{ typ?: string; val?: string }>): string =>
  Buffer.from(JSON.stringify({ auth_typ: "google", claims })).toString(
    "base64",
  );

test("the principal header yields the address that Google sent", () => {
  const h = header([
    { typ: "name", val: "A Person" },
    { typ: GOOGLE_EMAIL_CLAIM, val: "ola@example.com" },
  ]);
  assert.equal(principalEmail(h), "ola@example.com");
});

test("a missing, malformed or empty header is nobody", () => {
  assert.equal(principalEmail(undefined), null);
  assert.equal(principalEmail(""), null);
  assert.equal(principalEmail("not base64 json"), null);
  assert.equal(principalEmail(Buffer.from("[]").toString("base64")), null);
  assert.equal(principalEmail(header([])), null);
  assert.equal(
    principalEmail(header([{ typ: "name", val: "A Person" }])),
    null,
  );
});

test("a signed-in address that is not on the list is still refused", () => {
  const list = "ola@example.com";
  const mine = principalEmail(
    header([{ typ: GOOGLE_EMAIL_CLAIM, val: "ola@example.com" }]),
  );
  const other = principalEmail(
    header([{ typ: GOOGLE_EMAIL_CLAIM, val: "eve@example.com" }]),
  );
  assert.equal(allowed(mine!, list), true);
  assert.equal(allowed(other!, list), false);
  // Easy Auth authenticates. An unset list must still deny.
  assert.equal(allowed(mine!, undefined), false);
});

test("a display name or unknown claim cannot impersonate an address", () => {
  assert.equal(principalEmail(header([{ typ: "name", val: "ola@example.com" }])), null);
  assert.equal(principalEmail(header([{ typ: "unknown", val: "ola@example.com" }])), null);
});

test("conflicting, malformed and non-Google principals fail", () => {
  assert.equal(
    principalEmail(
      header([
        { typ: GOOGLE_EMAIL_CLAIM, val: "ola@example.com" },
        { typ: GOOGLE_EMAIL_CLAIM, val: "eve@example.com" },
      ]),
    ),
    null,
  );
  assert.equal(principalEmail(header([{ typ: GOOGLE_EMAIL_CLAIM, val: "bad" }])), null);
  const other = Buffer.from(JSON.stringify({ auth_typ: "aad", claims: [{ typ: GOOGLE_EMAIL_CLAIM, val: "ola@example.com" }] })).toString("base64");
  assert.equal(principalEmail(other), null);
});

test("the claim types are readable for a log, and carry no address", () => {
  const h = Buffer.from(
    JSON.stringify({ claims: [{ typ: "email", val: "ola@example.com" }] }),
  ).toString("base64");
  assert.deepEqual(claimTypes(h), ["email"]);
  assert.deepEqual(claimTypes(undefined), []);
  assert.deepEqual(claimTypes("not base64"), []);
});
