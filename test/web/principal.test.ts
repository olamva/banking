import assert from "node:assert/strict";
import { test } from "node:test";
import { allowed } from "../../src/auth/session.ts";
import { claimTypes, principalEmail } from "../../src/web/principal.ts";

const GOOGLE_EMAIL =
  "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress";

const header = (claims: Array<{ typ?: string; val?: string }>): string =>
  Buffer.from(JSON.stringify({ auth_typ: "google", claims })).toString(
    "base64",
  );

test("the principal header yields the address that Google sent", () => {
  const h = header([
    { typ: "name", val: "A Person" },
    { typ: GOOGLE_EMAIL, val: "ola@example.com" },
  ]);
  assert.equal(principalEmail(h), "ola@example.com");
});

test("a short claim name works, because not every provider sends the long one", () => {
  assert.equal(
    principalEmail(header([{ typ: "email", val: "ola@example.com" }])),
    "ola@example.com",
  );
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
    header([{ typ: "email", val: "ola@example.com" }]),
  );
  const other = principalEmail(
    header([{ typ: "email", val: "eve@example.com" }]),
  );
  assert.equal(allowed(mine!, list), true);
  assert.equal(allowed(other!, list), false);
  // Easy Auth authenticates. An unset list must still deny.
  assert.equal(allowed(mine!, undefined), false);
});

test("the name header carries the address when no claim type does", () => {
  const odd = Buffer.from(
    JSON.stringify({ claims: [{ typ: "sub", val: "1234567890" }] }),
  ).toString("base64");
  assert.equal(principalEmail(odd, "ola@example.com"), "ola@example.com");
  assert.equal(principalEmail(undefined, "ola@example.com"), "ola@example.com");
});

test("the name header is refused when it is not an address", () => {
  assert.equal(principalEmail(undefined, "A Person"), null);
  assert.equal(principalEmail(undefined, ""), null);
  assert.equal(principalEmail(undefined, undefined), null);
});

test("an address under an unknown claim type is still found", () => {
  const odd = Buffer.from(
    JSON.stringify({
      claims: [
        { typ: "sub", val: "123" },
        { typ: "some/other/type", val: "ola@example.com" },
      ],
    }),
  ).toString("base64");
  assert.equal(principalEmail(odd), "ola@example.com");
});

test("the claim types are readable for a log, and carry no address", () => {
  const h = Buffer.from(
    JSON.stringify({ claims: [{ typ: "email", val: "ola@example.com" }] }),
  ).toString("base64");
  assert.deepEqual(claimTypes(h), ["email"]);
  assert.deepEqual(claimTypes(undefined), []);
  assert.deepEqual(claimTypes("not base64"), []);
});
