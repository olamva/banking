import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import { fileURLToPath } from "node:url";

const lib = fileURLToPath(new URL("../../infra/rules-lib.sh", import.meta.url));

// The deploy guard runs in bash, so test it in bash. `ahead` and `behind` are
// each a listing of rules/.history, one name per line.
const behind = (ahead: string, other: string): string =>
  execFileSync(
    "bash",
    ["-c", `. "$0"; behind_files "$1" "$2"`, lib, ahead, other],
    { encoding: "utf8" },
  );

const at = (stamp: number, file: string) => `${stamp}-${file}.json`;

test("nothing is behind when both sides hold the same versions", () => {
  const same = [
    at(1756300000000, "overrides"),
    at(1756300000000, "payees"),
  ].join("\n");
  assert.equal(behind(same, same), "");
});

test("an older stamp on the other side is named", () => {
  const out = behind(
    at(1756400000000, "overrides"),
    at(1756300000000, "overrides"),
  );
  assert.match(out, /overrides\.json/);
});

test("a newer stamp on the other side is not named", () => {
  const out = behind(
    at(1756300000000, "overrides"),
    at(1756400000000, "overrides"),
  );
  assert.equal(out, "");
});

// The first pull or the first deploy after this change. One side has no
// history at all, and that is not a conflict for the side that has none.
test("a file the other side has never versioned is named", () => {
  const out = behind(at(1756300000000, "giro"), "");
  assert.match(out, /giro\.json/);
  assert.match(out, /never/);
});

test("a file this side has never versioned is not named", () => {
  assert.equal(behind("", at(1756300000000, "giro")), "");
});

// The stamp is milliseconds, so a plain string compare would put a shorter
// number first. It must compare as a number.
test("the newest stamp wins, not the last line", () => {
  const out = behind(
    [at(1756300000000, "payees"), at(999, "payees")].join("\n"),
    at(1756200000000, "payees"),
  );
  assert.match(out, /payees\.json/);
});

test("a name that is not a version is ignored", () => {
  assert.equal(behind([".gitignore", "overrides.json"].join("\n"), ""), "");
});

test("every rule file is compared, and no other name is", () => {
  const all = [
    "overrides",
    "giro",
    "payees",
    "categories",
    "family",
    "subscriptions",
    "not-subscriptions",
  ];
  const out = behind(
    [...all, "accounts"].map((f) => at(1756300000000, f)).join("\n"),
    "",
  );
  for (const f of all) assert.match(out, new RegExp(`${f}\\.json`));
  assert.doesNotMatch(out, /accounts\.json/);
});

// The other half of the guard. A step through the history rewrites the live
// file and writes no version, so the stamps stay level and only the content
// says that the two sides stand apart.
const dirs: string[] = [];
after(() => dirs.forEach((d) => rmSync(d, { recursive: true, force: true })));

const side = (files: Record<string, string>): string => {
  const dir = mkdtempSync(join(tmpdir(), "rules-live-"));
  dirs.push(dir);
  for (const [name, body] of Object.entries(files))
    writeFileSync(join(dir, `${name}.json`), body);
  return dir;
};

const differs = (a: string, b: string): string =>
  execFileSync("bash", ["-c", `. "$0"; live_diff "$1" "$2"`, lib, a, b], {
    encoding: "utf8",
  });

test("no line where both sides hold the same live file", () => {
  const body = '{"rema":"dagligvarer/andre_dagligvarer"}';
  assert.equal(
    differs(side({ overrides: body }), side({ overrides: body })),
    "",
  );
});

test("a live file that differs is named", () => {
  const out = differs(
    side({ overrides: '{"rema":"dagligvarer/andre_dagligvarer"}' }),
    side({ overrides: "{}" }),
  );
  assert.match(out, /overrides\.json/);
});

// A first deploy, and a file that only one side has ever written. Nothing to
// compare is not a difference.
test("a file that one side lacks is not named", () => {
  assert.equal(differs(side({ giro: "{}" }), side({})), "");
});

test("a name that is not a rule file is not compared", () => {
  assert.equal(
    differs(side({ accounts: "[1]" }), side({ accounts: "[2]" })),
    "",
  );
});
