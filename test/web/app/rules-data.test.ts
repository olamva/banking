import assert from "node:assert/strict";
import test from "node:test";
import {
  changeRules,
  moveRules,
  type RulesData,
} from "../../../src/web/app/data.ts";

test("changeRules removes a map entry immediately", () => {
  assert.deepEqual(
    changeRules(
      { keep: "one", remove: "two" },
      "remove",
      undefined,
      undefined,
      true,
    ),
    { keep: "one" },
  );
});

test("moveRules applies rule history in both directions", () => {
  const data = {
    files: { categories: { old: "one", current: "two" } },
    history: {
      categories: [
        { at: 2, changes: [{ key: "current", to: "two" }] },
        { at: 1, changes: [{ key: "old", to: "one" }] },
      ],
    },
    at: { categories: 2 },
  } as unknown as RulesData;

  const older = moveRules(data, "categories", 1);
  assert.deepEqual(older.files.categories, { old: "one" });
  assert.deepEqual(moveRules(older, "categories", 2).files.categories, {
    old: "one",
    current: "two",
  });
});
