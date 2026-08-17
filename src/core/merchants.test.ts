import assert from "node:assert/strict";
import { test } from "node:test";
import { compile } from "./categorize.ts";
import { merchantClusters, nearMisses } from "./merchants.ts";
import type { Categorized } from "./types.ts";

// Invented merchants only — the clustering has to be pinned by names chosen to
// exercise it, not by whatever spellings the bank happened to send this month.

function txn(
  partial: Partial<Categorized> & { id: string; amount: number },
): Categorized {
  return {
    account: "Brukskonto",
    accountKey: "acc",
    date: "2026-07-15",
    description: "test",
    counterparty: "Kiwi",
    country: null,
    bankCategory: null,
    bankSub: null,
    bankCategoryName: null,
    bankSubName: null,
    bankConfidence: null,
    typeText: null,
    remoteAccountNumber: null,
    isRecurring: false,
    isSubscription: false,
    excluded: false,
    reason: null,
    category: "dagligvarer",
    subcategory: null,
    ...partial,
  };
}

const rows = (names: string[], each = -100): Categorized[] =>
  names.map((counterparty, i) =>
    txn({ id: `t${i}`, amount: each, counterparty }),
  );

test("the four channel spellings of one shop collapse into one cluster", () => {
  const [cluster, ...rest] = merchantClusters(
    rows([
      "MATBUA SKOGEN STORGATEN OSLO", // BankAxept: name(15) street(12) city
      "MATBUA SKOGEN",
      "MATBUA SKOGEN OS",
      "MATBUA SKOGEN, Oslo, NORWAY", // the card
    ]),
  );
  assert.equal(rest.length, 0);
  assert.equal(cluster!.members.length, 4);
  assert.equal(cluster!.rows, 4);
  assert.equal(cluster!.total, 400);
  // A substring of every member, so pasting it cannot produce a dead pattern.
  assert.equal(cluster!.pattern, "matbua skogen");
  for (const m of cluster!.members)
    assert.ok(m.name.toLowerCase().includes(cluster!.pattern));
});

test("two merchants sharing a word stay apart", () => {
  const found = merchantClusters(
    rows(["MATBUA SKOGEN OSLO", "MATBUA STRANDA OSLO"]),
  );
  assert.deepEqual(found, []);
});

test("the bank’s cleaned form is the name suggested, the truncation never is", () => {
  const [cleaned] = merchantClusters(
    rows(["MATBUA SKOGEN STORGATEN OSLO", "Matbua Skogen", "MATBUA SKOGEN OS"]),
  );
  assert.equal(cleaned!.name, "Matbua Skogen");

  // Several cleaned forms: the one the bank actually sends, not the shortest —
  // a truncation can be mixed-case too, and 'Matbua Skogen As' is one.
  const [common] = merchantClusters([
    ...Array.from({ length: 9 }, (_, i) =>
      txn({
        id: `m${i}`,
        amount: -100,
        counterparty: "Matbua Skogen Antikvariat",
      }),
    ),
    txn({ id: "short", amount: -100, counterparty: "Matbua Skogen As" }),
  ]);
  assert.equal(common!.name, "Matbua Skogen Antikvariat");

  // No cleaned form to pick: the longest breaks the tie, because every short
  // spelling in an all-caps cluster is a truncation of the same string.
  const [allCaps] = merchantClusters(
    rows(["SPAREPLAN BANK AB", "SPAREPLAN BANK A"]),
  );
  assert.equal(allCaps!.name, "SPAREPLAN BANK AB");
});

test("a short name still reaches its own longer spelling", () => {
  // 'matbua nord' is 11 characters, so a fixed 12-character key would never
  // have let it meet the BankAxept spelling that carries its street.
  const [cluster] = merchantClusters(
    rows(["MATBUA NORD", "MATBUA NORD STORGATEN OSLO"]),
  );
  assert.equal(cluster!.members.length, 2);
  assert.equal(cluster!.pattern, "matbua nord");
});

test("a pattern that reaches past its own cluster is reported as collateral", () => {
  // The pattern is a prefix of its members, and this payee carries it in the
  // middle — so it is out of the cluster and inside the rule's reach. Pasting
  // the line unread would recategorise someone else's rows.
  const [cluster] = merchantClusters(
    rows([
      "MATBUA SKOGEN AS OSLO",
      "MATBUA SKOGEN AS",
      "CAFE MATBUA SKOGEN AS BERGEN",
    ]),
  );
  assert.equal(cluster!.members.length, 2);
  assert.deepEqual(cluster!.collateral, ["CAFE MATBUA SKOGEN AS BERGEN"]);
});

test("punctuation alone between two spellings gets a regex, not a shrug", () => {
  // 'cafe' is all they literally share, but they are one café and agree
  // completely once the hyphen is flattened.
  const [cluster] = merchantClusters(
    rows(["CAFE-SITO REALF TROND", "CAFE SITO REALF TR"]),
  );
  assert.equal(cluster!.pattern, "/cafe.sito.realf.tr/");
  // And the suggestion has to work in the matcher that will actually run it.
  const matches = compile(cluster!.pattern, "test");
  for (const m of cluster!.members) assert.ok(matches(m.name.toLowerCase()));
});

test("too little shared to be a rule is reported as no pattern, never as a broad one", () => {
  // A two-letter transit operator: the card spelling carries a city and the
  // bank spelling is the bare name, so all they share is 'sl'. A rule on that
  // would reach half the file, and no rule is the honest answer.
  const [cluster] = merchantClusters(rows(["SL", "SL, STOCKHOLM, SWEDEN"]));
  assert.equal(cluster!.members.length, 2);
  assert.equal(cluster!.pattern, "");
  assert.deepEqual(cluster!.collateral, []);
});

test("members in two categories are both listed, which is the point of the flag", () => {
  const [cluster] = merchantClusters([
    txn({
      id: "a",
      amount: -100,
      counterparty: "MATBUA SKOGEN STORGATEN OSLO",
      category: "dagligvarer",
    }),
    txn({
      id: "b",
      amount: -100,
      counterparty: "MATBUA SKOGEN",
      category: "ukategorisert",
    }),
  ]);
  assert.deepEqual(cluster!.categories, ["dagligvarer", "ukategorisert"]);
});

test("excluded rows and income are not merchants", () => {
  const found = merchantClusters([
    txn({
      id: "a",
      amount: -100,
      counterparty: "MATBUA SKOGEN STORGATEN OSLO",
    }),
    txn({
      id: "b",
      amount: -100,
      counterparty: "MATBUA SKOGEN",
      excluded: true,
      reason: "transfer",
    }),
    txn({ id: "c", amount: 100, counterparty: "MATBUA SKOGEN OS" }),
  ]);
  assert.deepEqual(found, []);
});

test("nearMisses catches the shop the prefix grouping can never see", () => {
  // The real case: one shop, two spellings that agree on five characters. No
  // prefix rule reaches these, so the report has to name them some other way.
  const names = ["MATBUA 1000 SKOGEN", "MATBUA SKOGEN GATA 4 OSLO"];
  assert.deepEqual(
    merchantClusters(rows(names)),
    [],
    "no prefix rule can reach these",
  );
  const found = nearMisses(rows(names));
  // Both words they share are reported; '1000' is a number and names nothing.
  assert.deepEqual(
    new Set(found.map((m) => m.token)),
    new Set(["matbua", "skogen"]),
  );
  for (const m of found) assert.equal(m.members.length, 2);
});

test("nearMisses stays quiet about words that name a place, not a shop", () => {
  // 'trondheim' on six merchants is a town. Reporting it would bury the signal
  // under every merchant in the city, so the corpus filters it, not a stoplist.
  const many = ["ALFA", "BETA", "GAMMA", "DELTA", "EPSILON", "ZETA"].map(
    (n) => `${n} STORGATEN TRONDHEIM`,
  );
  assert.deepEqual(
    nearMisses(rows(many)).map((m) => m.token),
    [],
  );

  // Short words say nothing either: 'as' is a company suffix.
  assert.deepEqual(
    nearMisses(rows(["ALFA AS", "BETA AS"])).map((m) => m.token),
    [],
  );
});

test("nearMisses says nothing about names already clustered together", () => {
  assert.deepEqual(
    nearMisses(rows(["MATBUA SKOGEN", "MATBUA SKOGEN GATA OSLO"])),
    [],
  );
});

test("a refund nets off inside the cluster it belongs to", () => {
  const [cluster] = merchantClusters([
    txn({
      id: "a",
      amount: -250.5,
      counterparty: "MATBUA SKOGEN STORGATEN OSLO",
    }),
    txn({ id: "b", amount: -100.25, counterparty: "MATBUA SKOGEN" }),
  ]);
  assert.equal(cluster!.total, 350.75);
});
