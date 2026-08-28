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
    files: { overrides: { old: "one", current: "two" } },
    history: {
      overrides: [
        { at: 2, changes: [{ key: "current", to: "two" }] },
        { at: 1, changes: [{ key: "old", to: "one" }] },
      ],
    },
    at: { overrides: 2 },
  } as unknown as RulesData;

  const older = moveRules(data, "overrides", 1);
  assert.deepEqual(older.files.overrides, { old: "one" });
  assert.deepEqual(moveRules(older, "overrides", 2).files.overrides, {
    old: "one",
    current: "two",
  });
});
