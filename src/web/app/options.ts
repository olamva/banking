import { useMemo } from "react";
import {
  distinctAccounts,
  distinctCategories,
  distinctCountries,
  distinctMerchants,
  distinctSubcategories,
  personMerchants,
  type Filters,
} from "../../core/select.ts";
import type { Categorized } from "../../core/types.ts";
import { subcategoryLabel } from "./format.ts";

const withPicked = (offered: string[], picked: string[]): string[] =>
  [...new Set([...offered, ...picked])].sort((a, b) => a.localeCompare(b));

const parentOf = (pair: string) => pair.slice(0, pair.indexOf("/"));
const subLabelOf = (pair: string) =>
  subcategoryLabel(parentOf(pair), pair.slice(pair.indexOf("/") + 1) || null);

export const useFilterOptions = (inPeriod: Categorized[], filters: Filters) => {
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
  const people = useMemo(() => personMerchants(inPeriod), [inPeriod]);
  const accounts = useMemo(
    () => withPicked(distinctAccounts(inPeriod), filters.accounts),
    [inPeriod, filters.accounts],
  );
  const countries = useMemo(() => {
    const inView = distinctCountries(inPeriod);
    return inView.concat(filters.countries.filter((c) => !inView.includes(c)));
  }, [inPeriod, filters.countries]);
  return { categories, subcategories, merchants, people, accounts, countries };
};
