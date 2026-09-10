import assert from "node:assert/strict";
import { test } from "node:test";
import { categorize } from "../../src/core/categorize.ts";
import { narrowings, overlaps } from "../../src/core/narrowings.ts";
import type { Categorized } from "../../src/core/types.ts";

function row(overrides: Partial<Categorized>): Categorized {
  return {
    id: "1",
    accountKey: "a",
    account: "Brukskonto",
    date: "2026-07-01",
    amount: -100,
    description: "Rema 1000",
    counterparty: "Rema 1000",
    country: null,
    bankCategory: "dagligvarer",
    bankSub: "dagligvarer",
    bankCategoryName: "Dagligvarer",
    bankSubName: "Matvarer",
    bankConfidence: 100,
    typeText: "VISA Varekjøp",
    remoteAccountNumber: null,
    isPending: false,
    isRecurring: false,
    isSubscription: false,
    excluded: false,
    reason: null,
    category: "dagligvarer",
    subcategory: "dagligvarer",
    ...overrides,
  };
}

test("a narrowed pattern keeps its own rows and takes none back", () => {
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
  const categories = { "sit kafe": "kafe_og_restaurant", sit: "husleie" };
  const [loose] = narrowings(rows, categories);
  assert.equal(loose!.pattern, "sit");

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
  assert.equal(answer(categories), "kafe_og_restaurant,husleie");
  assert.equal(answer(narrowed), "kafe_og_restaurant,husleie");
  assert.equal(answer(reversed), "kafe_og_restaurant,husleie");
  assert.equal(
    answer({ sit: "husleie", "sit kafe": "kafe_og_restaurant" }),
    "husleie,husleie",
  );
});

test("rows with the same text each count toward an overlap", () => {
  const rows = [
    row({ id: "1" }),
    row({ id: "2" }),
    row({ id: "3", excluded: true }),
    row({ id: "4", description: "Kiwi", counterparty: "Kiwi" }),
  ];
  const [o] = overlaps(rows, { rema: "reise", "rema 1000": "dagligvarer" });
  assert.equal(o!.rows, 2);
  assert.equal(
    overlaps(rows, { rema: "reise", "rema 1000": "dagligvarer" }, true)[0]!
      .rows,
    3,
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
