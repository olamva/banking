import { useDeferredValue, type Dispatch, type SetStateAction } from "react";
import type { BulkFile } from "../../core/bulkRules.ts";
import type { RuleFile, RuleMap } from "../../core/ruleFiles.ts";
import { matchesFilters, type Filters } from "../../core/select.ts";
import { totals } from "../../core/stats.ts";
import type { Categorized } from "../../core/types.ts";
import { ExcludedNote, pick } from "./Dashboard.tsx";
import { TransactionsCard } from "./Transactions.tsx";

interface TransactionsViewProps {
  rows: Categorized[];
  all: Categorized[];
  branchRules: RuleMap;
  filters: Filters;
  onFilters: Dispatch<SetStateAction<Filters>>;
  onFile: (txn: Categorized, file: RuleFile) => void;
  onBulk: (txns: Categorized[], file: BulkFile) => void;
}

export const TransactionsView = ({
  rows,
  all,
  branchRules,
  filters,
  onFilters,
  onFile,
  onBulk,
}: TransactionsViewProps) => {
  const search = useDeferredValue(filters.search);
  const shown = rows.filter((txn) =>
    matchesFilters(txn, { ...filters, search }),
  );

  return (
    <>
      <TransactionsCard
        txns={shown}
        all={all}
        branchRules={branchRules}
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
