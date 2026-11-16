import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import type { IncomingMessage } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PassThrough } from "node:stream";
import { after, mock, test } from "node:test";

Object.defineProperty(process, "platform", { value: "linux" });
const dir = mkdtempSync(join(tmpdir(), "connect-"));
process.env.DATA_DIR = dir;
after(() => rmSync(dir, { recursive: true, force: true }));
const { connectRoute } = await import("../../src/web/connect.ts");

const secret = (name: string) =>
  readFileSync(join(dir, "secrets", name), "utf8");

const network = mock.method(globalThis, "fetch", async () =>
  Response.json({ access_token: "access", refresh_token: "fresh" }),
);

const call = async (
  path: string,
  { method = "GET", body = "", header = "1" } = {},
) => {
  const req = Object.assign(new PassThrough(), {
    method,
    headers: header ? { "x-banking-connect": header } : {},
  });
  req.end(body);
  const a = await connectRoute(path, req as unknown as IncomingMessage)!;
  return { status: a.status, ...JSON.parse(a.body) };
};

test("a login needs the connect header", async () => {
  assert.equal(
    (await call("/api/connect/coop/start", { header: "" })).status,
    405,
  );
  assert.equal((await call("/api/connect/nope/start")).status, 404);
});

test("a pasted Coop address must carry the state of the started login", async () => {
  const { url } = await call("/api/connect/coop/start");
  const state = new URL(url).searchParams.get("state");
  const back = (s: string) =>
    `https://login.coop.no/android/no.coop.members/callback?code=c&state=${s}`;
  const finish = (body: string) =>
    call("/api/connect/coop/finish", { method: "POST", body });

  assert.equal((await finish(back("other"))).status, 400);
  assert.equal(network.mock.callCount(), 0);
  assert.equal((await finish(back(state!))).status, 200);
  assert.equal(JSON.parse(secret("coop")).refreshToken, "fresh");
  assert.equal((await finish(back(state!))).status, 400);
});

test("a pasted Trumf cookie must hold the session", async () => {
  const save = (body: string) =>
    call("/api/connect/trumf/finish", { method: "POST", body });
  assert.equal((await save("_pk_id=1")).status, 400);
  assert.equal(
    (await save("cookie: __Secure-authjs.session-token.0=a; x=b")).status,
    200,
  );
  assert.equal(
    secret("TRUMF_COOKIE"),
    "__Secure-authjs.session-token.0=a; x=b",
  );
});
