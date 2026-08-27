import assert from "node:assert/strict";
import { test } from "node:test";
import { headerHidden } from "../../../src/web/app/data.ts";

test("the header leaves on a scroll down and returns on a scroll up", () => {
  assert.equal(headerHidden(400, 200, false), true);
  assert.equal(headerHidden(200, 400, true), false);
});

test("the header stays up over the top of the page", () => {
  assert.equal(headerHidden(60, 0, false), false);
  assert.equal(headerHidden(0, 60, true), false);
});

test("a move under 8 px changes nothing", () => {
  assert.equal(headerHidden(304, 300, false), false);
  assert.equal(headerHidden(296, 300, true), true);
});

test("the rubber band at the top does not hide the header", () => {
  assert.equal(headerHidden(-40, 0, false), false);
});
