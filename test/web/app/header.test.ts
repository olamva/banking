import assert from "node:assert/strict";
import { test } from "node:test";
import { headerHidden } from "../../../src/web/app/data.ts";

test("the header leaves on a scroll down and returns on a scroll up", () => {
  assert.equal(headerHidden(400, 200, false, 160), true);
  assert.equal(headerHidden(200, 400, true, 160), false);
});

test("the header leaves shortly before its space leaves the screen", () => {
  assert.equal(headerHidden(130, 20, false, 160), false);
  assert.equal(headerHidden(140, 20, false, 160), true);
});

test("a taller bar holds the header down the page for longer", () => {
  assert.equal(headerHidden(200, 20, false, 160), true);
  assert.equal(headerHidden(200, 20, false, 240), false);
  assert.equal(headerHidden(220, 20, false, 240), true);
});

test("a move under 8 px changes nothing", () => {
  assert.equal(headerHidden(304, 300, false, 160), false);
  assert.equal(headerHidden(296, 300, true, 160), true);
});

test("the rubber band at the top does not hide the header", () => {
  assert.equal(headerHidden(-40, 0, false, 160), false);
});
