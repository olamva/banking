import type { Categorized } from "./types.ts";

export type Filters = {
  categories: string[];
  categoriesOut: string[];
  merchants: string[];
  merchantsOut: string[];
  accounts: string[];
  accountsOut: string[];
  countries: string[];
  countriesOut: string[];
  search: string;
  showExcluded: boolean;
};

export const AXES = {
  categories: "categoriesOut",
  merchants: "merchantsOut",
  accounts: "accountsOut",
  countries: "countriesOut",
} as const;

export type Axis = keyof typeof AXES;

// `Object.entries` widens the key to `string`, and both callers want the pair.
export const axisPairs = (): [Axis, (typeof AXES)[Axis]][] =>
  Object.entries(AXES) as [Axis, (typeof AXES)[Axis]][];

export const NO_FILTERS: Filters = {
  categories: [],
  categoriesOut: [],
  merchants: [],
  merchantsOut: [],
  accounts: [],
  accountsOut: [],
  countries: [],
  countriesOut: [],
  search: "",
  showExcluded: false,
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
  const target = isOut ? null : exclude || isIn ? outKey : axis;
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

export function matchesFilters(t: Categorized, f: Filters): boolean {
  if (t.excluded && !f.showExcluded) return false;
  if (!shown(f.categories, f.categoriesOut, [t.category, subcategoryOf(t)]))
    return false;
  if (!shown(f.merchants, f.merchantsOut, [merchantOf(t)])) return false;
  if (!shown(f.accounts, f.accountsOut, [t.account])) return false;
  if (!shown(f.countries, f.countriesOut, [countryOf(t)])) return false;
  if (f.search) {
    const q = f.search.toLowerCase();
    const hay = (t.description + " " + (t.counterparty ?? "")).toLowerCase();
    if (!hay.includes(q)) return false;
  }
  return true;
}

export type PeriodKind = "month" | "year" | "all" | "custom";

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
// ponytail: this is a signal, not a register of people. It narrows a picker.
// It never changes a total.
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
