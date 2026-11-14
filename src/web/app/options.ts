import { useMemo } from "react";
import { itemsOf, purchasesOf } from "../../core/items.ts";
import type { RuleMap } from "../../core/ruleFiles.ts";
import {
  countryOf,
  distinctAccounts,
  distinctCategories,
  distinctCountries,
  distinctMerchants,
  distinctSubcategories,
  merchantOf,
  personMerchants,
  subcategoryOf,
  type Axis,
  type Filters,
} from "../../core/select.ts";
import type { Categorized } from "../../core/types.ts";
import { subcategoryLabel } from "./format.ts";

const withPicked = (offered: string[], picked: string[]): string[] =>
  [...new Set([...offered, ...picked])].sort((a, b) => a.localeCompare(b));

const parentOf = (pair: string) => pair.slice(0, pair.indexOf("/"));
const subLabelOf = (pair: string) =>
  subcategoryLabel(parentOf(pair), pair.slice(pair.indexOf("/") + 1) || null);

export const useFilterOptions = (
  inPeriod: Categorized[],
  filters: Filters,
  names: RuleMap,
) => {
  const categories = useMemo(
    () =>
      [
        ...new Set([
          ...distinctCategories(inPeriod),
          ...filters.categories.map((c) => (c.includes("/") ? parentOf(c) : c)),
        ]),
      ].sort(),
    [inPeriod, filters.categories],
  );
  const subcategories = useMemo(
    () =>
      [
        ...new Set([
          ...distinctSubcategories(inPeriod),
          ...filters.categories.filter((c) => c.includes("/")),
        ]),
      ].sort(
        (a, b) =>
          parentOf(a).localeCompare(parentOf(b)) ||
          subLabelOf(a).localeCompare(subLabelOf(b)),
      ),
    [inPeriod, filters.categories],
  );
  const merchants = useMemo(
    () => withPicked(distinctMerchants(inPeriod), filters.merchants),
    [inPeriod, filters.merchants],
  );
  const bought = useMemo(
    () => itemsOf(purchasesOf(inPeriod, names)),
    [inPeriod, names],
  );
  const items = useMemo(
    () =>
      withPicked(
        bought.map((i) => i.name),
        filters.items,
      ),
    [bought, filters.items],
  );
  const uses = useMemo((): Record<Axis, ReadonlyMap<string, number>> => {
    const tally = (of: (t: Categorized) => string[]) => {
      const n = new Map<string, number>();
      for (const t of inPeriod)
        for (const k of of(t)) n.set(k, (n.get(k) ?? 0) + 1);
      return n;
    };
    return {
      categories: tally((t) => [t.category, subcategoryOf(t)]),
      merchants: tally((t) => [merchantOf(t)]),
      items: new Map(bought.map((i) => [i.name, i.count])),
      accounts: tally((t) => [t.account]),
      countries: tally((t) => [countryOf(t)]),
    };
  }, [inPeriod, bought]);
  const people = useMemo(() => personMerchants(inPeriod), [inPeriod]);
  const accounts = useMemo(
    () => withPicked(distinctAccounts(inPeriod), filters.accounts),
    [inPeriod, filters.accounts],
  );
  const countries = useMemo(() => {
    const inView = distinctCountries(inPeriod);
    return inView.concat(filters.countries.filter((c) => !inView.includes(c)));
  }, [inPeriod, filters.countries]);
  return {
    categories,
    subcategories,
    merchants,
    items,
    people,
    accounts,
    countries,
    uses,
  };
};
