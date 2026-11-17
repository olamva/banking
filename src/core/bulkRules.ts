import { haystackOf } from "./match.ts";
import { merchantOf, type Axis, type Filters } from "./select.ts";
import type { Categorized } from "./types.ts";

export const BULK_FILES = [
  "payees",
  "categories",
  "countries",
  "family",
  "subscriptions",
  "not-subscriptions",
] as const;

export type BulkFile = (typeof BULK_FILES)[number];

const BEFORE_FAMILY = new Set([
  "Excluded",
  "Category rule",
  "Giro rule",
  "Family rule",
]);

export const bulkChanges = (
  txn: Categorized,
  file: BulkFile,
  value: string,
): boolean => {
  if (file === "family") return !BEFORE_FAMILY.has(txn.categorySource ?? "");
  if (file === "subscriptions") return !txn.isSubscription;
  if (file === "not-subscriptions")
    return txn.isSubscription || txn.isRecurring;
  if (file === "countries") return txn.country !== value;
  if (file === "payees") return merchantOf(txn) !== value;
  return (
    (txn.subcategory ? `${txn.category}/${txn.subcategory}` : txn.category) !==
    value
  );
};

const namePattern = (txn: Categorized): string | null =>
  (txn.originalCounterparty ?? "").trim().toLowerCase() || null;

export const payeePattern = (txn: Categorized): string | null =>
  txn.excluded ? null : namePattern(txn);

export const bulkKey = (txn: Categorized, file: BulkFile): string | null => {
  if (txn.originalCounterparty === undefined) return null;
  if (file === "categories" || file === "family") return payeePattern(txn);
  if (file !== "payees") return namePattern(txn);
  const text = haystackOf(txn);
  return text.trim()
    ? `/^${text
        .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
        .replace(/\n/g, "\\n")
        .replace(/\r/g, "\\r")}(?![\\s\\S])/`
    : null;
};

export const bulkPlan = (
  selected: Categorized[],
  all: Categorized[],
  file: BulkFile,
) => {
  const keys = new Set(
    selected.map((t) => bulkKey(t, file)).filter((key) => key !== null),
  );
  const matches = all.filter((t) => {
    const key = bulkKey(t, file);
    return key !== null && keys.has(key);
  });
  return {
    keys: [...keys],
    matches,
    skipped: selected.filter((t) => bulkKey(t, file) === null).length,
    outside: matches.filter((t) => !selected.includes(t)).length,
  };
};

const FILTER_AXIS: Partial<Record<BulkFile, Axis>> = {
  payees: "merchants",
  categories: "categories",
  countries: "countries",
};

export const bulkFilters = (
  filters: Filters,
  file: BulkFile,
  value: string,
): Filters => {
  const axis = FILTER_AXIS[file];
  return axis && filters[axis].length
    ? { ...filters, [axis]: [...new Set([...filters[axis], value])] }
    : filters;
};
