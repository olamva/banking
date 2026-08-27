import assert from "node:assert/strict";
import { test } from "node:test";
import { DATA_DIR, DB_FILE, RULES_DIR } from "../../src/core/paths.ts";

// A query string defeats the module cache, so the constants are read again.
const reread = (
  tag: string,
): Promise<typeof import("../../src/core/paths.ts")> =>
  import(new URL(`../../src/core/paths.ts?${tag}`, import.meta.url).href);

test("the roots default to the checkout layout", () => {
  assert.equal(DATA_DIR, "data");
  assert.equal(RULES_DIR, "rules");
  assert.equal(DB_FILE, "data/banking.db");
});

test("the environment moves a root, and a trailing slash goes", async () => {
  process.env.DATA_DIR = "/home/data/";
  process.env.RULES_DIR = "/home/data/rules";
  try {
    const again = await reread("moved");
    assert.equal(again.DATA_DIR, "/home/data");
    assert.equal(again.RULES_DIR, "/home/data/rules");
  } finally {
    delete process.env.DATA_DIR;
    delete process.env.RULES_DIR;
  }
});

test("an empty value falls back rather than making a relative path", async () => {
  process.env.DATA_DIR = "";
  try {
    assert.equal((await reread("empty")).DATA_DIR, "data");
  } finally {
    delete process.env.DATA_DIR;
  }
});

test("the database follows the data root by default", async () => {
  process.env.DATA_DIR = "/data";
  try {
    assert.equal((await reread("dbroot")).DB_FILE, "/data/banking.db");
  } finally {
    delete process.env.DATA_DIR;
  }
});

// SQLite needs locks that an SMB share does not carry, so the deployment puts
// the database on the local disk while the raw files stay on the volume.
test("the database moves off the data root on its own", async () => {
  process.env.DATA_DIR = "/data";
  process.env.DB_FILE = "/tmp/banking.db";
  try {
    const again = await reread("dbfile");
    assert.equal(again.DB_FILE, "/tmp/banking.db");
    assert.equal(again.DATA_DIR, "/data");
  } finally {
    delete process.env.DATA_DIR;
    delete process.env.DB_FILE;
  }
});
