import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { parseOptions } from "../src/bank.ts";

const CLI = fileURLToPath(new URL("../src/bank.ts", import.meta.url));

test("the application CLI parses period and transaction filters", () => {
  assert.deepEqual(
    parseOptions([
      "--from",
      "2026-08-01",
      "--to",
      "2026-08-31",
      "--account",
      "Daily",
      "--category",
      "food/groceries",
      "--search",
      "shop",
      "--include-excluded",
      "--limit",
      "10",
    ]),
    {
      from: "2026-08-01",
      to: "2026-08-31",
      search: "shop",
      account: ["Daily"],
      category: ["food/groceries"],
      includeExcluded: true,
      limit: 10,
    },
  );
});

test("the application CLI rejects an invalid period", () => {
  assert.throws(
    () => parseOptions(["--from", "2026-09-01", "--to", "2026-08-01"]),
    /must not follow/,
  );
});

test("the application CLI runs through a symlink on the PATH", () => {
  const link = join(mkdtempSync(join(tmpdir(), "bank-")), "banking");
  symlinkSync(CLI, link);
  const run = spawnSync(process.execPath, [link], { encoding: "utf8" });
  assert.equal(run.status, 1);
  assert.match(run.stderr, /^usage: banking/);
});

test("the application CLI prints the usage to stdout and succeeds", () => {
  for (const flag of ["--help", "-h"]) {
    const run = spawnSync(process.execPath, [CLI, flag], { encoding: "utf8" });
    assert.equal(run.status, 0, flag);
    assert.match(run.stdout, /^usage: banking/);
    assert.equal(run.stderr, "");
  }
});

test("the application CLI answers help after a command", () => {
  const run = spawnSync(process.execPath, [CLI, "transactions", "--help"], {
    encoding: "utf8",
  });
  assert.equal(run.status, 0);
  assert.match(run.stdout, /^usage: banking/);
});

test("the application CLI still fails when it gets no command", () => {
  const run = spawnSync(process.execPath, [CLI], { encoding: "utf8" });
  assert.equal(run.status, 1);
  assert.match(run.stderr, /^usage: banking/);
});
