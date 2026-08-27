import assert from "node:assert/strict";
import { test } from "node:test";
import { headerShown } from "../../../src/web/app/data.ts";

test("the header sticks on a scroll up and lets go on a scroll down", () => {
  assert.equal(headerShown(200, 400, false), true);
  assert.equal(headerShown(400, 200, true), false);
});

test("the header lets go from the first pixel, wherever the page sits", () => {
  assert.equal(headerShown(20, 0, true), false);
  assert.equal(headerShown(900, 800, true), false);
});

test("a move under 8 px changes nothing", () => {
  assert.equal(headerShown(304, 300, false), false);
  assert.equal(headerShown(296, 300, true), true);
});

test("the rubber band at the top counts as a scroll up", () => {
  assert.equal(headerShown(-40, 0, false), true);
});
