import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import {
  bankPair,
  categorize,
  loadFamily,
  loadNotSubscriptions,
  loadOverrides,
  loadPayees,
  loadSubscriptions,
  renamePayees,
  splitCategory,
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
  // The bank writes NORWAY on every domestic row, so a bare town means abroad.
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
  // the whole point: these contain "leie" but are not the word
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

test("loadOverrides returns {} when the file is absent", async () => {
  assert.deepEqual(await loadOverrides("does-not-exist.json"), {});
});

test("an explicit override beats the Vipps peer rules", async () => {
  const dir = await mkdtemp(join(tmpdir(), "categorize-"));
  const overrides = join(dir, "o.json");
  await writeFile(
    overrides,
    JSON.stringify({ "sit kafe": "kafe_og_restaurant" }),
  );

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
  assert.deepEqual(await loadOverrides(overrides), {
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

test("loadNotSubscriptions returns [] when the file is absent", async () => {
  assert.deepEqual(await loadNotSubscriptions("does-not-exist.json"), []);
});

test("a not-subscription pattern takes the bank's flags back off", () => {
  const oneOff = classified({
    description: "Vipps*DIONYSOS Medlemskap",
    counterparty: "DIONYSOS",
    isRecurring: true,
    isSubscription: true,
  });
  const [out] = categorize([oneOff], {}, [], {}, new Set(), [], ["dionysos"]);
  assert.equal(out.isSubscription, false);
  assert.equal(out.isRecurring, false);

  const [kept] = categorize([oneOff], {}, [], {}, new Set(), [], ["nothing"]);
  assert.equal(kept.isSubscription, true);
  assert.equal(kept.isRecurring, true);
});

test("a denial beats subscriptions.json naming the same row", () => {
  const [out] = categorize(
    [classified({ description: "TALKMORE.NO" })],
    {},
    ["talkmore"],
    {},
    new Set(),
    [],
    ["talkmore"],
  );
  assert.equal(out.isSubscription, false);
});

test("a not-subscription pattern names its own file when the regex is broken", () => {
  assert.throws(
    () => categorize([classified({})], {}, [], {}, new Set(), [], ["/[bad/"]),
    /not-subscriptions\.json/,
  );
});

test("the bank's faste_boutgifter is renamed, and an override still wins over it", () => {
  const [renamed] = categorize(
    [classified({ bankCategory: "faste_boutgifter" })],
    {},
    [],
  );
  assert.equal(renamed.category, "faste_utgifter");

  const [kept] = categorize(
    [classified({ bankCategory: "dagligvarer" })],
    {},
    [],
  );
  assert.equal(kept.category, "dagligvarer");

  const [overridden] = categorize(
    [classified({ description: "Telenor", bankCategory: "faste_boutgifter" })],
    { telenor: "medier_og_underholdning" },
    [],
  );
  assert.equal(overridden.category, "medier_og_underholdning");
});

test("the payee account number is matchable, so one name can bill two things", () => {
  const sit = (remoteAccountNumber: string, amount: number) =>
    classified({
      description: "Sit",
      counterparty: "Sit",
      bankCategory: null,
      remoteAccountNumber,
      amount,
    });
  const rules = {
    "42121144527": "helse_og_velvaere",
    "/\\bsit\\b/": "husleie",
  };

  assert.equal(
    categorize([sit("42121144527", -185)], rules)[0]!.category,
    "helse_og_velvaere",
  );
  assert.equal(
    categorize([sit("42004151326", -10416)], rules)[0]!.category,
    "husleie",
  );
  assert.equal(categorize([sit("", -3819)], rules)[0]!.category, "husleie");
});

test("renamePayees collapses a payee that writes the month into every payment", () => {
  const row = (
    description: string,
    remoteAccountNumber: string | null = null,
  ) => ({
    description,
    counterparty: description,
    remoteAccountNumber,
  });
  const rows = [
    row("SIMEN LEIE Februar Husleie"),
    row("SIMEN LEIE Mars Husleie"),
    row("Theo leie"),
    row("Theo leie Husleie Juli"),
    row("Rema 1000"),
  ];
  const renamed = renamePayees(rows, {
    "simen leie": "Simen leie",
    "theo leie": "Theo leie",
  });

  assert.deepEqual(
    renamed.map((r) => r.counterparty),
    ["Simen leie", "Simen leie", "Theo leie", "Theo leie", "Rema 1000"],
  );
  assert.equal(renamed[0]!.description, "SIMEN LEIE Februar Husleie");
  assert.deepEqual(renamePayees(rows, {}), rows);
});

test("renamePayees names a row the bank left nameless, by account number", () => {
  const rows = [
    {
      description: "Overføring",
      counterparty: null,
      remoteAccountNumber: "39910000001",
    },
    {
      description: "Overføring",
      counterparty: null,
      remoteAccountNumber: "39910000002",
    },
  ];
  const renamed = renamePayees(rows, { "39910000001": "Ola Nordmann" });

  assert.deepEqual(
    renamed.map((r) => r.counterparty),
    ["Ola Nordmann", null],
  );
});

test("loadPayees returns {} when the file is absent", async () => {
  assert.deepEqual(await loadPayees("does-not-exist.json"), {});
});

test("a rule value carrying a slash sets both levels, and a bare one sets only the first", () => {
  const pair = categorize([classified({ description: "Bar Circus" })], {
    "bar circus": "kafe_og_restaurant/utesteder",
  })[0]!;
  assert.equal(pair.category, "kafe_og_restaurant");
  assert.equal(pair.subcategory, "utesteder");

  const bare = categorize([classified({ description: "Bar Circus" })], {
    "bar circus": "uteliv",
  })[0]!;
  assert.equal(bare.category, "uteliv");
  assert.equal(bare.subcategory, null);
});

test("the bank's own subcategory rides along when no rule fires", () => {
  const out = categorize(
    [classified({ bankCategory: "helse_og_velvaere", bankSub: "apotek" })],
    {},
  )[0]!;
  assert.equal(out.category, "helse_og_velvaere");
  assert.equal(out.subcategory, "apotek");
});

test("the faste_boutgifter rename keeps the bank sub underneath it", () => {
  const out = categorize(
    [classified({ bankCategory: "faste_boutgifter", bankSub: "stroem" })],
    {},
  )[0]!;
  assert.equal(out.category, "faste_utgifter");
  assert.equal(out.subcategory, "stroem");
});

test("a guess and an excluded row name no subcategory, because neither read one", () => {
  const abroad = categorize(
    [
      classified({
        accountKey: "card",
        bankCategory: null,
        counterparty: "LAWSON, TOKYO, JAPAN",
      }),
    ],
    {},
    [],
    {},
    CARDS,
  )[0]!;
  assert.equal(abroad.category, "reise");
  assert.equal(abroad.subcategory, null);

  const transfer = categorize(
    [
      classified({
        excluded: true,
        reason: "internal transfer",
        bankSub: "overforing",
      }),
    ],
    {},
  )[0]!;
  assert.equal(transfer.category, "overfoering");
  assert.equal(transfer.subcategory, null);
});

test("splitCategory keeps a stray second slash in the sub rather than trimming it", () => {
  assert.deepEqual(splitCategory("a/b/c"), {
    category: "a",
    subcategory: "b/c",
  });
  assert.deepEqual(splitCategory("a"), { category: "a", subcategory: null });
});

test("bankPair keeps the bank taxonomy, renaming only what misnames its own rows", () => {
  assert.deepEqual(
    bankPair({ bankCategory: "diverse", bankSub: "vennebetaling" }),
    {
      category: "diverse",
      subcategory: "vennebetaling",
    },
  );
  assert.equal(
    bankPair({ bankCategory: "ukategorisert", bankSub: "annet" }),
    null,
  );
  assert.deepEqual(
    bankPair({ bankCategory: "faste_boutgifter", bankSub: "stroem" }),
    {
      category: "faste_utgifter",
      subcategory: "stroem",
    },
  );
});

test("the bank finds peers no list ever named", () => {
  const out = categorize(
    [
      classified({
        description: "Vipps*Someone",
        bankCategory: "diverse",
        bankSub: "vennebetaling",
      }),
    ],
    {},
  )[0]!;
  assert.equal(out.category, "diverse");
  assert.equal(out.subcategory, "vennebetaling");
});

test("a Vipps row the bank calls a transfer is a peer payment, on the card", () => {
  const out = categorize(
    [
      classified({
        description: "Vipps*Some Person, Oslo, NORWAY",
        bankCategory: "diverse",
        bankSub: "overforing",
      }),
    ],
    {},
  )[0]!;
  assert.equal(out.category, "diverse");
  assert.equal(out.subcategory, "vennebetaling");
});

test("the doubled Vipps marker is a peer payment even where the bank shrugged", () => {
  const out = categorize(
    [
      classified({
        description: "*7958 13.02 NOK 140.00 Vipps*Vipps*Some Person",
        bankCategory: null,
        typeText: "Straksbetaling - ekstern betalingstjeneste",
      }),
    ],
    {},
  )[0]!;
  assert.equal(out.category, "diverse");
  assert.equal(out.subcategory, "vennebetaling");
});

test("a bare Vipps marker is never enough — Vipps bills merchants too", () => {
  const merchant = (bankCategory: string, bankSub: string) =>
    categorize(
      [
        classified({
          description: "Vipps*Some Canteen",
          bankCategory,
          bankSub,
        }),
      ],
      {},
    )[0]!;
  assert.equal(
    merchant("kafe_og_restaurant", "kantine").category,
    "kafe_og_restaurant",
  );
  assert.equal(
    merchant("bil_og_transport", "kollektivtransport").category,
    "bil_og_transport",
  );
  assert.equal(
    categorize(
      [classified({ description: "Vipps*Some Shop", bankCategory: null })],
      {},
    )[0]!.category,
    "ukategorisert",
  );
});

test("a rule that names one level takes no subcategory, not even the bank's own", () => {
  const out = categorize(
    [
      classified({
        description: "SAS 117",
        bankCategory: "reise",
        bankSub: "flybilletter",
      }),
    ],
    { "/\\bSAS[\\d ]/": "reise" },
  )[0]!;
  assert.equal(out.category, "reise");
  assert.equal(out.subcategory, null);
});

test("a sub from a category the rule overruled is not grafted on", () => {
  const out = categorize(
    [
      classified({
        description: "PAYPAL BOOKING HOTEL",
        bankCategory: "hobby_og_fritid",
        bankSub: "digital_markedsplass",
      }),
    ],
    { "booking hotel": "reise" },
  )[0]!;
  assert.equal(out.category, "reise");
  assert.equal(out.subcategory, null);
});

test("a rule that names both levels is never second-guessed by the bank", () => {
  const out = categorize(
    [
      classified({
        description: "Barrock",
        bankCategory: "kafe_og_restaurant",
        bankSub: "restaurant",
      }),
    ],
    { barrock: "kafe_og_restaurant/utesteder" },
  )[0]!;
  assert.equal(out.subcategory, "utesteder");
});

test("an excluded row takes no subcategory from the bank either", () => {
  const out = categorize(
    [
      classified({
        excluded: true,
        reason: "internal transfer",
        bankCategory: "overfoering",
        bankSub: "overforing",
      }),
    ],
    {},
  )[0]!;
  assert.equal(out.category, "overfoering");
  assert.equal(out.subcategory, null);
});

test("money in from family is family support, money out to them is a peer payment", () => {
  const from = (amount: number) =>
    categorize(
      [
        classified({
          amount,
          description: "A Relative",
          counterparty: "A Relative",
          typeText: "Straksbetaling",
          bankCategory: "diverse",
          bankSub: "vennebetaling",
        }),
      ],
      {},
      [],
      {},
      new Set(),
      ["a relative"],
    )[0]!;
  assert.equal(
    `${from(500).category}/${from(500).subcategory}`,
    "innskudd/familie",
  );
  assert.equal(
    `${from(-500).category}/${from(-500).subcategory}`,
    "diverse/vennebetaling",
  );
});

test("a standing arrangement keeps the name giro.json gave it, family or not", () => {
  const out = categorize(
    [
      classified({
        amount: 150,
        description: "A Relative",
        counterparty: "A Relative",
        typeText: "Avtale",
        bankCategory: "diverse",
        bankSub: "overforing",
      }),
    ],
    {},
    [],
    { "a relative": "innskudd/lommepenger" },
    new Set(),
    ["a relative"],
  )[0]!;
  assert.equal(out.category, "innskudd");
  assert.equal(out.subcategory, "lommepenger");
});

test("loadFamily returns [] when the file is absent", async () => {
  assert.deepEqual(await loadFamily("rules/does-not-exist.json"), []);
});
