import assert from "node:assert/strict";
import { test } from "node:test";
import { releaseProblems } from "../../infra/release-check.ts";
import { versioned, type Bump } from "../../src/web/app/releaseNotes.ts";

const note = (bump: Bump = "minor") => ({
  bump,
  highlights: [{ title: "Title", detail: "Detail" }],
});

const FIRST = "2026-09-14-1200-first.json";
const base = { [FIRST]: note("major") };

test("a new release after the newest one passes", () => {
  assert.deepEqual(
    releaseProblems({ ...base, "2026-09-23-0900-second.json": note() }, [
      FIRST,
    ]),
    [],
  );
});

test("a PR without a release fails unless it is exempt", () => {
  assert.equal(releaseProblems(base, [FIRST]).length, 1);
  assert.deepEqual(releaseProblems(base, [FIRST], true), []);
});

test("a new release that sorts before the newest one fails", () => {
  assert.equal(
    releaseProblems({ ...base, "2026-09-13-0900-early.json": note() }, [FIRST])
      .length,
    1,
  );
});

test("earlier releases stay in place", () => {
  assert.equal(
    releaseProblems({ "2026-09-23-0900-second.json": note() }, [FIRST]).length,
    1,
  );
});

test("a release needs a dated name, a bump and highlights", () => {
  assert.equal(
    releaseProblems({ "2026-02-30-0900-x.json": note() }, []).length,
    1,
  );
  assert.equal(releaseProblems({ "second.json": note() }, []).length, 1);
  assert.equal(
    releaseProblems(
      { "2026-09-23-0900-x.json": { ...note(), bump: "huge" as Bump } },
      [],
    ).length,
    1,
  );
  assert.equal(
    releaseProblems(
      { "2026-09-23-0900-x.json": { ...note(), highlights: [] } },
      [],
    ).length,
    1,
  );
});

test("versions follow the bumps in name order, newest first", () => {
  const releases = versioned({
    "./release-notes/2026-09-27-1300-b.json": note("patch"),
    "./release-notes/2026-09-14-1200-a.json": note("major"),
    "./release-notes/2026-09-27-1200-a.json": note("minor"),
    "./release-notes/2026-11-01-1200-a.json": note("major"),
    "./release-notes/2026-11-03-1200-a.json": note("minor"),
  });
  assert.deepEqual(
    releases.map((r) => [r.version, r.date]),
    [
      ["2.1.0", "2026-11-03"],
      ["2.0.0", "2026-11-01"],
      ["1.1.1", "2026-09-27"],
      ["1.1.0", "2026-09-27"],
      ["1.0.0", "2026-09-14"],
    ],
  );
});
