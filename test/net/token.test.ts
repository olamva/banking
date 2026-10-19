import assert from "node:assert/strict";
import { mkdtempSync, readdirSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import { getToken, setToken } from "../../src/net/token.ts";

const dir = mkdtempSync(join(tmpdir(), "token-"));
const file = join(dir, "refresh-token");
process.env.TOKEN_FILE = file;
after(() => {
  delete process.env.TOKEN_FILE;
  rmSync(dir, { recursive: true, force: true });
});

test("a token file holds only the newest token, and only its owner may read it", async () => {
  assert.equal(await getToken(), null);
  await setToken("first");
  await setToken("second");
  assert.equal(await getToken(), "second");
  assert.equal(statSync(file).mode & 0o777, 0o600);
  assert.deepEqual(readdirSync(dir), ["refresh-token"]);
});
