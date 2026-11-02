import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";

const dir = mkdtempSync(join(tmpdir(), "sb1-access-"));
const file = join(dir, "refresh-token");
Object.assign(process.env, {
  DATA_DIR: dir,
  TOKEN_FILE: file,
  CLIENT_ID: "id",
  CLIENT_SECRET: "secret",
});
after(() => rmSync(dir, { recursive: true, force: true }));

const { get } = await import("../../src/net/sb1.ts");
const { setToken } = await import("../../src/net/token.ts");

test("a long-running server exchanges the refresh token again once the access token expires", async (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: 0 });
  let issued = 0;
  const bearers: (string | null)[] = [];
  t.mock.method(
    globalThis,
    "fetch",
    async (url: string | URL | Request, init?: RequestInit) => {
      if (String(url).endsWith("/oauth/token")) {
        issued++;
        return Response.json({
          access_token: `a${issued}`,
          refresh_token: `r${issued}`,
          expires_in: 600,
        });
      }
      bearers.push(new Headers(init?.headers).get("authorization"));
      return Response.json({});
    },
  );
  await setToken("r0");

  await get("/accounts");
  t.mock.timers.tick(5 * 60_000);
  await get("/accounts");
  t.mock.timers.tick(5 * 60_000);
  await get("/accounts");

  assert.deepEqual(bearers, ["Bearer a1", "Bearer a1", "Bearer a2"]);
  assert.equal(readFileSync(file, "utf8"), "r2");
});

test("concurrent requests never send a refresh token the bank already rotated", async (t) => {
  const used = new Set<string>();
  t.mock.method(
    globalThis,
    "fetch",
    async (url: string | URL | Request, init?: RequestInit) => {
      if (!String(url).endsWith("/oauth/token")) return Response.json({});
      const sent = new URLSearchParams(String(init?.body)).get(
        "refresh_token",
      )!;
      if (used.has(sent)) return new Response("invalid_grant", { status: 400 });
      used.add(sent);
      return Response.json({
        access_token: `access-${sent}`,
        refresh_token: `${sent}+`,
        expires_in: 600,
      });
    },
  );
  await setToken("c");

  await Promise.all([get("/accounts"), get("/accounts")]);

  assert.equal(readFileSync(file, "utf8"), "c+");
});
