import { useMemo } from "react";
import { branchFinder, branchRule } from "../../core/names.ts";
import type { RuleMap } from "../../core/ruleFiles.ts";
import { merchantOf } from "../../core/select.ts";
import type { Categorized } from "../../core/types.ts";
import { categoryLabel, fmtDay, fmtMonth } from "./format.ts";
import { GroupIcon, Icon } from "./icons.ts";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
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
      <SelectGroup>
        <SelectLabel>Group by</SelectLabel>
        <SelectItem value="None">None</SelectItem>
        <SelectSeparator />
        {Object.keys(TXN_GROUPS).map((g) => (
          <SelectItem key={g} value={g}>
            {g}
          </SelectItem>
        ))}
      </SelectGroup>
    </SelectContent>
  </Select>
);

export const useBranches = (txns: Categorized[], rules: RuleMap = {}) =>
  useMemo(() => {
    const branchOf = branchFinder(txns, rules);
    const ruleOf = branchRule(rules);
    return {
      branches: new Map(txns.map((t) => [t, branchOf(t)])),
      ruled: new Map(txns.map((t) => [t, ruleOf(t) ?? null])),
    };
  }, [txns, rules]);
