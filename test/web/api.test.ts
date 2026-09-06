import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, afterEach, beforeEach, mock, test } from "node:test";
import { totals } from "../../src/core/stats.ts";
import type { Categorized } from "../../src/core/types.ts";
import { preferenceKey } from "../../src/core/preferences.ts";
import { haystackOf } from "../../src/core/match.ts";

const dir = mkdtempSync(join(tmpdir(), "api-"));
process.env.DATA_DIR = join(dir, "data");
process.env.RULES_DIR = join(dir, "rules");
process.env.DB_FILE = join(dir, "banking.db");
after(() => rmSync(dir, { recursive: true, force: true }));
const { rebuildAll, netByReason } = await import("../../src/core/pipeline.ts");
const { payload, rulesRoute } = await import("../../src/web/api.ts");

const put = (path: string, value: unknown) =>
  writeFileSync(join(dir, path), JSON.stringify(value));
const readRows = (): Categorized[] => JSON.parse(payload()).txns;
const edit = (route: string, params: Record<string, string>) =>
  rulesRoute(`/api/rules/${route}`, new URLSearchParams(params), "1")!;

const network = mock.method(globalThis, "fetch", () => {
  throw new Error("Offline analysis must not fetch");
});

test("remembered categories survive rebuild and undo without changing totals", async () => {
  await rebuildAll();
  const before = readRows();
  const purchase = before.find((t) => t.id === "purchase")!;
  assert.equal(purchase.originalCounterparty, "SHOP");
  assert.equal(haystackOf(purchase).includes("ikea"), false);
  const key = preferenceKey(purchase)!;
  assert.equal(
    (await edit("save", { file: "preferences", key, value: "home/furniture" }))
      .status,
    200,
  );
  let rows = readRows();
  assert.equal(
    rows.find((t) => t.id === "purchase")!.categorySource,
    "Remembered category",
  );
  assert.equal(rows.find((t) => t.id === "refund")!.category, "food");
  assert.deepEqual(totals(rows), totals(before));
  assert.equal((await edit("rebuild", {})).status, 200);
  assert.equal(readRows().find((t) => t.id === "purchase")!.category, "home");
  assert.equal((await edit("undo", { file: "preferences" })).status, 200);
  rows = readRows();
  assert.equal(rows.find((t) => t.id === "purchase")!.category, "food");
  assert.deepEqual(totals(rows), totals(before));
  assert.equal((await edit("redo", { file: "preferences" })).status, 200);
  assert.equal(readRows().find((t) => t.id === "purchase")!.category, "home");
});

test("invalid preferences change no rules and rebuild requires the request header", async () => {
  const before = (
    await rulesRoute("/api/rules", new URLSearchParams(), undefined)!
  ).body;
  assert.equal(
    (await edit("save", { file: "preferences", key: "[]", value: "food" }))
      .status,
    400,
  );
  assert.equal(
    (await rulesRoute("/api/rules", new URLSearchParams(), undefined)!).body,
    before,
  );
  assert.equal(
    (await rulesRoute("/api/rules/rebuild", new URLSearchParams(), undefined)!)
      .status,
    405,
  );
});

test("subcategory collisions produce warnings without DEBUG", async (t) => {
  put("rules/categories.json", {
    shop: "food/groceries",
    "/shop/": "food/dining",
  });
  const warning = t.mock.method(console, "error", () => {});
  delete process.env.DEBUG;
  await rebuildAll();
  assert.ok(
    warning.mock.calls.some((c) => String(c.arguments[0]).includes("warning:")),
  );
});
afterEach(() => assert.equal(network.mock.callCount(), 0));
after(() => mock.restoreAll());

beforeEach(() => {
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(join(dir, "data/raw/2026-07"), { recursive: true });
  mkdirSync(join(dir, "rules"));
  put("rules/accounts.json", {
    a: { mine: true, name: "Daily" },
    b: { mine: true, name: "Savings" },
    card: { mine: false, card: true, name: "Card" },
  });
  put("rules/categories.json", { shop: "food/groceries" });
  put("rules/payees.json", { shop: "IKEA" });
  put("rules/countries.json", { abroad: "Japan" });
  put("rules/subscriptions.json", ["shop"]);
  put("rules/labels.json", { food: "Food" });
  const raw = (
    id: string,
    accountKey: string,
    amount: number,
    description: string,
    typeText = "VISA Varekjøp",
  ) => ({
    transaction: {
      id,
      accountKey,
      amount,
      description,
      cleanedDescription: description,
      date: Date.UTC(2026, 5, 30, 22),
      typeText,
    },
    categories: [],
  });
  put("data/raw/2026-07/a.json", {
    transactions: [
      raw("purchase", "a", -100.25, "SHOP"),
      raw("refund", "a", 20.1, "SHOP"),
      raw("out", "a", -500, "Transfer", "Overføring"),
    ],
  });
  put("data/raw/2026-07/b.json", {
    transactions: [raw("in", "b", 500, "Transfer", "Overføring")],
  });
  put("data/raw/2026-07/card.json", {
    transactions: [raw("trip", "card", -30.05, "ABROAD, TOKYO, JPN")],
  });
});

test("rebuild applies rules before names and preserves money through the payload", async () => {
  assert.equal(await rebuildAll(), 5);
  const rows = readRows();
  const purchase = rows.find((r) => r.id === "purchase")!;
  assert.deepEqual(
    [
      purchase.date,
      purchase.account,
      purchase.counterparty,
      purchase.category,
      purchase.subcategory,
      purchase.isSubscription,
    ],
    ["2026-07-01", "Daily", "IKEA", "food", "groceries", true],
  );
  const trip = rows.find((r) => r.id === "trip")!;
  assert.deepEqual([trip.country, trip.category], ["Japan", "reise"]);
  assert.deepEqual(totals(rows), {
    totalIn: 20.1,
    totalOut: 130.3,
    net: -110.2,
    excluded: { count: 2, total: 1000 },
  });
  assert.deepEqual([...netByReason(rows)], [["internal transfer", 0]]);
  assert.deepEqual(JSON.parse(payload()).names, { food: "Food" });
  rmSync(join(dir, "data/raw/2026-07/card.json"));
  assert.equal(await rebuildAll(), 4);
  assert.deepEqual(
    readRows()
      .map((r) => r.id)
      .sort(),
    ["in", "out", "purchase", "refund"],
  );
});

test("rule saves and history changes rebuild the payload before they return", async () => {
  const saved = await edit("save", {
    file: "categories",
    key: "shop",
    value: "home/furniture",
  });
  assert.equal(saved.status, 200);
  assert.equal(JSON.parse(saved.body).rows, 5);
  const category = () => readRows().find((r) => r.id === "purchase")!.category;
  assert.equal(category(), "home");
  assert.equal((await edit("undo", { file: "categories" })).status, 200);
  assert.equal(category(), "food");
  assert.equal((await edit("redo", { file: "categories" })).status, 200);
  assert.equal(category(), "home");
  const history = JSON.parse(
    (await rulesRoute("/api/rules", new URLSearchParams(), undefined)!).body,
  ).history.categories;
  assert.equal(
    (
      await edit("restore", {
        file: "categories",
        at: String(history.at(-1).at),
      })
    ).status,
    200,
  );
  assert.equal(category(), "food");
});

test("invalid rule requests preserve the file and history", async () => {
  const before = (
    await rulesRoute("/api/rules", new URLSearchParams(), undefined)!
  ).body;
  for (const at of ["", "0", "-1", "1.5", "Infinity", "missing", "123"]) {
    assert.equal(
      (await edit("restore", { file: "categories", at })).status,
      400,
    );
  }
  assert.equal(
    (await edit("save", { file: "categories", key: "/(/", value: "food" }))
      .status,
    400,
  );
  assert.equal((await edit("missing", { file: "categories" })).status, 404);
  assert.equal(
    (await rulesRoute("/api/rules", new URLSearchParams(), undefined)!).body,
    before,
  );
});

test("a rebuild failure returns an error instead of a successful rule response", async () => {
  writeFileSync(join(dir, "data/raw/2026-07/a.json"), "invalid json");
  const response = await edit("save", {
    file: "categories",
    key: "shop",
    value: "home",
  });
  assert.equal(response.status, 500);
  assert.match(JSON.parse(response.body).error, /2026-07/);
});
