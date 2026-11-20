import {
  itemsOf,
  nameKey,
  purchasesOf,
  topCategory,
  type Purchase,
} from "./items.ts";
import type { RuleMap } from "./ruleFiles.ts";
import type { Categorized } from "./types.ts";

export type Group = Record<Axis | (typeof AXES)[Axis], string[]>;

export type Filters = Group & {
  or: Group[];
  search: string;
  showExcluded: boolean;
  withReceipt: boolean;
  withoutDeposit: boolean;
};

export const AXES = {
  categories: "categoriesOut",
  merchants: "merchantsOut",
  items: "itemsOut",
  kinds: "kindsOut",
  accounts: "accountsOut",
  countries: "countriesOut",
} as const;

export type Axis = keyof typeof AXES;

// `Object.entries` widens the key to `string`, and both callers want the pair.
export const axisPairs = (): [Axis, (typeof AXES)[Axis]][] =>
  Object.entries(AXES) as [Axis, (typeof AXES)[Axis]][];

const GROUP_KEYS = axisPairs().flat();

export const NO_GROUP = Object.fromEntries(
  GROUP_KEYS.map((k) => [k, []]),
) as unknown as Group;

export const NO_FILTERS: Filters = {
  ...NO_GROUP,
  or: [],
  search: "",
  showExcluded: false,
  withReceipt: false,
  withoutDeposit: false,
};

export const clearFilters = (f: Filters): Filters => ({
  ...NO_FILTERS,
  withoutDeposit: f.withoutDeposit,
});

const groupOf = (f: Group): Group =>
  Object.fromEntries(GROUP_KEYS.map((k) => [k, f[k]])) as Group;

export const emptyGroup = (g: Group): boolean =>
  GROUP_KEYS.every((k) => g[k].length === 0);

export const groupsOf = (f: Filters): Filters[] => [
  { ...f, or: [] },
  ...f.or.map((g) => ({ ...f, ...g, or: [] })),
];

export const liveGroups = (f: Filters): Filters[] => {
  const all = groupsOf(f);
  const live = all.filter((g) => !emptyGroup(g));
  return live.length ? live : all.slice(0, 1);
};

export const groupAt = (f: Filters, i: number): Filters => ({
  ...f,
  ...(i ? (f.or[i - 1] ?? NO_GROUP) : {}),
  or: [],
});

export const withGroupAt = (f: Filters, i: number, next: Filters): Filters =>
  i
    ? { ...next, ...groupOf(f), or: f.or.toSpliced(i - 1, 1, groupOf(next)) }
    : { ...next, or: f.or };

export const pruneGroups = (f: Filters): Filters => {
  const kept = [f, ...f.or].filter((g) => !emptyGroup(g));
  if (kept.length === f.or.length + 1) return f;
  const [first = NO_GROUP, ...rest] = kept.map(groupOf);
  return { ...f, ...first, or: rest };
};

export function cycleFilter(
  f: Filters,
  axis: Axis,
  value: string,
  exclude = false,
): Filters {
  const outKey = AXES[axis];
  const isIn = f[axis].includes(value);
  const isOut = f[outKey].includes(value);
  const target = exclude
    ? isOut
      ? null
      : outKey
    : isIn || isOut
      ? null
      : axis;
  return {
    ...f,
    [axis]: f[axis].filter((v) => v !== value),
    [outKey]: f[outKey].filter((v) => v !== value),
    ...(target ? { [target]: [...f[target], value] } : {}),
  };
}

export const merchantOf = (t: Categorized): string =>
  t.counterparty ?? t.description;

export const subcategoryOf = (t: Categorized): string =>
  `${t.category}/${t.subcategory ?? ""}`;

export function inRange(
  t: Categorized,
  from: string | null,
  to: string | null,
): boolean {
  if (from && t.date < from) return false;
  if (to && t.date > to) return false;
  return true;
}

const shown = (
  include: string[],
  exclude: string[],
  candidates: string[],
): boolean =>
  !candidates.some((c) => exclude.includes(c)) &&
  (!include.length || candidates.some((c) => include.includes(c)));

export const matchesFilters = (t: Categorized, f: Filters): boolean =>
  f.or.length
    ? liveGroups(f).some((g) => matchesGroup(t, g))
    : matchesGroup(t, f);

function matchesGroup(t: Categorized, f: Filters): boolean {
  if (t.excluded && !f.showExcluded) return false;
  if (f.withReceipt && !t.receipt) return false;
  if (!shown(f.categories, f.categoriesOut, [t.category, subcategoryOf(t)]))
    return false;
  if (!shown(f.merchants, f.merchantsOut, [merchantOf(t)])) return false;
  if (!shown(f.items.map(nameKey), f.itemsOut.map(nameKey), t.items ?? []))
    return false;
  if (!shown(f.kinds, f.kindsOut, t.kinds ?? [])) return false;
  if (!shown(f.accounts, f.accountsOut, [t.account])) return false;
  if (!shown(f.countries, f.countriesOut, [countryOf(t)])) return false;
  if (f.search) {
    const item = t.items?.some((k) => searchesItem(k, f.search));
    if (!searchesText(t, f.search) && !item) return false;
  }
  return true;
}

const searchesText = (t: Categorized, search: string) =>
  (t.description + " " + (t.counterparty ?? ""))
    .toLowerCase()
    .includes(search.toLowerCase());

export const searchesItem = (key: string, search: string): boolean =>
  nameKey(search)
    .split(" ")
    .every((w) => key.includes(w));

export function searchAsItem(rows: Categorized[], f: Filters): Filters {
  if (!f.search || f.or.length || keepsItemsOnly(f)) return f;
  const hits = rows.filter((t) => matchesFilters(t, f));
  const keys = new Set(
    hits.flatMap((t) => t.items?.filter((k) => searchesItem(k, f.search)) ?? []),
  );
  return keys.size === 1 && !hits.some((t) => searchesText(t, f.search))
    ? { ...f, search: "", items: [...keys] }
    : f;
}

export const hasItemFilter = (g: Filters) =>
  g.items.length + g.itemsOut.length + g.kinds.length + g.kindsOut.length > 0;

const keepsItems = (g: Filters) => g.items.length + g.kinds.length > 0;

export const looseGroup = (g: Filters): Filters => ({
  ...g,
  items: [],
  itemsOut: [],
  kinds: [],
  kindsOut: [],
});

const itemIn = (g: Filters, key: string, category: string) => {
  const kind = [topCategory(category), category];
  return (
    (!g.items.length || g.items.some((i) => nameKey(i) === key)) &&
    !g.itemsOut.some((i) => nameKey(i) === key) &&
    (!g.kinds.length || kind.some((k) => g.kinds.includes(k))) &&
    !kind.some((k) => g.kindsOut.includes(k))
  );
};

export const keepsItemsOnly = (f: Filters): boolean =>
  groupsOf(f).some(keepsItems);

export function filteredPurchases(
  rows: Categorized[],
  filters: Filters,
  names: RuleMap,
  categories: RuleMap,
): Purchase[] {
  const groups = liveGroups(filters);
  const loose = groups.map(looseGroup);
  const txns = rows.filter((t) => loose.some((g) => matchesFilters(t, g)));
  const all = purchasesOf(txns, names, filters.withoutDeposit, categories);
  if (!groups.some(hasItemFilter)) return all;
  const kindOf = new Map(itemsOf(all).map((i) => [i.key, i.category]));
  const txnOf = new Map(txns.map((t) => [t.receipt, t]));
  return all.filter((p) =>
    groups.some(
      (g, i) =>
        matchesFilters(txnOf.get(p.receipt)!, loose[i]!) &&
        itemIn(g, p.key, kindOf.get(p.key)!),
    ),
  );
}

export function itemSpend(
  rows: Categorized[],
  filters: Filters,
  names: RuleMap,
  categories: RuleMap,
): Categorized[] {
  const whole = liveGroups(filters).filter((g) => !keepsItems(g));
  const spent = new Map<Purchase["receipt"], number>();
  for (const p of filteredPurchases(rows, filters, names, categories))
    spent.set(p.receipt, (spent.get(p.receipt) ?? 0) + p.amount);
  return rows.map((t) =>
    !t.receipt || whole.some((g) => matchesFilters(t, g))
      ? t
      : { ...t, amount: -Math.round((spent.get(t.receipt) ?? 0) * 100) / 100 },
  );
}

export const markedItem = (key: string, f: Filters, kind = ""): boolean =>
  groupsOf(f).some(
    (g) =>
      g.items.some((i) => nameKey(i) === key) ||
      g.kinds.some((k) => k === kind || k === topCategory(kind)),
  ) ||
  (!!f.search && searchesItem(key, f.search));

export type PeriodKind = "month" | "year" | "recent" | "all" | "custom";

export type Period = {
  kind: PeriodKind;
  from: string | null;
  to: string | null;
  label: string;
  prev: { from: string; to: string; label: string } | null;
};

const monthBounds = (m: string) => ({ from: `${m}-01`, to: `${m}-31` });
const yearBounds = (y: number) => ({ from: `${y}-01-01`, to: `${y}-12-31` });

const CUSTOM = /^(\d{4}-\d{2}-\d{2})?\.\.(\d{4}-\d{2}-\d{2})?$/;
const RECENT = /^([1-9]\d{0,3})d$/;

export const RECENT_DAYS = [7, 30, 90, 365];

const shiftDay = (day: string, by: number): string =>
  new Date(Date.parse(`${day}T00:00:00Z`) + by * 86_400_000)
    .toISOString()
    .slice(0, 10);

export const todayOslo = (): string =>
  new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Oslo" });

export function period(p: string, now = todayOslo()): Period {
  if (/^\d{4}-\d{2}$/.test(p)) {
    const back = `${Number(p.slice(0, 4)) - 1}-${p.slice(5)}`;
    const prev =
      now.slice(0, 7) === p
        ? {
            from: `${back}-01`,
            to: `${back}-${now.slice(8)}`,
            label: "this time last year",
          }
        : { ...monthBounds(back), label: "last year" };
    return { kind: "month", ...monthBounds(p), label: p, prev };
  }
  if (/^\d{4}$/.test(p)) {
    const y = Number(p);
    const prev =
      now.slice(0, 4) === p
        ? {
            from: `${y - 1}-01-01`,
            to: `${y - 1}-${now.slice(5)}`,
            label: "this time last year",
          }
        : { ...yearBounds(y - 1), label: "last year" };
    return { kind: "year", ...yearBounds(y), label: p, prev };
  }
  const recent = RECENT.exec(p);
  if (recent) {
    const days = Number(recent[1]);
    return {
      kind: "recent",
      from: shiftDay(now, 1 - days),
      to: now,
      label: `Last ${days} days`,
      prev: {
        from: shiftDay(now, 1 - 2 * days),
        to: shiftDay(now, -days),
        label: `the ${days} days before`,
      },
    };
  }
  const range = CUSTOM.exec(p);
  if (range) {
    const [, from = null, to = null] = range;
    return {
      kind: "custom",
      from,
      to,
      label: from && to ? `${from} – ${to}` : (from ?? to ?? "All time"),
      prev: null,
    };
  }
  return { kind: "all", from: null, to: null, label: "All time", prev: null };
}

export function axisBounds(
  rows: Categorized[],
  p: Period,
  now = todayOslo(),
): { from: string; to: string } {
  const edge = rows.reduce(
    (latest, t) => (t.date > latest ? t.date : latest),
    now,
  );
  return {
    from:
      p.from ??
      rows.reduce((first, t) => (t.date < first ? t.date : first), edge),
    to: p.to && p.to < edge ? p.to : edge,
  };
}

const byLocale = (a: string, b: string) => a.localeCompare(b);

const distinct = (
  txns: Categorized[],
  of: (t: Categorized) => string,
  cmp?: (a: string, b: string) => number,
): string[] => [...new Set(txns.map(of))].sort(cmp);

export const distinctMonths = (txns: Categorized[]): string[] =>
  distinct(txns, (t) => t.date.slice(0, 7));

export const distinctYears = (txns: Categorized[]): string[] =>
  distinct(txns, (t) => t.date.slice(0, 4));

export const distinctCategories = (txns: Categorized[]): string[] =>
  distinct(txns, (t) => t.category);

export const distinctSubcategories = (txns: Categorized[]): string[] =>
  distinct(txns, subcategoryOf);

export const distinctMerchants = (txns: Categorized[]): string[] =>
  distinct(txns, merchantOf, byLocale);

const PEER = new Set([
  "diverse/vennebetaling",
  "innskudd/familie",
  "innskudd/lommepenger",
]);

// One peer row makes the name a person. A flatmate pays rent in one category
// and uses Vipps in another.
export function personMerchants(txns: Categorized[]): Set<string> {
  const people = new Set<string>();
  for (const t of txns)
    if (PEER.has(subcategoryOf(t))) people.add(merchantOf(t));
  return people;
}

export const NO_COUNTRY = "—";

export const countryOf = (t: Categorized): string => t.country ?? NO_COUNTRY;

// The dash sorts last, not among the letters.
export const distinctCountries = (txns: Categorized[]): string[] => {
  const all = distinct(txns, countryOf, byLocale);
  return all
    .filter((c) => c !== NO_COUNTRY)
    .concat(all.includes(NO_COUNTRY) ? [NO_COUNTRY] : []);
};

export const distinctAccounts = (txns: Categorized[]): string[] =>
  distinct(txns, (t) => t.account, byLocale);

const REPEATED = [
  ["merchants", "m"],
  ["items", "it"],
  ["kinds", "ic"],
  ["accounts", "acct"],
  ["countries", "co"],
] as const;

function groupToParams(f: Group, p = new URLSearchParams()) {
  if (f.categories.length) p.set("cat", f.categories.join(","));
  if (f.categoriesOut.length) p.set("cat_not", f.categoriesOut.join(","));
  for (const [axis, name] of REPEATED) {
    for (const v of f[axis]) p.append(name, v);
    for (const v of f[AXES[axis]]) p.append(`${name}_not`, v);
  }
  return p;
}

export function filtersToParams(filters: Filters, p = new URLSearchParams()) {
  const f = pruneGroups(filters);
  groupToParams(f, p);
  for (const g of f.or) p.append("or", groupToParams(g).toString());
  if (f.search) p.set("q", f.search);
  if (f.showExcluded) p.set("excl", "1");
  if (f.withReceipt) p.set("rcpt", "1");
  if (f.withoutDeposit) p.set("pant", "0");
  return p;
}

export const filtersFromParams = (p: URLSearchParams): Filters => ({
  ...groupFromParams(p),
  or: p
    .getAll("or")
    .map((g) => groupFromParams(new URLSearchParams(g)))
    .filter((g) => !emptyGroup(g)),
  search: p.get("q") ?? "",
  showExcluded: p.get("excl") === "1",
  withReceipt: p.get("rcpt") === "1",
  withoutDeposit: p.get("pant") === "0",
});

function groupFromParams(p: URLSearchParams): Group {
  const axis = (
    values: string[],
    out: string[],
    mode: string,
  ): [string[], string[]] =>
    p.get(`${mode}_mode`) === "exclude"
      ? [[], [...out, ...values]]
      : [values, out];
  const split = (name: string) => p.get(name)?.split(",").filter(Boolean) ?? [];
  const repeated = (name: string) => p.getAll(name).filter(Boolean);
  const [categories, categoriesOut] = axis(
    split("cat"),
    split("cat_not"),
    "cat",
  );
  const [merchants, merchantsOut] = axis(repeated("m"), repeated("m_not"), "m");
  const [accounts, accountsOut] = axis(
    repeated("acct"),
    repeated("acct_not"),
    "acct",
  );
  const [countries, countriesOut] = axis(
    repeated("co"),
    repeated("co_not"),
    "co",
  );
  return {
    categories,
    categoriesOut,
    merchants,
    merchantsOut,
    items: repeated("it"),
    itemsOut: repeated("it_not"),
    kinds: repeated("ic"),
    kindsOut: repeated("ic_not"),
    accounts,
    accountsOut,
    countries,
    countriesOut,
  };
}
