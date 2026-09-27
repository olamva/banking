import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createServer, type AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, afterEach, beforeEach, test as always } from "node:test";
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

// A sandbox answers EPERM to a listen on loopback. Every case here needs a real
// port, so skip them as one instead of failing ten times with the same error.
const loopback = await new Promise<boolean>((done, fail) => {
  const probe = createServer();
  probe.once("error", (e: NodeJS.ErrnoException) =>
    e.code === "EPERM" || e.code === "EACCES" ? done(false) : fail(e),
  );
  probe.listen(0, "127.0.0.1", () => probe.close(() => done(true)));
});
const test = loopback ? always : (always.skip as typeof always);

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
    server.listen(0, "127.0.0.1", () => {
      server.off("error", fail);
      done();
    });
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

test("anonymous requests redirect before any page or API action", async () => {
  for (const path of [
    "/",
    "/api/txns",
    "/api/refresh",
    "/api/rules",
    "/api/rules/save?file=categories&key=x&value=y",
  ]) {
    const res = await fetch(`${base}${path}`, { redirect: "manual" });
    assert.equal(res.status, 302);
    assert.equal(
      res.headers.get("location"),
      "/.auth/login/google?post_login_redirect_uri=%2F",
    );
    assert.equal(await res.text(), "");
  }
});

test("anonymous requests reach the install icons and nothing next to them", async () => {
  for (const path of ["/apple-touch-icon.png", "/manifest.webmanifest"]) {
    const res = await fetch(`${base}${path}`, { redirect: "manual" });
    assert.notEqual(res.status, 302);
  }
  for (const path of ["/theme.js", "/index.html"]) {
    const res = await fetch(`${base}${path}`, { redirect: "manual" });
    assert.equal(res.status, 302);
  }
  const posted = await fetch(`${base}/icon.svg`, {
    method: "POST",
    redirect: "manual",
  });
  assert.equal(posted.status, 302);
});

test("traffic logs separate access outcomes and omit sensitive request values", async (t) => {
  const lines: string[] = [];
  t.mock.method(console, "info", (line: string) => lines.push(line));
  process.env.TRAFFIC_LOG = "1";
  try {
    for (const principal of [
      undefined,
      header("eve@example.com"),
      header("ola@example.com"),
      "malformed",
    ]) {
      const res = await fetch(
        `${base}/nothing.js?code=secret-query&key=private-rule`,
        {
          method: "POST",
          body: "secret-body",
          redirect: "manual",
          headers: {
            ...(principal ? { "x-ms-client-principal": principal } : {}),
            "user-agent": "traffic-test",
            "x-forwarded-for": "192.0.2.1",
            cookie: "session=secret-cookie",
            authorization: "Bearer secret-header",
            referer: "https://example.com/?code=secret-referrer",
          },
        },
      );
      await res.text();
    }
  } finally {
    delete process.env.TRAFFIC_LOG;
  }
  assert.equal(lines.length, 4);
  const records = lines.map((line) => JSON.parse(line));
  assert.deepEqual(
    records.map((r) => [r.access, r.status]),
    [
      ["anonymous", 302],
      ["denied", 403],
      ["allowed", 405],
      ["denied", 403],
    ],
  );
  for (const r of records) {
    assert.equal(r.path, "/nothing.js");
    assert.equal(r.userAgent, "traffic-test");
    assert.equal(r.forwardedFor, "192.0.2.1");
    assert.ok(r.durationMs >= 0);
  }
  assert.doesNotMatch(
    lines.join(""),
    /secret-|private-rule|example.com|malformed/,
  );
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
  assert.equal(lines.length, 1);
  assert.ok(
    lines.every((line) => !String(line).includes("not-allowed@example.com")),
  );
});
