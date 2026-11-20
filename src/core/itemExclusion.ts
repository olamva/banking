import { itemsOf, nameKey, purchasesOf, topCategory } from "./items.ts";
import type { RuleMap } from "./ruleFiles.ts";
import {
  groupsOf,
  hasItemFilter,
  keepsItemsOnly,
  liveGroups,
  looseGroup,
  matchesFilters,
  type Filters,
} from "./select.ts";
import type { Categorized } from "./types.ts";

export const droppedItem = (key: string, f: Filters, kind = ""): boolean =>
  groupsOf(f).some(
    (g) =>
      g.itemsOut.some((i) => nameKey(i) === key) ||
      g.kindsOut.some((k) => k === kind || k === topCategory(kind)),
  );

export const dropsItemsOnly =(f: Filters): boolean =>
  !keepsItemsOnly(f) && groupsOf(f).some(hasItemFilter);

export function withoutItems(
  rows: Categorized[],
  record: Categorized[],
  filters: Filters,
  names: RuleMap,
  categories: RuleMap,
): Categorized[] {
  const kindOf = new Map(
    itemsOf(purchasesOf(record, names, false, categories)).map((i) => [
      i.key,
      i.category,
    ]),
  );
  const loose = liveGroups(filters).map(looseGroup);
  const kept = rows.filter((t) => loose.some((g) => matchesFilters(t, g)));
  const lines = Map.groupBy(
    purchasesOf(kept, names, filters.withoutDeposit, categories),
    (p) => p.receipt,
  );
  return kept.flatMap((t) => {
    const all = t.receipt && lines.get(t.receipt);
    if (!all) return [t];
    const gone = all.filter((p) =>
      droppedItem(p.key, filters, kindOf.get(p.key)),
    );
    if (!gone.length) return [t];
    if (gone.length === all.length) return [];
    const cut = gone.reduce((s, p) => s + p.amount, 0);
    return [{ ...t, amount: Math.round((t.amount + cut) * 100) / 100 }];
  });
}
