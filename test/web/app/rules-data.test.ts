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

test("optimistic renames preserve other entries on both rule shapes", () => {
  const map = { old: "Shop", keep: "Other" };
  assert.deepEqual(changeRules(map, "new", "Shop", "old"), {
    keep: "Other",
    new: "Shop",
  });
  assert.deepEqual(map, { old: "Shop", keep: "Other" });
  const list = ["old", "keep"];
  assert.deepEqual(changeRules(list, "new", undefined, "old"), ["keep", "new"]);
  assert.deepEqual(changeRules(list, "keep"), ["old", "keep"]);
  assert.deepEqual(changeRules(list, "old", undefined, undefined, true), [
    "keep",
  ]);
  assert.deepEqual(list, ["old", "keep"]);
});

test("history restores replacements and removals across multiple versions", () => {
  const data = {
    files: { payees: { shop: "New", added: "Added" }, family: ["new"] },
    history: {
      payees: [
        {
          at: 3,
          changes: [
            { key: "gone", from: "Gone" },
            { key: "added", to: "Added" },
          ],
        },
        { at: 2, changes: [{ key: "shop", from: "Old", to: "New" }] },
        { at: 1, changes: [] },
      ],
      family: [
        { at: 3, changes: [{ key: "old", from: "" }] },
        { at: 2, changes: [{ key: "new", to: "" }] },
        { at: 1, changes: [] },
      ],
    },
    at: { payees: 3, family: 3 },
  } as unknown as RulesData;
  const older = moveRules(data, "payees", 1);
  assert.deepEqual(older.files.payees, { shop: "Old", gone: "Gone" });
  assert.deepEqual(older.at, { payees: 1, family: 3 });
  assert.deepEqual(moveRules(older, "payees", 3), data);
  const family = moveRules(data, "family", 1);
  assert.deepEqual(family.files.family, ["old"]);
  assert.deepEqual(moveRules(family, "family", 3), data);
  assert.deepEqual(moveRules(data, "payees", 99), data);
  assert.deepEqual(data.files.payees, { shop: "New", added: "Added" });
});
