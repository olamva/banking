import assert from "node:assert/strict";
import { test } from "node:test";
import {
  allowed,
  cookie,
  idTokenEmail,
  readSession,
  safeNext,
  sameNonce,
  signSession,
} from "../../src/auth/session.ts";

const SECRET = "a-test-secret";
const CLIENT = "client-id.apps.googleusercontent.com";

const b64url = (s: string) =>
  Buffer.from(s, "utf8").toString("base64url").replace(/=+$/, "");

const idToken = (claims: Record<string, unknown>) =>
  `${b64url(JSON.stringify({ alg: "RS256" }))}.${b64url(JSON.stringify(claims))}.signature`;

const good = (over: Record<string, unknown> = {}) =>
  idToken({
    iss: "https://accounts.google.com",
    aud: CLIENT,
    exp: Math.floor(Date.now() / 1000) + 3600,
    email: "ola@example.com",
    email_verified: true,
    ...over,
  });

test("a signed session reads back", async () => {
  const token = await signSession(SECRET, {
    email: "ola@example.com",
    exp: Date.now() + 1000,
  });
  const s = await readSession(SECRET, token);
  assert.equal(s?.email, "ola@example.com");
});

test("a session refuses another secret", async () => {
  const token = await signSession(SECRET, {
    email: "ola@example.com",
    exp: Date.now() + 1000,
  });
  assert.equal(await readSession("other-secret", token), null);
});

test("a session refuses an edited payload", async () => {
  const token = await signSession(SECRET, {
    email: "ola@example.com",
    exp: Date.now() + 1000,
  });
  const forged = `${Buffer.from(
    JSON.stringify({ email: "thief@example.com", exp: Date.now() + 1000 }),
  ).toString("base64url")}.${token.slice(token.lastIndexOf(".") + 1)}`;
  assert.equal(await readSession(SECRET, forged), null);
});

test("a session refuses after it expires", async () => {
  const token = await signSession(SECRET, {
    email: "ola@example.com",
    exp: Date.now() + 1000,
  });
  assert.equal(await readSession(SECRET, token, Date.now() + 2000), null);
});

test("a missing or malformed session is no session", async () => {
  assert.equal(await readSession(SECRET, undefined), null);
  assert.equal(await readSession(SECRET, ""), null);
  assert.equal(await readSession(SECRET, "nodot"), null);
  assert.equal(await readSession(SECRET, "..."), null);
});

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

test("the next path refuses anything that leaves the site", () => {
  assert.equal(
    safeNext("/transactions?month=2026-08"),
    "/transactions?month=2026-08",
  );
  assert.equal(safeNext("//evil.example"), "/");
  assert.equal(safeNext("/\\evil.example"), "/");
  assert.equal(safeNext("https://evil.example"), "/");
  assert.equal(safeNext(null), "/");
  assert.equal(safeNext(""), "/");
});

test("an id token from Google yields the address", () => {
  assert.equal(idTokenEmail(good(), CLIENT), "ola@example.com");
});

test("an id token for another client is refused", () => {
  assert.equal(idTokenEmail(good({ aud: "someone-else" }), CLIENT), null);
});

test("an id token from another issuer is refused", () => {
  assert.equal(
    idTokenEmail(good({ iss: "https://evil.example" }), CLIENT),
    null,
  );
});

test("an unverified address is refused", () => {
  assert.equal(idTokenEmail(good({ email_verified: false }), CLIENT), null);
  assert.equal(idTokenEmail(good({ email_verified: undefined }), CLIENT), null);
});

test("an expired id token is refused", () => {
  const exp = Math.floor(Date.now() / 1000) - 1;
  assert.equal(idTokenEmail(good({ exp }), CLIENT), null);
});

test("a malformed id token is refused", () => {
  assert.equal(idTokenEmail("not-a-token", CLIENT), null);
  assert.equal(idTokenEmail("a.b.c", CLIENT), null);
});

test("the nonce compare rejects a different length and a different value", () => {
  assert.equal(sameNonce("abc", "abc"), true);
  assert.equal(sameNonce("abc", "abcd"), false);
  assert.equal(sameNonce("abc", "abd"), false);
});

test("the cookie reader picks one name out of the jar", () => {
  const request = new Request("https://example.test/", {
    headers: { cookie: "a=1; bank_session=xyz%20z; b=2" },
  });
  assert.equal(cookie(request, "bank_session"), "xyz z");
  assert.equal(cookie(request, "a"), "1");
  assert.equal(cookie(request, "missing"), undefined);
  assert.equal(cookie(new Request("https://example.test/"), "a"), undefined);
});
