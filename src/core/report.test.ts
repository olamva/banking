import assert from "node:assert/strict";
import { test } from "node:test";
import { categorize } from "./categorize.ts";
import { narrowings, overrideReport, pairUse, unnamed } from "./report.ts";
import type { Categorized } from "./types.ts";

function row(overrides: Partial<Categorized>): Categorized {
  return {
    id: "1",
    accountKey: "a",
    account: "Brukskonto",
    date: "2026-07-01",
    amount: -100,
    description: "Rema 1000",
    counterparty: "Rema 1000",
    bankCategory: "dagligvarer",
    bankSub: "dagligvarer",
    bankCategoryName: "Dagligvarer",
    bankSubName: "Matvarer",
    bankConfidence: 100,
    typeText: "VISA Varekjøp",
    remoteAccountNumber: null,
    isRecurring: false,
    isSubscription: false,
    excluded: false,
    reason: null,
    category: "dagligvarer",
    subcategory: "dagligvarer",
    ...overrides,
  };
}

test("a line the bank already agrees with is deletable, and says what the sub would gain", () => {
  const report = overrideReport([row({ id: "1" })], { rema: "dagligvarer" });
  assert.equal(report[0]!.verdict, "redundant");
  assert.equal(report[0]!.rows, 1);
  assert.equal(report[0]!.kept, 1);
  // Deleting it costs nothing and the row picks up the bank's second level.
  assert.equal(report[0]!.outcomes[0]!.fallback, "dagligvarer/dagligvarer");
});

test("a line that is our own name for a pair the bank sends is a rewrite, with the line to paste", () => {
  const rows = [
    row({
      id: "1",
      description: "Bar Circus",
      counterparty: "Bar Circus",
      bankCategory: "kafe_og_restaurant",
      bankSub: "utesteder",
      category: "uteliv",
      subcategory: null,
    }),
  ];
  const report = overrideReport(rows, { "bar circus": "uteliv" });
  assert.equal(report[0]!.verdict, "rewrite");
  assert.equal(report[0]!.suggest, "kafe_og_restaurant/utesteder");
  assert.equal(report[0]!.kept, 0);
});

test("the faste_boutgifter rename is applied to the suggestion, so the line pastes as it will run", () => {
  const rows = [
    row({
      id: "1",
      description: "Eletra Energy",
      counterparty: "Eletra Energy",
      bankCategory: "faste_boutgifter",
      bankSub: "stroem",
      category: "stroem",
      subcategory: null,
    }),
  ];
  const report = overrideReport(rows, { eletra: "stroem" });
  assert.equal(report[0]!.verdict, "rewrite");
  assert.equal(report[0]!.suggest, "faste_utgifter/stroem");
});

test("a line the bank has nothing better than is load-bearing, not a rewrite", () => {
  const rows = [
    row({
      id: "1",
      description: "Online Trikom",
      counterparty: "Online Trikom",
      bankCategory: "ukategorisert",
      bankSub: "annet",
      category: "kafe_og_restaurant",
      subcategory: null,
    }),
  ];
  const report = overrideReport(rows, { trikom: "kafe_og_restaurant" });
  assert.equal(report[0]!.verdict, "load-bearing");
  // The shrug is not a pair worth suggesting, so there is nothing to paste.
  assert.equal(report[0]!.suggest, null);
});

/**
 * The one that stops the report calling something a rewrite when the fallback is
 * really a *second* override. Deleting `"sit kafe"` hands its rows to the
 * broader `"sit"` line, not to the bank — a canteen would read as rent.
 */
test("a fallback that is another override is not the bank agreeing", () => {
  const rows = [
    row({
      id: "1",
      description: "SIT KAFE REALFA",
      counterparty: "SIT KAFE REALFA",
      bankCategory: "kafe_og_restaurant",
      bankSub: "kafe",
      category: "kafe_og_restaurant",
      subcategory: null,
    }),
  ];
  const report = overrideReport(rows, {
    "sit kafe": "kafe_og_restaurant",
    sit: "husleie",
  });
  const line = report.find((r) => r.pattern === "sit kafe")!;
  assert.equal(line.verdict, "load-bearing");
  assert.equal(line.outcomes[0]!.fallback, "husleie");
  assert.equal(line.outcomes[0]!.fromBank, false);
  assert.equal(line.suggest, null);
});

test("a line matching nothing on record is unused, rather than silently absent", () => {
  const report = overrideReport([row({})], { "never seen": "reise" });
  const line = report.find((r) => r.pattern === "never seen")!;
  assert.equal(line.verdict, "unused");
  assert.equal(line.rows, 0);
});

test("an excluded row is credited to no line, because no override ever decides one", () => {
  // `categorize` returns the transfer slug above every rule, so counting one
  // here would credit a pattern with a row it does not decide.
  const rows = [
    row({
      id: "1",
      excluded: true,
      reason: "internal transfer",
      category: "overfoering",
    }),
  ];
  assert.equal(overrideReport(rows, { rema: "dagligvarer" })[0]!.rows, 0);
});

test("a line that decides some rows and not others is mixed, and still suggests the bank half", () => {
  // The bank's own main is our slug here, so a row it classifies keeps its
  // category with the line gone while a row it shrugs at does not.
  const rows = [
    row({
      id: "1",
      description: "Kino",
      counterparty: "Nova Kino",
      bankCategory: "hobby_og_fritid",
      bankSub: "kino",
      bankSubName: "Kino",
      category: "hobby_og_fritid",
      subcategory: null,
    }),
    row({
      id: "2",
      description: "Kino",
      counterparty: "Kino Kiosk",
      bankCategory: "ukategorisert",
      bankSub: "annet",
      bankSubName: "Ukategorisert",
      category: "hobby_og_fritid",
      subcategory: null,
    }),
  ];
  const report = overrideReport(rows, { kino: "hobby_og_fritid" });
  assert.equal(report[0]!.verdict, "mixed");
  assert.equal(report[0]!.kept, 1);
  // Worth saying even on a mixed line: the half the bank does classify, it
  // classifies one level deeper than the rule does.
  assert.equal(report[0]!.suggest, "hobby_og_fritid/kino");
});

test("two different bank pairs under one line suggest nothing — the group is really two groups", () => {
  const rows = [
    row({
      id: "1",
      description: "Sit",
      counterparty: "Sit Bolig",
      bankCategory: "faste_boutgifter",
      bankSub: "boligutgifter",
      category: "husleie",
      subcategory: null,
    }),
    row({
      id: "2",
      description: "Sit",
      counterparty: "Sit Kafe",
      bankCategory: "kafe_og_restaurant",
      bankSub: "kafe",
      category: "husleie",
      subcategory: null,
    }),
  ];
  const report = overrideReport(rows, { sit: "husleie" });
  assert.equal(report[0]!.suggest, null);
  assert.equal(report[0]!.verdict, "load-bearing");
});

test("pairUse counts every bank pair against what we file its rows as", () => {
  const rows = [
    row({ id: "1", category: "dagligvarer" }),
    row({ id: "2", category: "uteliv" }),
    row({
      id: "3",
      bankCategory: "diverse",
      bankSub: "vennebetaling",
      bankCategoryName: "Diverse",
      bankSubName: "Vennebetaling",
      category: "vipps",
    }),
  ];
  const use = pairUse(rows);
  const groceries = use.find((p) => p.pair === "dagligvarer/dagligvarer")!;
  assert.equal(groceries.rows, 2);
  assert.deepEqual(groceries.ours, [
    { category: "dagligvarer", rows: 1 },
    { category: "uteliv", rows: 1 },
  ]);
  assert.equal(
    use.find((p) => p.pair === "diverse/vennebetaling")!.name,
    "Diverse > Vennebetaling",
  );
});

test("a slug the bank never spells is one that needs a name — a null sub is not one", () => {
  const rows = [
    // The bank names this main, so it is not on the list however its sub reads.
    row({ id: "1", category: "dagligvarer", subcategory: null }),
    row({ id: "2", category: "linjeforening_kiosk", subcategory: null }),
    // The main is ours, the sub is the bank's own — only the main needs naming.
    row({ id: "3", category: "faste_utgifter", subcategory: "dagligvarer" }),
  ];
  assert.deepEqual(unnamed(rows), [
    { slug: "linjeforening_kiosk", level: "category", rows: 1 },
    { slug: "faste_utgifter", level: "category", rows: 1 },
  ]);
});

/**
 * The distinction that keeps an airport bakery out of the paste bucket. Our
 * slug is a bank main here, so a rewrite may only ever add a second level —
 * the bank naming a *different* main is a different claim, not a spelling.
 */
test("a bank pair under a different main is a divergence, not a rewrite", () => {
  const rows = [
    // What `kafe_og_restaurant` means to us, established by the corpus.
    row({
      id: "1",
      description: "Kantina",
      counterparty: "Kantina",
      bankCategory: "kafe_og_restaurant",
      bankSub: "kantine",
      category: "kafe_og_restaurant",
      subcategory: null,
    }),
    // BIT is a bakery. The bank files it as travel because the till is airside.
    row({
      id: "2",
      description: "BIT OSLO LUFTHAVN",
      counterparty: "BIT OSLO LUFTHAVN, GARDERMOEN, NORWAY",
      bankCategory: "reise",
      bankSub: "annen_reise",
      category: "kafe_og_restaurant",
      subcategory: null,
    }),
  ];
  const line = overrideReport(rows, { bit: "kafe_og_restaurant" })[0]!;
  assert.equal(line.verdict, "diverges");
  // Still reported, because the disagreement is the interesting part — but as
  // the bank's claim, never as a line to paste.
  assert.equal(line.suggest, "reise/annen_reise");
});

test("a slug of our own is judged on the whole pair, since the main agreeing says nothing", () => {
  const rows = [
    // `uteliv` means `kafe_og_restaurant/utesteder`, learned from these rows.
    row({
      id: "1",
      description: "Bar Circus",
      counterparty: "Bar Circus",
      bankCategory: "kafe_og_restaurant",
      bankSub: "utesteder",
      category: "uteliv",
      subcategory: null,
    }),
    row({
      id: "2",
      description: "Heidis",
      counterparty: "Heidis",
      bankCategory: "kafe_og_restaurant",
      bankSub: "utesteder",
      category: "uteliv",
      subcategory: null,
    }),
    // Same main, different sub — and it is a bar, not a restaurant.
    row({
      id: "3",
      description: "Barrock",
      counterparty: "Barrock",
      bankCategory: "kafe_og_restaurant",
      bankSub: "restaurant",
      category: "uteliv",
      subcategory: null,
    }),
  ];
  const report = overrideReport(rows, {
    "bar circus": "uteliv",
    barrock: "uteliv",
  });
  assert.equal(
    report.find((r) => r.pattern === "bar circus")!.verdict,
    "rewrite",
  );
  assert.equal(
    report.find((r) => r.pattern === "barrock")!.verdict,
    "diverges",
  );
});

test("a narrowed pattern keeps its own rows and takes none back", () => {
  // `sit` reaches the canteen only because it sits below `sit kafe` in the file.
  const rows = [
    row({
      id: "1",
      description: "SIT KAFE REALFA",
      counterparty: "SIT KAFE REALFA",
      category: "kafe_og_restaurant",
    }),
    row({
      id: "2",
      description: "SIT NETTBETALING",
      counterparty: "Sit",
      category: "husleie",
    }),
  ];
  const overrides = { "sit kafe": "kafe_og_restaurant", sit: "husleie" };
  const [loose] = narrowings(rows, overrides);
  assert.equal(loose!.pattern, "sit");
  assert.equal(loose!.suggest, "/^(?!.*(?:sit kafe))(?=.*sit)/");

  // The whole point: the narrowed file gives the same answer in either order.
  const answer = (o: Record<string, string>) =>
    categorize(rows, o)
      .map((t) => t.category)
      .join(",");
  const narrowed = {
    [loose!.suggest]: "husleie",
    "sit kafe": "kafe_og_restaurant",
  };
  const reversed = {
    "sit kafe": "kafe_og_restaurant",
    [loose!.suggest]: "husleie",
  };
  assert.equal(answer(overrides), "kafe_og_restaurant,husleie");
  assert.equal(answer(narrowed), "kafe_og_restaurant,husleie");
  assert.equal(answer(reversed), "kafe_og_restaurant,husleie");
  // And the loose form does not, which is what makes the narrowing worth doing.
  assert.equal(
    answer({ sit: "husleie", "sit kafe": "kafe_og_restaurant" }),
    "husleie,husleie",
  );
});

test("two lines naming the same category are no narrowing to make", () => {
  const rows = [
    row({
      id: "1",
      description: "BOOTS APOTEK",
      counterparty: "BOOTS APOTEK",
      category: "helse_og_velvaere",
    }),
  ];
  // The order decides which one wins and neither answer differs, so rewriting a
  // rule that is already correct would be pure risk.
  assert.deepEqual(
    narrowings(rows, {
      apotek: "helse_og_velvaere",
      boots: "helse_og_velvaere",
    }),
    [],
  );
});

test("an anchored winner cannot be inlined, and says so rather than guessing", () => {
  const rows = [
    row({
      id: "1",
      description: "Rema 1000 Torvet",
      counterparty: "Rema 1000 Torvet",
      category: "reise",
    }),
  ];
  const [loose] = narrowings(rows, { "/^rema/": "reise", rema: "dagligvarer" });
  assert.equal(loose!.suggest, "");
});

/**
 * The bug the migration's own verification caught. Once a rule value can carry
 * a subcategory, comparing categories alone calls a line redundant that is the
 * only thing holding a sub in place.
 */
test("a stated subcategory must survive deletion, an unstated one may be filled in", () => {
  // Bare value, bank fills the sub in: a gain, so the line really is redundant.
  const bare = [
    row({
      id: "1",
      description: "Rema",
      counterparty: "Rema",
      category: "dagligvarer",
      subcategory: null,
    }),
  ];
  assert.equal(
    overrideReport(bare, { rema: "dagligvarer" })[0]!.verdict,
    "redundant",
  );

  // Stated sub, bank contradicts it: deleting would call a bar a restaurant.
  const stated = [
    row({
      id: "1",
      description: "Barrock",
      counterparty: "Barrock",
      bankCategory: "kafe_og_restaurant",
      bankSub: "restaurant",
      category: "kafe_og_restaurant",
      subcategory: "utesteder",
    }),
  ];
  const line = overrideReport(stated, {
    barrock: "kafe_og_restaurant/utesteder",
  })[0]!;
  assert.notEqual(line.verdict, "redundant");
  assert.equal(line.kept, 0);

  // Stated sub the bank agrees with: still redundant, as it should be.
  const agrees = [
    row({
      id: "1",
      description: "Bar Circus",
      counterparty: "Bar Circus",
      bankCategory: "kafe_og_restaurant",
      bankSub: "utesteder",
      category: "kafe_og_restaurant",
      subcategory: "utesteder",
    }),
  ];
  assert.equal(
    overrideReport(agrees, { "bar circus": "kafe_og_restaurant/utesteder" })[0]!
      .verdict,
    "redundant",
  );
});
