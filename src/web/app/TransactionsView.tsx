import {
  useDeferredValue,
  useMemo,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import type { BulkFile } from "../../core/bulkRules.ts";
import { itemsOf, nameKey, purchasesOf } from "../../core/items.ts";
import type { RuleFile } from "../../core/ruleFiles.ts";
import {
  groupsOf,
  markedItem,
  matchesFilters,
  type Filters,
} from "../../core/select.ts";
import { totals } from "../../core/stats.ts";
import type { Categorized } from "../../core/types.ts";
import { ExcludedInfo, pick } from "./Dashboard.tsx";
import { mapRules, type RulesApi } from "./data.ts";
import { ItemSheet } from "./ItemSheet.tsx";
import type { ItemAction } from "./ReceiptLines.tsx";
import { TransactionsCard } from "./Transactions.tsx";

interface TransactionsViewProps {
  rows: Categorized[];
  all: Categorized[];
  rules: RulesApi;
  filters: Filters;
  onFilters: Dispatch<SetStateAction<Filters>>;
  onFile: (txn: Categorized, file: RuleFile) => void;
  onBulk: (txns: Categorized[], file: BulkFile) => void;
  group: string;
  onGroup: (group: string) => void;
  sort: string;
  onSort: (sort: string) => void;
}

export const TransactionsView = ({
  rows,
  all,
  rules,
  filters,
  onFilters,
  onFile,
  onBulk,
  ...table
}: TransactionsViewProps) => {
  const search = useDeferredValue(filters.search);
  const shown = rows.filter((txn) =>
    matchesFilters(txn, { ...filters, search }),
  );
  const names = mapRules(rules, "items");
  const kinds = mapRules(rules, "item-categories");
  const [picked, setPicked] = useState<string | null>(null);
  const [open, setOpen] = useState<Categorized | null>(null);
  const [back, setBack] = useState<Categorized | null>(null);
  const needed =
    !!picked || (!!open && groupsOf(filters).some((g) => g.kinds.length > 0));
  const items = useMemo(
    () =>
      needed
        ? itemsOf(purchasesOf(all, names, filters.withoutDeposit, kinds))
        : [],
    [needed, all, names, kinds, filters.withoutDeposit],
  );
  const item = items.find((i) => i.key === picked);
  const marked = purchasesOf(open ? [open] : [], names)
    .filter((p) =>
      markedItem(p.key, filters, items.find((i) => i.key === p.key)?.category),
    )
    .map((p) => p.raw);

  const onItem = (txn: Categorized, raw: string, action: ItemAction) => {
    const bought = purchasesOf([txn], names).find((p) => p.raw === raw);
    if (!bought) return;
    if (action === "details") {
      setBack(txn);
      return setPicked(bought.key);
    }
    const other = (list: string[]) =>
      list.filter((v) => nameKey(v) !== bought.key);
    onFilters((f) =>
      action === "only"
        ? { ...f, items: [bought.name], itemsOut: other(f.itemsOut) }
        : {
            ...f,
            items: other(f.items),
            itemsOut: [...other(f.itemsOut), bought.name],
          },
    );
  };

  return (
    <>
      <TransactionsCard
        txns={shown}
        info={
          <ExcludedInfo
            excluded={totals(rows).excluded}
            shown={filters.showExcluded}
          />
        }
        all={all}
        branchRules={mapRules(rules, "branches")}
        open={open}
        marked={marked}
        onOpen={setOpen}
        onPick={(axis) => pick(onFilters, axis)}
        onItem={onItem}
        onFile={onFile}
        onBulk={onBulk}
        onPayees={(payees, hide) =>
          onFilters((f) => {
            const other = (list: string[]) =>
              list.filter((p) => !payees.includes(p));
            return hide
              ? {
                  ...f,
                  merchants: other(f.merchants),
                  merchantsOut: [...other(f.merchantsOut), ...payees],
                }
              : {
                  ...f,
                  merchants: payees,
                  merchantsOut: other(f.merchantsOut),
                };
          })
        }
        {...table}
      />
      {item && (
        <ItemSheet
          key={item.key}
          item={item}
          names={items.map((i) => i.name)}
          rules={rules}
          onRename={(name) => setPicked(nameKey(name))}
          {...(back && {
            onBack: () => {
              setPicked(null);
              setOpen(back);
            },
          })}
          onClose={() => {
            setPicked(null);
            setBack(null);
          }}
        />
      )}
    </>
  );
};
