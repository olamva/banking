import assert from "node:assert/strict";
import { mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";

// RULES_DIR is read when the module loads, so point it at a scratch directory
// before the import. The real rules are never touched by this file.
const dir = mkdtempSync(join(tmpdir(), "rules-"));
process.env.RULES_DIR = dir;
after(() => rmSync(dir, { recursive: true, force: true }));

const rules = await import("../../src/core/rules.ts");

const put = (file: string, value: unknown) =>
  writeFileSync(`${dir}/${file}.json`, JSON.stringify(value, null, 2));

const asMap = (file: "overrides" | "payees" | "giro" | "categories") =>
  rules.load(file) as Record<string, string>;

test("a save adds an entry and an empty history gains two versions", () => {
  put("overrides", { rema: "dagligvarer/andre_dagligvarer" });
  rules.save({ file: "overrides", key: "kiwi", value: "dagligvarer/kiwi" });

  assert.deepEqual(asMap("overrides"), {
    rema: "dagligvarer/andre_dagligvarer",
    kiwi: "dagligvarer/kiwi",
  });
  // The state before the first edit, and the state after it. Without the first
  // one, a file edited by hand has nothing to go back to.
  assert.equal(rules.versions("overrides").length, 2);
});

test("the newest version holds what the live file holds", () => {
  const [newest] = rules.versions("overrides");
  assert.deepEqual(rules.readVersion("overrides", newest!), asMap("overrides"));
});

test("undo steps one edit back, and it keeps every version", () => {
  const before = rules.versions("overrides").length;
  rules.undo("overrides");
  assert.deepEqual(asMap("overrides"), {
    rema: "dagligvarer/andre_dagligvarer",
  });
  assert.equal(rules.versions("overrides").length, before + 1);
});

test("a second undo returns to where it started", () => {
  rules.undo("overrides");
  assert.deepEqual(asMap("overrides"), {
    rema: "dagligvarer/andre_dagligvarer",
    kiwi: "dagligvarer/kiwi",
  });
});

test("restore names any version, however far back", () => {
  const oldest = rules.versions("overrides").at(-1)!;
  rules.restore("overrides", oldest);
  assert.deepEqual(asMap("overrides"), {
    rema: "dagligvarer/andre_dagligvarer",
  });
});

test("a remove drops the entry", () => {
  put("payees", { nsb: "Vy", tekna: "Tekna" });
  rules.save({ file: "payees", key: "nsb", remove: true });
  assert.deepEqual(asMap("payees"), { tekna: "Tekna" });
});

test("one value edit updates every pattern in its group", () => {
  put("payees", { old: "Shop", older: "Shop", other: "Other" });
  rules.saveValues("payees", ["old", "older"], "New shop");
  assert.deepEqual(asMap("payees"), {
    old: "New shop",
    older: "New shop",
    other: "Other",
  });
});

test("an edit keeps the order of every other line", () => {
  put("giro", { a: "faste_utgifter/boligutgifter", b: "reise/annen_reise" });
  rules.save({ file: "giro", key: "a", value: "reise/annen_reise" });
  rules.save({ file: "giro", key: "c", value: "innskudd/lommepenger" });
  assert.deepEqual(Object.keys(rules.load("giro")), ["a", "b", "c"]);
});

test("a list file takes a bare entry, and a remove drops it", () => {
  put("family", ["anette"]);
  rules.save({ file: "family", key: "tarjei" });
  assert.deepEqual(rules.load("family"), ["anette", "tarjei"]);
  rules.save({ file: "family", key: "anette", remove: true });
  assert.deepEqual(rules.load("family"), ["tarjei"]);
});

test("a repeated entry does not double on a list", () => {
  rules.save({ file: "family", key: "tarjei" });
  assert.deepEqual(rules.load("family"), ["tarjei"]);
});

// A pattern that does not compile would break every category at the next
// rebuild, not only its own line.
test("a broken regex is refused before it reaches the file", () => {
  put("overrides", { rema: "dagligvarer/andre_dagligvarer" });
  assert.throws(
    () => rules.save({ file: "overrides", key: "/(/", value: "mat/kantine" }),
    /not a valid regex/,
  );
  assert.deepEqual(Object.keys(asMap("overrides")), ["rema"]);
});

test("an empty pattern and an empty value are both refused", () => {
  assert.throws(
    () => rules.save({ file: "overrides", key: "  ", value: "mat/kantine" }),
    /pattern is empty/,
  );
  assert.throws(
    () => rules.save({ file: "overrides", key: "kiwi", value: " " }),
    /needs a value/,
  );
});

// Every rule names both levels, or the page reads it as the category with
// "Annet" below it.
test("a category value must name a subcategory or none at all", () => {
  assert.throws(
    () => rules.save({ file: "overrides", key: "kiwi", value: "dagligvarer/" }),
    /category or category\/subcategory/,
  );
  rules.save({ file: "overrides", key: "kiwi", value: "dagligvarer" });
  assert.equal(asMap("overrides")["kiwi"], "dagligvarer");
});

// The file name arrives in a query string, so it is the one value that could
// name a path.
test("only the named rule files are rule files", () => {
  assert.equal(rules.isRuleFile("overrides"), true);
  assert.equal(rules.isRuleFile("accounts"), false);
  assert.equal(rules.isRuleFile("../../.env.local"), false);
  assert.equal(rules.isRuleFile(null), false);
});

test("a file of the wrong shape is a fault, not an empty rule", () => {
  put("subscriptions", { telenor: "yes" });
  assert.throws(() => rules.load("subscriptions"), /not the shape/);
});

test("a missing file reads as empty on both shapes", () => {
  rmSync(`${dir}/categories.json`, { force: true });
  rmSync(`${dir}/not-subscriptions.json`, { force: true });
  assert.deepEqual(rules.load("categories"), {});
  assert.deepEqual(rules.load("not-subscriptions"), []);
});

test("undo refuses when the file has no version before this one", () => {
  put("not-subscriptions", []);
  assert.throws(() => rules.undo("not-subscriptions"), /no undo left/);
});

test("latest reports the newest version of every file, and 0 for none", () => {
  const stamps = rules.latest();
  assert.equal(stamps["not-subscriptions"], 0);
  assert.equal(stamps["overrides"], rules.versions("overrides")[0]);
});

// Two writes in one millisecond would otherwise share a file name, and one of
// them would disappear.
test("versions stay distinct across a burst of edits", () => {
  put("categories", {});
  for (let i = 0; i < 20; i++)
    rules.save({ file: "categories", key: `slug_${i}`, value: `Name ${i}` });
  const names = readdirSync(`${dir}/.history`).filter((n) =>
    n.endsWith("-categories.json"),
  );
  assert.equal(new Set(names).size, names.length);
  assert.equal(rules.versions("categories").length, 21);
});
