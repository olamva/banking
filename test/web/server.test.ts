import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import { after, before, test } from "node:test";
import { server } from "../../src/web/server.ts";

const header = (email: string): string =>
  Buffer.from(
    JSON.stringify({
      auth_typ: "google",
      claims: [{ typ: "email", val: email }],
    }),
  ).toString("base64");

let base = "";

before(async () => {
  process.env.ALLOWED_EMAILS = "ola@example.com";
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

after(() => {
  delete process.env.ALLOWED_EMAILS;
  server.close();
});

test("no principal is no page, whatever the path", async () => {
  for (const path of [
    "/",
    "/api/txns",
    "/api/refresh",
    "/api/rules",
    "/api/rules/save?file=overrides&key=x&value=y",
  ])
    assert.equal((await fetch(`${base}${path}`)).status, 403);
});

test("a signed-in address off the list is refused", async () => {
  const res = await fetch(`${base}/api/txns`, {
    headers: { "x-ms-client-principal": header("eve@example.com") },
  });
  assert.equal(res.status, 403);
});

test("the refresh endpoint still needs the custom header", async () => {
  const who = { "x-ms-client-principal": header("ola@example.com") };
  assert.equal(
    (await fetch(`${base}/api/refresh`, { headers: who })).status,
    405,
  );
  const posted = await fetch(`${base}/api/refresh`, {
    method: "POST",
    headers: who,
  });
  assert.equal(posted.status, 405);
});

// Easy Auth refuses a cookie on any method but GET, so the guard cannot lean
// on the method. The header carries all of it.
test("the refresh endpoint answers a GET that carries the header", async () => {
  const res = await fetch(`${base}/api/refresh`, {
    headers: {
      "x-ms-client-principal": header("ola@example.com"),
      "x-banking-refresh": "1",
    },
  });
  assert.notEqual(res.status, 405);
  assert.notEqual(res.status, 403);
});

// Reading a rule needs no custom header, exactly as reading the rows does not.
// Writing one does, and the write is a GET, so the header is the whole guard
// against a page on another site spending this one.
test("the rules read back behind the gate", async () => {
  const res = await fetch(`${base}/api/rules`, {
    headers: { "x-ms-client-principal": header("ola@example.com") },
  });
  assert.equal(res.status, 200);
  const body = (await res.json()) as { files: Record<string, unknown> };
  assert.ok("overrides" in body.files);
});

test("a rule write without the custom header is refused", async () => {
  const res = await fetch(
    `${base}/api/rules/save?file=overrides&key=x&value=mat/kantine`,
    { headers: { "x-ms-client-principal": header("ola@example.com") } },
  );
  assert.equal(res.status, 405);
});

// The file name is the one value in the query string that could name a path.
test("a rule write may not name a file outside the rules", async () => {
  for (const file of ["accounts", "../../.env.local", ""]) {
    const res = await fetch(
      `${base}/api/rules/save?file=${encodeURIComponent(file)}&key=x&value=y`,
      {
        headers: {
          "x-ms-client-principal": header("ola@example.com"),
          "x-banking-rules": "1",
        },
      },
    );
    assert.equal(res.status, 400);
  }
});

test("an allowed address gets past the gate", async () => {
  const res = await fetch(`${base}/nothing-here.js`, {
    headers: { "x-ms-client-principal": header("OLA@example.com") },
  });
  assert.equal(res.status, 404);
});

test("a request may not climb out of the build output", async () => {
  const res = await fetch(`${base}/../../rules/accounts.json`, {
    headers: { "x-ms-client-principal": header("ola@example.com") },
  });
  assert.notEqual(res.status, 200);
});
