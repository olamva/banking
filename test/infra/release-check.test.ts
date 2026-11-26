import assert from "node:assert/strict";
import { test } from "node:test";
import { releaseProblems } from "../../infra/release-check.ts";
import {
  versioned,
  type Bump,
  type Highlight,
} from "../../src/web/app/releaseNotes.ts";

const HIGHLIGHT: Highlight = {
  title: "Title",
  detail: "Detail",
  area: "items",
  kind: "new",
};

const note = (bump: Bump = "minor", highlights = [HIGHLIGHT]) => ({
  bump,
  highlights,
});

const FIRST = "2026-09-14-1200-first.json";
const base = { [FIRST]: note("major") };

test("a new release with a short title passes", () => {
  assert.deepEqual(
    releaseProblems({ ...base, "second.json": note() }, [FIRST]),
    [],
  );
});

test("a PR without a release fails unless it is exempt", () => {
  assert.equal(releaseProblems(base, [FIRST]).length, 1);
  assert.deepEqual(releaseProblems(base, [FIRST], true), []);
});

test("a new release with a timestamp in its name fails", () => {
  for (const name of ["2026-09-23-0900-x.json", "2026-09-23T090000-x.json"])
    assert.equal(
      releaseProblems({ ...base, [name]: note() }, [FIRST]).length,
      1,
    );
});

test("stamped releases from main pass", () => {
  assert.deepEqual(
    releaseProblems(
      { ...base, "2026-09-23T090000-x.json": note(), "y.json": note() },
      [FIRST, "2026-09-23T090000-x.json"],
    ),
    [],
  );
});

test("earlier releases stay in place", () => {
  assert.equal(releaseProblems({ "second.json": note() }, [FIRST]).length, 1);
});

test("a release needs a valid name, a bump and highlights", () => {
  assert.equal(
    releaseProblems(
      { "2026-02-30-0900-x.json": note() },
      ["2026-02-30-0900-x.json"],
      true,
    ).length,
    1,
  );
  assert.equal(releaseProblems({ "Second.json": note() }, []).length, 1);
  assert.equal(
    releaseProblems({ "x.json": { ...note(), bump: "huge" as Bump } }, [])
      .length,
    1,
  );
  assert.equal(
    releaseProblems({ "x.json": { ...note(), highlights: [] } }, []).length,
    1,
  );
});

test("a release keeps its text short and tags each highlight", () => {
  const problems = (...highlights: Highlight[]) =>
    releaseProblems({ "x.json": note("minor", highlights) }, []).length;
  assert.equal(problems(HIGHLIGHT, HIGHLIGHT, HIGHLIGHT), 0);
  assert.equal(problems(HIGHLIGHT, HIGHLIGHT, HIGHLIGHT, HIGHLIGHT), 1);
  assert.equal(problems({ ...HIGHLIGHT, title: "t".repeat(41) }), 1);
  assert.equal(problems({ ...HIGHLIGHT, detail: "d".repeat(101) }), 1);
  assert.equal(
    problems({ ...HIGHLIGHT, area: "kitchen" as Highlight["area"] }),
    1,
  );
  assert.equal(
    problems({ ...HIGHLIGHT, kind: "huge" as Highlight["kind"] }),
    1,
  );
});

test("versions follow the bumps in name order, newest first", () => {
  const releases = versioned({
    "./release-notes/2026-09-27-1300-b.json": note("patch"),
    "./release-notes/2026-09-14-1200-a.json": note("major"),
    "./release-notes/2026-09-27-1200-a.json": note("minor"),
    "./release-notes/2026-11-01-1200-a.json": note("major"),
    "./release-notes/2026-11-03T090000-b.json": note("patch"),
    "./release-notes/2026-11-03-1200-a.json": note("minor"),
  });
  assert.deepEqual(
    releases.map((r) => [r.version, r.date]),
    [
      ["2.1.1", "2026-11-03"],
      ["2.1.0", "2026-11-03"],
      ["2.0.0", "2026-11-01"],
      ["1.1.1", "2026-09-27"],
      ["1.1.0", "2026-09-27"],
      ["1.0.0", "2026-09-14"],
    ],
  );
});
