import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, afterEach, beforeEach, test } from "node:test";
import { GOOGLE_EMAIL_CLAIM } from "../../src/web/principal.ts";

const dir = mkdtempSync(join(tmpdir(), "server-"));
const dataDir = join(dir, "data");
const rulesDir = join(dir, "rules");
const dbFile = join(dir, "banking.db");
mkdirSync(dataDir, { recursive: true });
mkdirSync(rulesDir, { recursive: true });
writeFileSync(join(rulesDir, "accounts.json"), "{}");
process.env.DATA_DIR = dataDir;
process.env.RULES_DIR = rulesDir;
process.env.DB_FILE = dbFile;
const { server } = await import("../../src/web/server.ts");

const header = (email: string): string =>
  Buffer.from(
    JSON.stringify({
      auth_typ: "google",
      claims: [{ typ: GOOGLE_EMAIL_CLAIM, val: email }],
    }),
  ).toString("base64");

let base = "";
beforeEach(async () => {
  process.env.ALLOWED_EMAILS = "ola@example.com";
  await new Promise<void>((done, fail) => {
    server.once("error", fail);
    server.listen(0, "127.0.0.1", done);
  });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterEach(async () => {
  delete process.env.ALLOWED_EMAILS;
  server.closeAllConnections();
  if (server.listening)
    await new Promise<void>((done) => server.close(() => done()));
});

after(() => {
  delete process.env.DATA_DIR;
  delete process.env.RULES_DIR;
  delete process.env.DB_FILE;
  rmSync(dir, { recursive: true, force: true });
});

test("no principal is no page, whatever the path", async () => {
  for (const path of [
    "/",
    "/api/txns",
    "/api/refresh",
    "/api/rules",
    "/api/rules/save?file=categories&key=x&value=y",
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

// Reading a rule needs no custom header, exactly as reading the rows does not.
// Writing one does, and the write is a GET, so the header is the whole guard
// against a page on another site spending this one.
test("the rules read back behind the gate", async () => {
  const res = await fetch(`${base}/api/rules`, {
    headers: { "x-ms-client-principal": header("ola@example.com") },
  });
  assert.equal(res.status, 200);
  const body = (await res.json()) as { files: Record<string, unknown> };
  assert.ok("categories" in body.files);
});

test("a rule write without the custom header is refused", async () => {
  const res = await fetch(
    `${base}/api/rules/save?file=categories&key=x&value=mat/kantine`,
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

test("responses use the browser security policy", async () => {
  for (const path of ["/", "/nothing.js", "/api/txns"]) {
    const res = await fetch(`${base}${path}`, {
      headers: { "x-ms-client-principal": header("ola@example.com") },
    });
    assert.equal(
      res.headers.get("content-security-policy"),
      "default-src 'self'; script-src 'self'; connect-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
    );
  }
});

test("debug logging contains no principal value", async () => {
  const old = console.error;
  const lines: unknown[] = [];
  console.error = (...args: unknown[]) => lines.push(args.join(" "));
  process.env.DEBUG = "1";
  try {
    await fetch(`${base}/api/txns`, {
      headers: { "x-ms-client-principal": header("not-allowed@example.com") },
    });
  } finally {
    delete process.env.DEBUG;
    console.error = old;
  }
  assert.ok(lines.every((line) => !String(line).includes("not-allowed@example.com")));
});
