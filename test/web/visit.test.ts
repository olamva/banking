import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, mock, test } from "node:test";

const dir = mkdtempSync(join(tmpdir(), "visit-"));
process.env.DATA_DIR = join(dir, "data");
mkdirSync(process.env.DATA_DIR);
process.env.RULES_DIR = join(dir, "rules");
process.env.DB_FILE = join(dir, "banking.db");
process.env.TOKEN_FILE = join(dir, "token");
process.env.TRUMF_COOKIE = "session";
after(() => rmSync(dir, { recursive: true, force: true }));
mock.method(console, "error", () => {});
const network = mock.method(globalThis, "fetch", () => {
  throw new Error("offline");
});
const { autoRefresh, visit } = await import("../../src/web/api.ts");

test("only the first visit of the day on the hosted server fetches", async () => {
  await visit();
  assert.equal(network.mock.callCount(), 0);

  autoRefresh();
  await visit();
  assert.ok(network.mock.callCount() > 0);

  network.mock.resetCalls();
  await visit();
  assert.equal(network.mock.callCount(), 0);
});
