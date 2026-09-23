import assert from "node:assert/strict";
import { test } from "node:test";
import { releaseProblems } from "../../infra/release-check.ts";

const release = (version: string, date = "2026-09-14") => ({
  version,
  date,
  highlights: [{ title: "Title", detail: "Detail" }],
});

const base = [release("1.0.0")];

test("a new release at the start passes", () => {
  assert.deepEqual(
    releaseProblems([release("1.1.0", "2026-09-23"), ...base], base),
    [],
  );
});

test("a PR without a release fails unless it is exempt", () => {
  assert.equal(releaseProblems(base, base).length, 1);
  assert.deepEqual(releaseProblems(base, base, true), []);
});

test("a release must increase the version", () => {
  assert.equal(releaseProblems([release("1.0.0"), ...base], base).length, 1);
  assert.equal(releaseProblems([release("0.9.9"), ...base], base).length, 1);
  assert.deepEqual(releaseProblems([release("1.0.10"), ...base], base), []);
});

test("earlier releases stay in place", () => {
  assert.equal(releaseProblems([release("1.1.0")], base).length, 1);
  assert.equal(
    releaseProblems([release("1.0.0"), release("1.1.0")], base).length,
    2,
  );
});

test("a release needs a real date that does not predate the previous one", () => {
  assert.equal(
    releaseProblems([release("1.1.0", "2026-02-30"), ...base], base).length,
    2,
  );
  assert.equal(
    releaseProblems([release("1.1.0", "2026-09-13"), ...base], base).length,
    1,
  );
});

test("a release needs highlights with text", () => {
  assert.equal(
    releaseProblems([{ ...release("1.1.0"), highlights: [] }, ...base], base)
      .length,
    1,
  );
});
