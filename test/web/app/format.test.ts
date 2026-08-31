import assert from "node:assert/strict";
import test from "node:test";
import { NO_SUB, buildLabels } from "../../../src/core/labels.ts";
import type { Categorized } from "../../../src/core/types.ts";
import {
  ID_FIELD,
  bankLabel,
  categoryColor,
  categoryLabel,
  fmtDate,
  fmtNOKExact,
  rowLabel,
  setCategoryHues,
  setLabels,
  txnFields,
} from "../../../src/web/app/format.ts";

const row: Categorized = {
  id: "row-1",
  accountKey: "secret-key",
  account: "Brukskonto",
  date: "2026-07-04",
  amount: -249.5,
  description: "a description",
  counterparty: null,
  country: null,
  bankCategory: "dagligvarer",
  bankSub: "andre_dagligvarer",
  bankCategoryName: "Dagligvarer",
  bankSubName: "Andre dagligvarer",
  bankConfidence: 100,
  remoteAccountNumber: null,
  typeText: "VISA Varekjøp",
  isPending: false,
  isRecurring: false,
  isSubscription: false,
  excluded: false,
  reason: null,
  category: "dagligvarer",
  subcategory: null,
};

test("txnFields never shows the account key", () => {
  const names = txnFields(row).map(([name]) => name);
  assert.ok(!names.includes("Account key"));
  assert.ok(!txnFields(row).some(([, value]) => value === "secret-key"));
});

test("txnFields drops the fields the bank sent nothing for", () => {
  const names = txnFields(row).map(([name]) => name);
  assert.ok(!names.includes("Merchant"), "a null counterparty is no row");
  assert.ok(!names.includes("Excluded because"), "a null reason is no row");
  assert.deepEqual(
    txnFields(row).find(([name]) => name === "Excluded"),
    ["Excluded", "No"],
    "a false boolean is still a row",
  );
});

test("txnFields keeps the øre, unlike every summed figure", () => {
  const amount = txnFields(row).find(([name]) => name === "Amount");
  assert.equal(amount?.[1], fmtNOKExact(-249.5));
  assert.match(amount![1], /50/);
});

test("txnFields drops what the caller already shows itself", () => {
  const names = txnFields(row, ["amount", "date"]).map(([name]) => name);
  assert.ok(!names.includes("Amount"));
  assert.ok(!names.includes("Date"));
  assert.ok(names.includes("Description"), "and nothing else");
});

test("bankLabel reads as a name and pastes as a rule", () => {
  assert.deepEqual(bankLabel(row), [
    "Dagligvarer / Andre dagligvarer",
    "dagligvarer/andre_dagligvarer",
  ]);
});

test("bankLabel keeps a main the bank sent no sub for whole", () => {
  const [name, slug] = bankLabel({ ...row, bankSub: null, bankSubName: null })!;
  assert.equal(name, "Dagligvarer", "no trailing slash in the name");
  assert.equal(
    slug,
    "dagligvarer",
    "nor in the slug a rule is written against",
  );
  assert.equal(bankLabel({ ...row, bankCategory: null }), null);
});

test("fmtDate reads the date as the Oslo day it already is", () => {
  assert.equal(fmtDate("2026-07-01"), "1. juli 2026");
});

test("txnFields names a field after its key when it reads as one", () => {
  const names = txnFields(row).map(([name]) => name);
  assert.ok(names.includes("Bank confidence"));
  assert.ok(names.includes(ID_FIELD), "and after FIELD_NAMES when not");
});

const MAINS = [
  "annet_lan_og_gjeld",
  "bil_og_transport",
  "dagligvarer",
  "diverse",
  "faste_utgifter",
  "forsikring",
  "helse_og_velvaere",
  "hjem_og_hage",
  "hobby_og_fritid",
  "innskudd",
  "kafe_og_restaurant",
  "klaer_og_utstyr",
  "medier_og_underholdning",
  "overfoering",
  "reise",
  "sparing",
  "ukategorisert",
];

test("every category gets a colour of its own", () => {
  setCategoryHues(MAINS);
  const colours = MAINS.map(categoryColor);
  assert.equal(new Set(colours).size, MAINS.length, "no two mains share a hue");
  assert.ok(colours.every((c) => c.startsWith("oklch(")));
});

test("a colour does not depend on the order the categories arrive in", () => {
  setCategoryHues(MAINS);
  const before = MAINS.map(categoryColor);
  setCategoryHues([...MAINS].reverse());
  assert.deepEqual(MAINS.map(categoryColor), before, "sorted, not as given");
});

test("a category nobody registered keeps the ordinary text colour", () => {
  setCategoryHues(MAINS);
  assert.equal(categoryColor("a_main_from_next_month"), "var(--color-ink)");
});

test("a row with no subcategory reads as its category, never as Annet", () => {
  setLabels(buildLabels([row]));
  assert.equal(rowLabel("ukategorisert", null), categoryLabel("ukategorisert"));
  assert.notEqual(rowLabel("ukategorisert", null), NO_SUB);
  assert.equal(
    rowLabel("dagligvarer", "andre_dagligvarer"),
    "Andre dagligvarer",
    "a named sub is still the sub's own name",
  );
});

test("an exact amount keeps the øre only when it is not zero", () => {
  assert.equal(fmtNOKExact(-140), "\u2212140 kr");
  assert.equal(fmtNOKExact(-139.5), "\u2212139,50 kr");
  assert.equal(fmtNOKExact(139.05), "139,05 kr");
  assert.equal(fmtNOKExact(0), "0 kr");
});
