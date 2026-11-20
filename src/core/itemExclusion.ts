import { purchasesOf, type Purchase } from "./items.ts";
import type { RuleMap } from "./ruleFiles.ts";
import {
  filteredPurchases,
  groupsOf,
  hasItemFilter,
  keepsItemsOnly,
  liveGroups,
  looseGroup,
  matchesFilters,
  type Filters,
} from "./select.ts";
import type { Categorized } from "./types.ts";

export const dropsItemsOnly = (f: Filters): boolean =>
  !keepsItemsOnly(f) && groupsOf(f).some(hasItemFilter);

export function withoutItems(
  rows: Categorized[],
  filters: Filters,
  names: RuleMap,
  categories: RuleMap,
): Categorized[] {
  const loose = liveGroups(filters).map(looseGroup);
  const kept = rows.filter((t) => loose.some((g) => matchesFilters(t, g)));
  const sum = (ps: Purchase[]) => {
    const by = new Map<Purchase["receipt"], number>();
    for (const p of ps) by.set(p.receipt, (by.get(p.receipt) ?? 0) + p.amount);
    return by;
  };
  const all = sum(purchasesOf(kept, names, filters.withoutDeposit, categories));
  const left = sum(filteredPurchases(kept, filters, names, categories));
  return kept.flatMap((t) => {
    if (!t.receipt || !all.has(t.receipt)) return [t];
    if (!left.has(t.receipt)) return [];
    const gone = all.get(t.receipt)! - left.get(t.receipt)!;
    return [{ ...t, amount: Math.round((t.amount + gone) * 100) / 100 }];
  });
}
