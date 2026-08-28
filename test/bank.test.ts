import assert from "node:assert/strict";
import test from "node:test";
import { parseOptions } from "../src/bank.ts";

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
