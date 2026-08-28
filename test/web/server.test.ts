import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
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
let cwd = "";
let dir = "";

before(async () => {
  cwd = process.cwd();
  dir = mkdtempSync(join(tmpdir(), "server-"));
  process.chdir(dir);
  mkdirSync("rules");
  writeFileSync("rules/accounts.json", "{}");
  process.env.ALLOWED_EMAILS = "ola@example.com";
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

after(async () => {
  delete process.env.ALLOWED_EMAILS;
  server.closeAllConnections();
  if (server.listening)
    await new Promise<void>((done) => server.close(() => done()));
  process.chdir(cwd);
  rmSync(dir, { recursive: true });
});

test("no principal is no page, whatever the path", async () => {
  for (const path of ["/", "/api/txns", "/api/refresh"])
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
