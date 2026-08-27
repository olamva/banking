import assert from "node:assert/strict";
import { test } from "node:test";
import { DATA_DIR, RULES_DIR } from "../../src/core/paths.ts";

// A query string defeats the module cache, so the constants are read again.
const reread = (
  tag: string,
): Promise<typeof import("../../src/core/paths.ts")> =>
  import(new URL(`../../src/core/paths.ts?${tag}`, import.meta.url).href);

test("the roots default to the checkout layout", () => {
  assert.equal(DATA_DIR, "data");
  assert.equal(RULES_DIR, "rules");
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
