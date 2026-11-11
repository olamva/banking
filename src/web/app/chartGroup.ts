import { useState } from "react";
import { topSpendGroups } from "../../core/stats.ts";
import type { Categorized } from "../../core/types.ts";
import { categoryLabel, rowLabel } from "./format.ts";
import { useShortcuts } from "./Shortcuts.tsx";

export type Group = "total" | "merchant" | "category";

export const GROUP_SHORTCUT = "Next grouping on the spending chart";

export const GROUP_LABEL: Record<Group, string> = {
  total: "Total",
  merchant: "Merchant",
  category: "Category",
};

const GROUPS: Group[] = ["total", "merchant", "category"];

const groupingsOf = (shown: Categorized[]) => {
  const byCategory = topSpendGroups(shown, (t) => categoryLabel(t.category));
  return {
    total: [],
    merchant: topSpendGroups(shown, (t) => t.counterparty),
    category:
      byCategory.length > 1
        ? byCategory
        : topSpendGroups(shown, (t) => rowLabel(t.category, t.subcategory)),
  };
};

export const useChartGroup = (shown: Categorized[]) => {
  const [group, setGroup] = useState<Group>("total");
  const groupings = groupingsOf(shown);
  const offered = GROUPS.filter(
    (g) => g === "total" || groupings[g].length > 1,
  );
  const by = offered.find((g) => g === group) ?? "total";
  useShortcuts([
    {
      keys: ["G"],
      cap: "G",
      what: GROUP_SHORTCUT,
      run: () => setGroup(offered[(offered.indexOf(by) + 1) % offered.length]!),
    },
  ]);
  return { by, offered, top: groupings[by], setGroup };
};
