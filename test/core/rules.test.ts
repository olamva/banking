import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, beforeEach, test } from "node:test";
import { diffRules, isRuleFile } from "../../src/core/ruleFiles.ts";

const dir = mkdtempSync(join(tmpdir(), "rules-"));
process.env.RULES_DIR = dir;
after(() => rmSync(dir, { recursive: true, force: true }));

const rules = await import("../../src/core/rules.ts");
beforeEach(() => {
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir);
});

const put = (file: string, value: unknown) =>
  writeFileSync(`${dir}/${file}.json`, JSON.stringify(value, null, 2));

const asMap = (file: "categories" | "payees" | "giro" | "labels") =>
  rules.load(file) as Record<string, string>;

test("rule history supports undo, redo, restore, and edits after undo", () => {
  put("categories", { shop: "food" });
  const first = rules.save({
    file: "categories",
    key: "cafe",
    value: "dining",
  });
  const [newest, original] = rules.versions("categories");
  assert.equal(newest, first);
  assert.equal(rules.versions("categories").length, 2);
  assert.deepEqual(rules.readVersion("categories", first), {
    shop: "food",
    cafe: "dining",
  });
  assert.deepEqual(asMap("categories"), { shop: "food", cafe: "dining" });

  rules.undo("categories");
  assert.deepEqual(asMap("categories"), { shop: "food" });
  assert.equal(rules.current("categories"), original);
  assert.throws(() => rules.undo("categories"), /no undo left/);
  rules.redo("categories");
  assert.deepEqual(asMap("categories"), { shop: "food", cafe: "dining" });
  assert.throws(() => rules.redo("categories"), /no redo left/);

  const second = rules.save({
    file: "categories",
    key: "train",
    value: "travel",
  });
  rules.restore("categories", original!);
  assert.deepEqual(asMap("categories"), { shop: "food" });
  assert.deepEqual(rules.versions("categories"), [second, first, original]);
  const replacement = rules.save({
    file: "categories",
    key: "hotel",
    value: "travel",
  });
  assert.deepEqual(asMap("categories"), { shop: "food", hotel: "travel" });
  assert.deepEqual(rules.versions("categories"), [replacement, original]);
  assert.throws(() => rules.redo("categories"), /no redo left/);
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
  put("family", ["tarjei"]);
  rules.save({ file: "family", key: "tarjei" });
  assert.deepEqual(rules.load("family"), ["tarjei"]);
});

test("a broken regex is refused before it reaches the file", () => {
  put("categories", { rema: "dagligvarer/andre_dagligvarer" });
  assert.throws(
    () => rules.save({ file: "categories", key: "/(/", value: "mat/kantine" }),
    /not a valid regex/,
  );
  assert.deepEqual(Object.keys(asMap("categories")), ["rema"]);
});

test("an empty pattern and an empty value are both refused", () => {
  assert.throws(
    () => rules.save({ file: "categories", key: "  ", value: "mat/kantine" }),
    /pattern is empty/,
  );
  assert.throws(
    () => rules.save({ file: "categories", key: "kiwi", value: " " }),
    /needs a value/,
  );
});

test("a category value must name a subcategory or none at all", () => {
  assert.throws(
    () =>
      rules.save({ file: "categories", key: "kiwi", value: "dagligvarer/" }),
    /category or category\/subcategory/,
  );
  rules.save({ file: "categories", key: "kiwi", value: "dagligvarer" });
  assert.equal(asMap("categories")["kiwi"], "dagligvarer");
});

test("only the named rule files are rule files", () => {
  assert.equal(isRuleFile("categories"), true);
  assert.equal(isRuleFile("accounts"), false);
  assert.equal(isRuleFile("../../.env.local"), false);
  assert.equal(isRuleFile(null), false);
});

test("a file of the wrong shape is a fault, not an empty rule", () => {
  put("subscriptions", { telenor: "yes" });
  assert.throws(() => rules.load("subscriptions"), /not the shape/);
});

test("a missing file reads as empty on both shapes", () => {
  rmSync(`${dir}/labels.json`, { force: true });
  rmSync(`${dir}/not-subscriptions.json`, { force: true });
  assert.deepEqual(rules.load("labels"), {});
  assert.deepEqual(rules.load("not-subscriptions"), []);
});

test("undo refuses when the file has no version before this one", () => {
  put("not-subscriptions", []);
  assert.throws(() => rules.undo("not-subscriptions"), /no undo left/);
});

test("latest reports the newest version of every file, and 0 for none", () => {
  const saved = rules.save({ file: "categories", key: "shop", value: "food" });
  const stamps = rules.latest();
  assert.equal(stamps["not-subscriptions"], 0);
  assert.equal(stamps["categories"], saved);
});

test("versions stay distinct across a burst of edits", (t) => {
  t.mock.method(Date, "now", () => 1_800_000_000_000);
  put("labels", {});
  for (let i = 0; i < 20; i++)
    rules.save({ file: "labels", key: `slug_${i}`, value: `Name ${i}` });
  assert.equal(rules.versions("labels").length, 21);
  rules.undo("labels");
  assert.equal(Object.keys(asMap("labels")).length, 19);
  assert.equal(asMap("labels")["slug_19"], undefined);
});

test("a diff names the value on both sides of a change", () => {
  assert.deepEqual(
    diffRules({ a: "one", gone: "two" }, { a: "three", added: "four" }),
    [
      { key: "a", from: "one", to: "three" },
      { key: "added", to: "four" },
      { key: "gone", from: "two" },
    ],
  );
});

test("the history says what each version changed", () => {
  put("not-subscriptions", ["spotify"]);
  rules.save({ file: "not-subscriptions", key: "netflix" });
  rules.save({ file: "not-subscriptions", key: "spotify", remove: true });
  const [newest, added, first] = rules.history("not-subscriptions", 5);
  assert.deepEqual(newest!.changes, [{ key: "spotify", from: "" }]);
  assert.deepEqual(added!.changes, [{ key: "netflix", to: "" }]);
  // The first version holds the state before the first edit, so it changed
  // nothing.
  assert.deepEqual(first!.changes, []);
});

test("renaming a rule preserves its value and takes one history step", () => {
  put("payees", { old: "Shop", keep: "Other" });
  rules.save({ file: "payees", key: "new", was: "old", value: "Shop" });
  assert.deepEqual(asMap("payees"), { keep: "Other", new: "Shop" });
  assert.equal(rules.versions("payees").length, 2);
  rules.undo("payees");
  assert.deepEqual(asMap("payees"), { old: "Shop", keep: "Other" });
  put("family", ["old", "keep"]);
  rules.save({ file: "family", key: "new", was: "old" });
  assert.deepEqual(rules.load("family"), ["keep", "new"]);
  rules.undo("family");
  assert.deepEqual(rules.load("family"), ["old", "keep"]);
});

test("an invalid group edit changes no entry or history", () => {
  put("payees", { shop: "Shop" });
  assert.throws(
    () => rules.saveValues("payees", ["shop", "/(/"], "New"),
    /not a valid regex/,
  );
  assert.deepEqual(asMap("payees"), { shop: "Shop" });
  assert.deepEqual(rules.versions("payees"), []);
});

test("limited history retains the oldest visible change", () => {
  put("payees", { shop: "Original" });
  rules.save({ file: "payees", key: "shop", value: "First" });
  rules.save({ file: "payees", key: "shop", value: "Second" });
  assert.deepEqual(
    rules.history("payees", 1).map((v) => v.changes),
    [[{ key: "shop", from: "First", to: "Second" }]],
  );
});

test("a save preserves an external edit as an undo target", () => {
  rules.save({ file: "payees", key: "shop", value: "First" });
  put("payees", { shop: "External" });
  rules.save({ file: "payees", key: "shop", value: "Second" });
  rules.undo("payees");
  assert.deepEqual(asMap("payees"), { shop: "External" });
});
