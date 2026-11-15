import { useMemo } from "react";
import { branchFinder } from "../../core/names.ts";
import { merchantOf } from "../../core/select.ts";
import type { Categorized } from "../../core/types.ts";
import { categoryLabel, fmtDay, fmtMonth } from "./format.ts";
import { GroupIcon, Icon } from "./icons.ts";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select.tsx";

const upper = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export const TXN_GROUPS: Record<
  string,
  {
    of: (t: Categorized) => string;
    label: (key: string) => string;
    time?: boolean;
  }
> = {
  Day: { of: (t) => t.date, label: (d) => upper(fmtDay(d)), time: true },
  Month: {
    of: (t) => t.date.slice(0, 7),
    label: (m) => upper(fmtMonth(m)),
    time: true,
  },
  Category: { of: (t) => t.category, label: categoryLabel },
  Merchant: { of: merchantOf, label: (key) => key },
  Account: { of: (t) => t.account, label: (key) => key },
};

interface GroupBySelectProps {
  value: string;
  onChange: (value: string) => void;
}

export const GroupBySelect = ({ value, onChange }: GroupBySelectProps) => (
  <Select value={value} onValueChange={onChange}>
    <SelectTrigger size="sm" aria-label="Group by" className="text-xs">
      <Icon icon={GroupIcon} className="max-sm:hidden" />
      <SelectValue />
    </SelectTrigger>
    <SelectContent position="popper" align="end">
      {[...Object.keys(TXN_GROUPS), "None"].map((g) => (
        <SelectItem key={g} value={g}>
          {g}
        </SelectItem>
      ))}
    </SelectContent>
  </Select>
);

export const useBranches = (txns: Categorized[]) =>
  useMemo(() => {
    const branchOf = branchFinder(txns);
    const branches = new Map(txns.map((t) => [t, branchOf(t)]));
    const longest = [...branches.values()].reduce<string>(
      (a, b) => (b && b.length > a.length ? b : a),
      "",
    );
    return { branches, sizes: [longest] };
  }, [txns]);
