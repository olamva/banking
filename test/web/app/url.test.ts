import assert from "node:assert/strict";
import { test } from "node:test";
import { NO_FILTERS } from "../../../src/core/select.ts";
import {
  fromParams,
  toParams,
  type UrlState,
} from "../../../src/web/app/url.ts";

const DEFAULT: UrlState = {
  view: "dashboard",
  ruleFile: "categories",
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
    ruleFile: "categories",
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

test("the period is one param, and the same one in either view", () => {
  assert.equal(toParams({ ...DEFAULT, period: "2026-07" }), "p=2026-07");
  assert.equal(
    toParams({
      ...DEFAULT,
      view: "transactions",
      ruleFile: "categories",
      period: "all",
      grain: "month",
    }),
    "view=transactions&p=all",
  );
});

test("the insights view round-trips through the URL", () => {
  const state: UrlState = { ...DEFAULT, view: "insights", period: "2026" };
  assert.equal(toParams(state), "view=insights&p=2026");
  assert.deepEqual(fromParams(new URLSearchParams(toParams(state))), state);
});

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

test("the grain default follows the window, so all time names nothing", () => {
  const all: UrlState = { ...DEFAULT, period: "all", grain: "month" };
  assert.equal(toParams(all), "p=all");
  assert.deepEqual(fromParams(new URLSearchParams(toParams(all))), all);

  assert.equal(
    toParams({ ...DEFAULT, period: "2026", grain: "month" }),
    "p=2026&g=month",
  );

  assert.equal(fromParams(new URLSearchParams("")).grain, "running");
  assert.equal(fromParams(new URLSearchParams("p=2026-07")).grain, "running");
});

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
  const only = fromParams(new URLSearchParams("cat_not=reise")).filters;
  assert.deepEqual([only.categories, only.categoriesOut], [[], ["reise"]]);
});

test("a URL written before the split still means what it meant", () => {
  const f = fromParams(
    new URLSearchParams("cat=reise&cat_mode=exclude&m=Kiwi&m_mode=exclude"),
  ).filters;
  assert.deepEqual([f.categories, f.categoriesOut], [[], ["reise"]]);
  assert.deepEqual([f.merchants, f.merchantsOut], [[], ["Kiwi"]]);
  assert.deepEqual(
    fromParams(new URLSearchParams("cat=reise&cat_mode=sideways")).filters
      .categories,
    ["reise"],
  );
});

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

test("junk params fall back to the default, and an empty cat is no categories", () => {
  const s = fromParams(new URLSearchParams("cat=&view=sideways&p="));
  assert.deepEqual(s.filters.categories, []);
  assert.equal(s.view, "dashboard");
  assert.equal(s.period, null);
});

test("a subcategory pair rides in the category list, slash and all", () => {
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
