import { haystackOf } from "./match.ts";
import type { Filters } from "./select.ts";
import { preferenceKey } from "./preferences.ts";
import type { Categorized } from "./types.ts";

export type BulkFile = "payees" | "preferences";

export const bulkKey = (txn: Categorized, file: BulkFile): string | null => {
  if (txn.originalCounterparty === undefined) return null;
  if (file === "preferences") return txn.excluded ? null : preferenceKey(txn);
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

export const bulkFilters = (
  filters: Filters,
  file: BulkFile,
  value: string,
): Filters => {
  const axis = file === "payees" ? "merchants" : "categories";
  return filters[axis].length
    ? { ...filters, [axis]: [...new Set([...filters[axis], value])] }
    : filters;
};
