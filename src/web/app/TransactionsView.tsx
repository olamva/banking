import { useDeferredValue, type Dispatch, type SetStateAction } from "react";
import type { BulkFile } from "../../core/bulkRules.ts";
import type { RuleFile } from "../../core/ruleFiles.ts";
import { matchesFilters, type Filters } from "../../core/select.ts";
import { totals } from "../../core/stats.ts";
import type { Categorized } from "../../core/types.ts";
import { StatTile } from "./Cards.tsx";
import { ExcludedNote, pick } from "./Dashboard.tsx";
import { fmtNOK } from "./format.ts";
import { TransactionsCard } from "./Transactions.tsx";

interface TransactionsViewProps {
  rows: Categorized[];
  filters: Filters;
  onFilters: Dispatch<SetStateAction<Filters>>;
  onFile: (txn: Categorized, file: RuleFile) => void;
  onBulk: (txns: Categorized[], file: BulkFile) => void;
}

export const TransactionsView = ({
  rows,
  filters,
  onFilters,
  onFile,
  onBulk,
}: TransactionsViewProps) => {
  const search = useDeferredValue(filters.search);
  const shown = rows.filter((txn) =>
    matchesFilters(txn, { ...filters, search }),
  );
  const sums = totals(shown);

  return (
    <>
      <div className="mb-4 grid grid-cols-[repeat(auto-fit,minmax(min(150px,100%),1fr))] gap-3 max-sm:grid-cols-2 max-sm:[&>*:last-child:nth-child(odd)]:col-span-full">
        <StatTile label="Spent" value={fmtNOK(sums.totalOut)} />
        <StatTile label="Income" value={fmtNOK(sums.totalIn)} />
        <StatTile label="Net" value={fmtNOK(sums.net)} />
      </div>
      <TransactionsCard
        txns={shown}
        search={filters.search}
        onSearch={(search) => onFilters((current) => ({ ...current, search }))}
        onMerchant={pick(onFilters, "merchants")}
        onCategory={pick(onFilters, "categories")}
        onAccount={pick(onFilters, "accounts")}
        onFile={onFile}
        onBulk={onBulk}
      />
      <ExcludedNote excluded={totals(rows).excluded} where="in view" />
    </>
  );
};
