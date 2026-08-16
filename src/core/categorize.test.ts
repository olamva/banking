import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import {
  bankPair,
  categorize,
  loadFamily,
  loadOverrides,
  loadPayees,
  loadSubscriptions,
  renamePayees,
  splitCategory,
} from "./categorize.ts";
import type { Classified } from "./types.ts";

/** The card, as `rules/accounts.json` names it — the travel guess sees these rows and no others. */
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

/**
 * Every excluded row is a transfer, whatever else it looks like. The bank has a
 * category for most of them and it describes the payment, not the money — a card
 * bill is `Avgifter` on the giro paying it — and the toggle that lists these is
 * the only place they are ever seen, with `reason` already on the row.
 */
test("an excluded row is a transfer, ahead of every other rule", () => {
  const transfer = classified({
    bankCategory: null,
    excluded: true,
    reason: "internal transfer",
  });
  assert.equal(categorize([transfer], {})[0]!.category, "overfoering");

  // Not the fallback any more: the bank's category and an override both lose.
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

  // And nothing that is still counted changes.
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
  // The old Enable Banking wording, a three-letter code, reads the same way.
  assert.equal(cat("LAWSON, TOKYO, JPN"), "reise");
  assert.equal(cat("KAFFEBAR, Oslo, NORWAY"), "ukategorisert");
  assert.equal(cat("KAFFEBAR, OSLO, NOR"), "ukategorisert");
  // A foreign terminal sometimes sends only the town. The bank writes NORWAY on
  // every domestic one, so a bare town at the end still means abroad.
  assert.equal(cat("ANISEED, MYTILINI"), "reise");
  // No comma, so nothing that could be a place: the issuer's own rows, and
  // Norwegian payees that carry no country at all.
  assert.equal(cat("Omkostninger regningsbetaling"), "ukategorisert");
  assert.equal(cat("DUTY-FREE GARDERMOEN"), "ukategorisert");
  assert.equal(cat(null), "ukategorisert");
});

test("the travel guess is card rows only — a deposit row of the same shape is not a trip", () => {
  // 23 rows of the record match this pattern without being near a trip.
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
  // The guess is a fallback for rows the bank shrugged at. A supermarket in
  // Vienna is groceries that happened abroad, and `Telenor Norge AS, Mobil`
  // only looks foreign — the category is what stops both being read as a trip.
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
  // …but the one real catch-all is no category, so those still fall through.
  assert.equal(
    cat("Centimeter am Spittel, WIEN, AUSTRIA", "ukategorisert"),
    "reise",
  );
  // `diverse` is not one of those any more: it is the bank's largest main and
  // every pair under it means something, so a Viennese cash machine is a cash
  // machine rather than evidence of a holiday.
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
  // And `diverse` is not a second one. It used to collapse into the shrug, which
  // threw away a level above where all its signal was and cost
  // `rules/vipps.json` 176 hand-written names.
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
  // The card's raw description carries a terminal number the cleaned one drops,
  // so a pattern written for the merchant has to reach `counterparty`.
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

/**
 * The Vipps rules are read off the row, so the one thing that can overrule them
 * is a person saying otherwise — and rules/overrides.json runs first.
 */
test("an explicit override beats the Vipps peer rules", async () => {
  const dir = await mkdtemp(join(tmpdir(), "categorize-"));
  const overrides = join(dir, "o.json");
  await writeFile(
    overrides,
    JSON.stringify({ "sit kafe": "kafe_og_restaurant" }),
  );

  // A card row the bank filed as a money transfer, which is otherwise conclusive.
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

/**
 * A flatmate is two relationships at once — forty coffees and a standing monthly
 * rent — and the description is the bare name in both. Only the bank's own row
 * type separates them, and 158 000 kr of rent sat under `vipps` until it did.
 *
 * The lump half is the half a rules file still has to name. The peer half now
 * reads itself off the row, so these rows carry the Vipps shape they really have.
 */
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

  // Settled instantly, or on the card: a Vipps payment.
  assert.equal(cat("Straksbetaling"), "diverse");
  assert.equal(cat("Straksbetaling - ekstern betalingstjeneste"), "diverse");
  assert.equal(cat("VISA Varekjøp"), "diverse");
  assert.equal(cat(null), "diverse");

  // Set up once and left running: rent. The lump rule runs above the Vipps
  // rules, so it wins even on a row that carries the marker.
  assert.equal(cat("Overførsel", 6100), "husleie");
  assert.equal(cat("Giro", 6000), "husleie");
  assert.equal(cat("MobilGiro m/melding til forfall i dag", 5700), "husleie");

  // Between own accounts is the bank's wording for a family transfer, not rent.
  assert.equal(cat("Overførsel mellom egne kontoer", 4000), "diverse");
  assert.equal(
    cat("Overførsel mellom egne kontoer i MobilBank, forfall i dag", 12200),
    "diverse",
  );

  // The gate only applies to a name in giro.json; nobody else is touched.
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

/**
 * The row type says how the money moved and never why, so the category is per
 * name: a lump from a flatmate is rent, and the identical lump from a friend
 * was a share of a trip. Nothing on the row separates those two.
 */
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

  // Unnamed, so it stays what it always was: money from a person.
  assert.equal(cat({}), "diverse");
  assert.equal(cat({ "kari nordmann": "husleie" }), "husleie");
  assert.equal(cat({ "kari nordmann": "reise" }), "reise");

  // Named, but settled instantly: still the coffee, not the standing payment.
  assert.equal(
    cat({ "kari nordmann": "husleie" }, { ...row, typeText: "Straksbetaling" }),
    "diverse",
  );

  // A name here reaches nobody else's rows.
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
  // the point of the second axis: a category *and* the flag, not one or the other
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

test("the bank's faste_boutgifter is renamed, and an override still wins over it", () => {
  const [renamed] = categorize(
    [classified({ bankCategory: "faste_boutgifter" })],
    {},
    [],
  );
  assert.equal(renamed.category, "faste_utgifter");

  // Every other bank slug still passes through untouched.
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

/**
 * One payee, two things billed under one name. SiT sends rent and the gym as
 * `Sit` with the same type and the same bank category — the account number they
 * are billed from is the only field that differs, so it is in the haystack.
 */
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
  // No account number at all still falls through to the name.
  assert.equal(categorize([sit("", -3819)], rules)[0]!.category, "husleie");
});

/**
 * A landlord who writes the month into every payment is eleven payees to
 * anything counting by name, which listed one standing rent eleven times.
 */
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
  // The month is still in the description, which is what the search box reads.
  assert.equal(renamed[0]!.description, "SIMEN LEIE Februar Husleie");
  // No file, no work: the array comes back as it went in.
  assert.equal(renamePayees(rows, {}), rows);
});

/**
 * SB1 sends a few transfers with no name on them at all — a bare `Overføring`
 * and an account number. The account is then the only thing that says who the
 * other party was, so the payee patterns have to be able to see it.
 */
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
  // The two forms coexist on purpose: rules/overrides.json is migrated a line
  // at a time, and the category half is the same string either way, so the page
  // does not move while half the file is still bare.
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
  // The rename is ours; the pair below it is still the bank's own answer.
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
  // `reise/annen_reise` would be an invented claim — the guess reads a country
  // off a merchant string and knows nothing about the second level.
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
  // No bank slug has ever held one, so `a/b/c` is a typo — better seen on the
  // page than silently swallowed.
  assert.deepEqual(splitCategory("a/b/c"), {
    category: "a",
    subcategory: "b/c",
  });
  assert.deepEqual(splitCategory("a"), { category: "a", subcategory: null });
});

test("bankPair keeps the bank taxonomy, renaming only what misnames its own rows", () => {
  // `diverse` comes through as itself, subcategory and all.
  assert.deepEqual(
    bankPair({ bankCategory: "diverse", bankSub: "vennebetaling" }),
    {
      category: "diverse",
      subcategory: "vennebetaling",
    },
  );
  // Only `ukategorisert` is nothing.
  assert.equal(
    bankPair({ bankCategory: "ukategorisert", bankSub: "annet" }),
    null,
  );
  // The one rename: the bank's fixed-cost bucket is not only housing.
  assert.deepEqual(
    bankPair({ bankCategory: "faste_boutgifter", bankSub: "stroem" }),
    {
      category: "faste_utgifter",
      subcategory: "stroem",
    },
  );
});

test("the bank finds peers no list ever named", () => {
  // The bank recognises the payment type without being told who anyone is, so
  // most peer rows never need a rule at all.
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

/**
 * The two shapes that replaced `rules/vipps.json`. Each says by itself that the
 * payee was a person; the marker alone never does, which is the whole reason a
 * list of 32 names existed.
 */
test("a Vipps row the bank calls a transfer is a peer payment, on the card", () => {
  // The card files these as `diverse/overforing`, which is the bank reading
  // `mcc: 4829`, *MONEY TRANSF*. Naming the pair outright is the point — taking
  // the bank's sub here is exactly what filed a peer payment as a transfer.
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
  // `Straksbetaling - ekstern betalingstjeneste`: no bank category at all, and
  // Vipps doubles its own marker on every one of them.
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
  // Matching the marker alone moved 271 correctly-filed rows — canteen lunches,
  // tram fares — into `vennebetaling`. The second signal is the whole rule.
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
  // A merchant the bank shrugged at stays uncategorised rather than becoming a person.
  assert.equal(
    categorize(
      [classified({ description: "Vipps*Some Shop", bankCategory: null })],
      {},
    )[0]!.category,
    "ukategorisert",
  );
});

test("a rule that names one level takes no subcategory, not even the bank's own", () => {
  // A bare value used to inherit the bank's sub wherever the mains agreed, which
  // filed one payee under two labels depending on whether the bank had
  // recognised the merchant. Every line names a pair now, and a bare one means
  // what it says: this category, no second level.
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
  // A hotel booking is a trip to us and a digital marketplace to the bank.
  // `reise/digital_markedsplass` is a pair neither of us meant.
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
  // In: family support, which is why it sits under the bank's income main.
  assert.equal(
    `${from(500).category}/${from(500).subcategory}`,
    "innskudd/familie",
  );
  // Out: paying a relative back is not income, and filing it under one would be
  // a contradiction the category itself cannot hold.
  assert.equal(
    `${from(-500).category}/${from(-500).subcategory}`,
    "diverse/vennebetaling",
  );
});

test("a standing arrangement keeps the name giro.json gave it, family or not", () => {
  // Pocket money is family money that already has a better label, so the lump
  // rule has to win — which means it runs above the family list.
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
