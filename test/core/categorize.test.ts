import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import {
  categorize,
  loadCategories,
  loadSubscriptions,
} from "../../src/core/categorize.ts";
import type { Classified } from "../../src/core/types.ts";

const CARDS = new Set(["card"]);

function classified(overrides: Partial<Classified>): Classified {
  return {
    id: "1",
    account: "Brukskonto",
    accountKey: "a",
    date: "2026-07-01",
    amount: -100,
    description: "Rema 1000",
    counterparty: "Rema 1000",
    country: null,
    bankCategory: "dagligvarer",
    bankSub: null,
    bankCategoryName: null,
    bankSubName: null,
    bankConfidence: null,
    typeText: "VISA Varekjøp",
    remoteAccountNumber: null,
    isPending: false,
    isRecurring: false,
    isSubscription: false,
    excluded: false,
    reason: null,
    ...overrides,
  };
}

test("falls back to bankCategory with no override", () => {
  const [out] = categorize([classified({})], {});
  assert.equal(out.category, "dagligvarer");
});

test("an excluded row is a transfer, ahead of every other rule", () => {
  const transfer = classified({
    bankCategory: null,
    excluded: true,
    reason: "internal transfer",
  });
  assert.equal(categorize([transfer], {})[0]!.category, "overfoering");

  assert.equal(
    categorize([{ ...transfer, bankCategory: "sparing" }], {})[0]!.category,
    "overfoering",
  );
  for (const bankCategory of ["diverse", "ukategorisert"]) {
    assert.equal(
      categorize([{ ...transfer, bankCategory }], {})[0]!.category,
      "overfoering",
    );
  }
  assert.equal(
    categorize([transfer], { "rema 1000": "groceries" })[0]!.category,
    "overfoering",
  );

  assert.equal(
    categorize([classified({ bankCategory: null })], {})[0]!.category,
    "ukategorisert",
  );
});

test("override beats bankCategory, matched case-insensitively", () => {
  const [out] = categorize([classified({ description: "VIPPS*Rema 1000" })], {
    "rema 1000": "groceries",
  });
  assert.equal(out.category, "groceries");
});

test("a domestic card row the bank did not classify is uncategorized", () => {
  const [out] = categorize(
    [
      classified({
        account: "Kredittkort",
        description: "KAFFEBAR, Oslo, NORWAY",
        counterparty: "KAFFEBAR, Oslo, NORWAY",
        bankCategory: null,
      }),
    ],
    {},
  );
  assert.equal(out.category, "ukategorisert");
});

test("a card row bought abroad is travel, by the merchant country", () => {
  const cat = (
    counterparty: string | null,
    bankCategory: string | null = null,
  ) =>
    categorize(
      [
        classified({
          accountKey: "card",
          description: counterparty ?? "",
          counterparty,
          bankCategory,
        }),
      ],
      {},
      [],
      {},
      CARDS,
    )[0]!.category;
  assert.equal(cat("LAWSON, TOKYO, JAPAN"), "reise");
  assert.equal(cat("LAWSON, TOKYO, JPN"), "reise");
  assert.equal(cat("KAFFEBAR, Oslo, NORWAY"), "ukategorisert");
  assert.equal(cat("KAFFEBAR, OSLO, NOR"), "ukategorisert");
  // The bank writes NORWAY on every domestic row. A town with no country is
  // abroad.
  assert.equal(cat("ANISEED, MYTILINI"), "reise");
  assert.equal(cat("Omkostninger regningsbetaling"), "ukategorisert");
  assert.equal(cat("DUTY-FREE GARDERMOEN"), "ukategorisert");
  assert.equal(cat(null), "ukategorisert");
});

test("the travel guess is card rows only — a deposit row of the same shape is not a trip", () => {
  const [out] = categorize(
    [
      classified({
        accountKey: "a",
        counterparty: "MOBILGIRO M/KID, FORF. I DAG TRANS(ER) TYPE",
        bankCategory: null,
      }),
    ],
    {},
    [],
    {},
    CARDS,
  );
  assert.equal(out.category, "ukategorisert");
});

test("the bank's own category beats the travel guess", () => {
  const cat = (counterparty: string, bankCategory: string) =>
    categorize(
      [
        classified({
          accountKey: "card",
          description: counterparty,
          counterparty,
          bankCategory,
        }),
      ],
      {},
      [],
      {},
      CARDS,
    )[0]!.category;
  assert.equal(
    cat("Interspar Dankt Wien, AUSTRIA", "dagligvarer"),
    "dagligvarer",
  );
  assert.equal(
    cat("Telenor Norge AS, Mobil", "faste_boutgifter"),
    "faste_utgifter",
  );
  assert.equal(
    cat("Centimeter am Spittel, WIEN, AUSTRIA", "ukategorisert"),
    "reise",
  );
  assert.equal(
    categorize(
      [
        classified({
          accountKey: "card",
          description: "Bankomat, WIEN, AUSTRIA",
          counterparty: "Bankomat, WIEN, AUSTRIA",
          bankCategory: "diverse",
          bankSub: "minibank",
        }),
      ],
      {},
      [],
      {},
      CARDS,
    )[0]!.category,
    "diverse",
  );
});

test("an override beats the travel rule, so a foreign biller can be placed", () => {
  const [out] = categorize(
    [
      classified({
        account: "Kredittkort",
        description: "APPLE.COM/BILL, CORK, IRELAND",
        counterparty: "APPLE.COM/BILL, CORK, IRELAND",
        bankCategory: null,
      }),
    ],
    { "apple.com/bill": "medier_og_underholdning" },
  );
  assert.equal(out.category, "medier_og_underholdning");
});

test("the bank spelling out ukategorisert is the one real shrug", () => {
  assert.equal(
    categorize(
      [classified({ bankCategory: "ukategorisert", bankSub: "annet" })],
      {},
    )[0]!.category,
    "ukategorisert",
  );
  const peer = categorize(
    [classified({ bankCategory: "diverse", bankSub: "vennebetaling" })],
    {},
  )[0]!;
  assert.equal(peer.category, "diverse");
  assert.equal(peer.subcategory, "vennebetaling");
});

test("an override still applies to a card row", () => {
  const [out] = categorize(
    [
      classified({
        account: "Kredittkort",
        description: "Netflix",
        bankCategory: null,
      }),
    ],
    { netflix: "subscriptions" },
  );
  assert.equal(out.category, "subscriptions");
});

test("an override matches the merchant, not only the raw description", () => {
  const [out] = categorize(
    [
      classified({
        account: "Kredittkort",
        description: "227 KAFFEBAR, Oslo, NORWAY",
        counterparty: "KAFFEBAR, Oslo, NORWAY",
        bankCategory: null,
      }),
    ],
    { kaffebar: "kafe_og_restaurant" },
  );
  assert.equal(out.category, "kafe_og_restaurant");
});

test("a slash-wrapped pattern is a regex, so a word can be matched as a word", () => {
  const rent = { "/\\bleie\\b/": "faste_boutgifter" };
  const cat = (description: string) =>
    categorize([classified({ description })], rent)[0]!.category;
  assert.equal(cat("Til: Ola - Leie Juni & Juli"), "faste_boutgifter");
  assert.equal(cat("LEIE AUGUST"), "faste_boutgifter");
  // These names contain "leie" but they are not the word.
  assert.equal(cat("UTLEIE AS"), "dagligvarer");
  assert.equal(cat("LEIEBIL BERGEN"), "dagligvarer");
});

test("a plain pattern stays a substring, so partial words still match", () => {
  const [out] = categorize([classified({ description: "KAFFEBAR OSLO" })], {
    kaffe: "kafe_og_restaurant",
  });
  assert.equal(out.category, "kafe_og_restaurant");
});

test("an unparseable regex names itself rather than failing silently", () => {
  assert.throws(
    () => categorize([classified({})], { "/[unclosed/": "x" }),
    /not a valid regex/,
  );
});

test("sb1 row with no bankCategory falls to ukategorisert", () => {
  const [out] = categorize([classified({ bankCategory: null })], {});
  assert.equal(out.category, "ukategorisert");
});

test("loadCategories returns {} when the file is absent", async () => {
  assert.deepEqual(await loadCategories("does-not-exist.json"), {});
});

test("an explicit override beats the Vipps peer rules", async () => {
  const dir = await mkdtemp(join(tmpdir(), "categorize-"));
  const file = join(dir, "o.json");
  await writeFile(file, JSON.stringify({ "sit kafe": "kafe_og_restaurant" }));

  const row = classified({
    description: "Vipps*Sit Kafe",
    counterparty: null,
    bankCategory: "diverse",
    bankSub: "overforing",
  });
  assert.equal(categorize([row], {})[0]!.category, "diverse");
  assert.equal(
    categorize([row], { "sit kafe": "kafe_og_restaurant" })[0]!.category,
    "kafe_og_restaurant",
  );
  assert.deepEqual(await loadCategories(file), {
    "sit kafe": "kafe_og_restaurant",
  });
});

test("a named person is a peer payment or rent, by the row type the bank gave it", () => {
  const cat = (typeText: string | null, amount = -100) =>
    categorize(
      [
        classified({
          description: "Vipps*Vipps*Ola Nordmann",
          counterparty: "Ola Nordmann",
          bankCategory: null,
          typeText,
          amount,
        }),
      ],
      {},
      [],
      { "ola nordmann": "husleie" },
    )[0]!.category;

  assert.equal(cat("Straksbetaling"), "diverse");
  assert.equal(cat("Straksbetaling - ekstern betalingstjeneste"), "diverse");
  assert.equal(cat("VISA Varekjøp"), "diverse");
  assert.equal(cat(null), "diverse");

  assert.equal(cat("Overførsel", 6100), "husleie");
  assert.equal(cat("Giro", 6000), "husleie");
  assert.equal(cat("MobilGiro m/melding til forfall i dag", 5700), "husleie");

  assert.equal(cat("Overførsel mellom egne kontoer", 4000), "diverse");
  assert.equal(
    cat("Overførsel mellom egne kontoer i MobilBank, forfall i dag", 12200),
    "diverse",
  );

  assert.equal(
    categorize(
      [classified({ description: "Rema 1000", typeText: "Overførsel" })],
      {},
      [],
      { "ola nordmann": "husleie" },
    )[0]!.category,
    "dagligvarer",
  );
});

test("a lump transfer takes the category its sender is named with, and only then", () => {
  const row = classified({
    description: "Vipps*Vipps*Kari Nordmann",
    counterparty: "Kari Nordmann",
    bankCategory: null,
    typeText: "Giro",
    amount: 11850,
  });
  const cat = (giro: Record<string, string>, over = row) =>
    categorize([over], {}, [], giro)[0]!.category;

  assert.equal(cat({}), "diverse");
  assert.equal(cat({ "kari nordmann": "husleie" }), "husleie");
  assert.equal(cat({ "kari nordmann": "reise" }), "reise");

  assert.equal(
    cat({ "kari nordmann": "husleie" }, { ...row, typeText: "Straksbetaling" }),
    "diverse",
  );

  assert.equal(cat({ "ola nordmann": "husleie" }), "diverse");
});

test("loadSubscriptions returns [] when the file is absent", async () => {
  assert.deepEqual(await loadSubscriptions("does-not-exist.json"), []);
});

test("a subscription pattern flags a card row the bank could never flag", () => {
  const [out] = categorize(
    [
      classified({
        account: "Kredittkort",
        description: "Varekjøp",
        counterparty: "GOOGLE *YouTubePremium, LONDON, GBR",
        bankCategory: null,
      }),
    ],
    { youtubepremium: "medier_og_underholdning" },
    ["youtubepremium"],
  );
  assert.equal(out.category, "medier_og_underholdning");
  assert.equal(out.isSubscription, true);
});

test("a subscription pattern only adds to the bank's flag, never clears it", () => {
  const [flagged] = categorize([classified({ isSubscription: true })], {}, []);
  assert.equal(flagged.isSubscription, true);
  const [unflagged] = categorize([classified({ isSubscription: false })], {}, [
    "nothing-matches",
  ]);
  assert.equal(unflagged.isSubscription, false);
});

test("a subscription pattern names its own file when the regex is broken", () => {
  assert.throws(
    () => categorize([classified({})], {}, ["/[unclosed/"]),
    /subscriptions\.json/,
  );
});
