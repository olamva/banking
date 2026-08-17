import assert from "node:assert/strict";
import { test } from "node:test";
import { NO_FILTERS } from "../../core/select.ts";
import { fromParams, toParams, type UrlState } from "./url.ts";

// Importing this module must stay DOM-free: readUrl/writeUrl only touch
// location/history when called, so node can run everything else here.

const DEFAULT: UrlState = {
  view: "dashboard",
  period: null,
  grain: "running",
  filters: NO_FILTERS,
};

test("the untouched page has no query string at all", () => {
  assert.equal(toParams(DEFAULT), "");
});

test("a populated state round-trips, nulls included", () => {
  const state: UrlState = {
    view: "transactions",
    grain: "month",
    period: "2026",
    filters: {
      categories: ["dagligvarer", "transport"],
      categoriesOut: ["dagligvarer/andre_dagligvarer"],
      merchants: ["Rema 1000", "Kiwi"],
      merchantsOut: ["Meny"],
      accounts: [],
      accountsOut: ["Mastercard Ung"],
      countries: ["Japan", "—"],
      countriesOut: ["Norway"],
      search: "rema",
      showExcluded: true,
    },
  };
  assert.deepEqual(fromParams(new URLSearchParams(toParams(state))), state);
  assert.deepEqual(fromParams(new URLSearchParams(toParams(DEFAULT))), DEFAULT);
});

/** One period for both views, so it rides along whichever one is showing. */
test("the period is one param, and the same one in either view", () => {
  assert.equal(toParams({ ...DEFAULT, period: "2026-07" }), "p=2026-07");
  // All time draws per month, so that is the grain App narrows to there and the
  // one this pairs with; `running` would be a state the page cannot be in.
  assert.equal(
    toParams({
      ...DEFAULT,
      view: "transactions",
      period: "all",
      grain: "month",
    }),
    "view=transactions&p=all",
  );
});

/**
 * A chart mode is a way of reading the window, so it is worth pinning in a tab
 * with the window itself. Unrecognised falls back rather than drawing nothing —
 * and App narrows it again to what the window in view actually offers.
 */
test("the chart grain rides along, and only when it is not the default", () => {
  assert.equal(toParams(DEFAULT), "");
  assert.equal(toParams({ ...DEFAULT, grain: "day" }), "g=day");
  assert.equal(
    toParams({ ...DEFAULT, period: "2026", grain: "month" }),
    "p=2026&g=month",
  );
  assert.equal(fromParams(new URLSearchParams("g=month")).grain, "month");
  assert.equal(fromParams(new URLSearchParams("g=sideways")).grain, "running");
  assert.equal(fromParams(new URLSearchParams("")).grain, "running");
});

/**
 * "Its default" is the window's, not a global one. All time draws per month and
 * offers nothing else, so `g=month` there would record a choice that was never
 * on offer — and reading it back has to land on the same value, or the round
 * trip drops a mode the page is actually drawing.
 */
test("the grain default follows the window, so all time names nothing", () => {
  const all: UrlState = { ...DEFAULT, period: "all", grain: "month" };
  assert.equal(toParams(all), "p=all");
  assert.deepEqual(fromParams(new URLSearchParams(toParams(all))), all);

  // The same value is worth naming on a year, where running is the default.
  assert.equal(
    toParams({ ...DEFAULT, period: "2026", grain: "month" }),
    "p=2026&g=month",
  );

  // A null period is the latest month, so it defaults like a month.
  assert.equal(fromParams(new URLSearchParams("")).grain, "running");
  assert.equal(fromParams(new URLSearchParams("p=2026-07")).grain, "running");
});

/** Two lists, so two params — and a page can be pinned with both of them on. */
test("the exclusions ride in their own param, beside the list they narrow", () => {
  const picked: UrlState = {
    ...DEFAULT,
    filters: { ...NO_FILTERS, categories: ["reise"] },
  };
  assert.equal(toParams(picked), "cat=reise");
  assert.equal(
    toParams({
      ...picked,
      filters: { ...picked.filters, categoriesOut: ["reise/flybilletter"] },
    }),
    "cat=reise&cat_not=reise%2Fflybilletter",
  );
  // Exclusions alone need no include list: that is "everything except these".
  const only = fromParams(new URLSearchParams("cat_not=reise")).filters;
  assert.deepEqual([only.categories, only.categoriesOut], [[], ["reise"]]);
});

/**
 * A tab pinned before the split says `cat_mode=exclude`, and reading only the
 * new spelling would show that tab *only* what it asked to hide — the exact
 * opposite page, with nothing on it to say so.
 */
test("a URL written before the split still means what it meant", () => {
  const f = fromParams(
    new URLSearchParams("cat=reise&cat_mode=exclude&m=Kiwi&m_mode=exclude"),
  ).filters;
  assert.deepEqual([f.categories, f.categoriesOut], [[], ["reise"]]);
  assert.deepEqual([f.merchants, f.merchantsOut], [[], ["Kiwi"]]);
  // Anything else in that param is the default it always was.
  assert.deepEqual(
    fromParams(new URLSearchParams("cat=reise&cat_mode=sideways")).filters
      .categories,
    ["reise"],
  );
});

/** A merchant name can hold a comma, so each gets its own param rather than one joined list. */
test("accounts ride along as their own repeated param", () => {
  const f = {
    ...NO_FILTERS,
    accounts: ["Sparekonto, felles"],
    accountsOut: ["Brukskonto, mine"],
  };
  const q = toParams({ ...DEFAULT, filters: f });
  assert.equal(q, "acct=Sparekonto%2C+felles&acct_not=Brukskonto%2C+mine");
  assert.deepEqual(fromParams(new URLSearchParams(q)).filters, f);
});

test("merchants survive a comma in the name", () => {
  const state: UrlState = {
    ...DEFAULT,
    filters: {
      ...NO_FILTERS,
      merchants: ["Meny, Torgallmenningen", "Kiwi"],
      merchantsOut: ["Rema 1000, Moholt"],
    },
  };
  assert.deepEqual(fromParams(new URLSearchParams(toParams(state))), state);
  assert.equal(
    toParams({ ...DEFAULT, filters: { ...NO_FILTERS, merchants: ["Kiwi"] } }),
    "m=Kiwi",
  );
});

/** Hiding them is the default, so only the shown state is worth a param. */
test("showExcluded rides along only when it is on", () => {
  assert.equal(
    toParams({ ...DEFAULT, filters: { ...NO_FILTERS, showExcluded: true } }),
    "excl=1",
  );
  assert.equal(
    fromParams(new URLSearchParams("excl=yes")).filters.showExcluded,
    false,
  );
});

/** An unknown period is App's problem, not the URL's — it falls back to the latest month there. */
test("junk params fall back to the default, and an empty cat is no categories", () => {
  const s = fromParams(new URLSearchParams("cat=&view=sideways&p="));
  assert.deepEqual(s.filters.categories, []);
  assert.equal(s.view, "dashboard");
  assert.equal(s.period, null);
});

test("a subcategory pair rides in the category list, slash and all", () => {
  // Both levels are one axis, so a pair is just another value in `cat` — and
  // `cat` is comma-joined, which a pair never contains.
  const state: UrlState = {
    ...DEFAULT,
    filters: {
      ...DEFAULT.filters,
      categories: [
        "annet_lan_og_gjeld",
        "dagligvarer/andre_dagligvarer",
        "vipps/",
      ],
    },
  };
  assert.deepEqual(
    fromParams(new URLSearchParams(toParams(state))).filters.categories,
    ["annet_lan_og_gjeld", "dagligvarer/andre_dagligvarer", "vipps/"],
  );
});
