import { useMemo, useState } from "react";
import type { BulkFile } from "../../core/bulkRules.ts";
import { BulkCheckbox, BulkSelectAll, BulkToolbar } from "./BulkToolbar.tsx";
import type { RuleFile } from "../../core/ruleFiles.ts";
import { merchantOf, subcategoryOf } from "../../core/select.ts";
import type { SubscriptionGroup } from "../../core/stats.ts";
import type { Categorized } from "../../core/types.ts";
import {
  AMOUNT_SIZE,
  AMOUNT_SIZE_EXACT,
  Card,
  DataTable,
  Empty,
  PickCell,
  highlighting,
  type Column,
} from "./Cards.tsx";
import {
  categoryColor,
  categoryLabel,
  fmtNOK,
  fmtNOKExact,
  rowLabel,
} from "./format.ts";
import { Icon, ReceiptIcon, RecurringIcon, TransactionsIcon } from "./icons.ts";
import { SearchBox } from "./SearchBox.tsx";
import { TxnDialog } from "./TxnDialog.tsx";
const useSort = <T, S extends Record<string, (a: T, b: T) => number>>(
  items: T[],
  sorts: S,
  initial: keyof S & string,
  ascFirst: (keyof S & string)[] = [],
) => {
  type K = keyof S & string;
  const firstAsc = (key: K) => ascFirst.includes(key);
  const [by, setBy] = useState<K | null>(initial);
  const [asc, setAsc] = useState(firstAsc(initial));
  const sorted = useMemo(
    () =>
      by ? [...items].sort((a, b) => (asc ? 1 : -1) * sorts[by](a, b)) : items,
    [items, sorts, by, asc],
  );

  return {
    sorted,
    head: (label: string, key: K, extra?: Partial<Column>): Column => ({
      label,
      ...extra,
      sort: by === key ? (asc ? "asc" : "desc") : null,
      onClick: () =>
        by !== key
          ? (setBy(key), setAsc(firstAsc(key)))
          : asc === firstAsc(key)
            ? setAsc(!asc)
            : setBy(null),
    }),
  };
};

const TXN_SORTS = {
  date: (a: Categorized, b: Categorized) => a.date.localeCompare(b.date),
  merchant: (a: Categorized, b: Categorized) =>
    merchantOf(a).localeCompare(merchantOf(b)),
  subcategory: (a: Categorized, b: Categorized) =>
    categoryLabel(a.category).localeCompare(categoryLabel(b.category)) ||
    rowLabel(a.category, a.subcategory).localeCompare(
      rowLabel(b.category, b.subcategory),
    ),
  account: (a: Categorized, b: Categorized) =>
    a.account.localeCompare(b.account),
  amount: (a: Categorized, b: Categorized) => a.amount - b.amount,
};

export const useTxnSort = (txns: Categorized[]) =>
  useSort(txns, TXN_SORTS, "date", ["merchant", "subcategory", "account"]);

const GROUP_SORTS = {
  name: (a: SubscriptionGroup, b: SubscriptionGroup) =>
    a.name.localeCompare(b.name),
  category: (a: SubscriptionGroup, b: SubscriptionGroup) =>
    categoryLabel(a.category).localeCompare(categoryLabel(b.category)),
  count: (a: SubscriptionGroup, b: SubscriptionGroup) => a.count - b.count,
  latest: (a: SubscriptionGroup, b: SubscriptionGroup) => a.latest - b.latest,
  total: (a: SubscriptionGroup, b: SubscriptionGroup) => a.total - b.total,
  last: (a: SubscriptionGroup, b: SubscriptionGroup) =>
    a.last.localeCompare(b.last),
};

interface SubscriptionsCardProps {
  groups: SubscriptionGroup[];
  onMerchant: (merchant: string, meta: boolean) => void;
  onCategory: (category: string, meta: boolean) => void;
}

export const SubscriptionsCard = ({
  groups,
  onMerchant,
  onCategory,
}: SubscriptionsCardProps) => {
  const [search, setSearch] = useState("");
  const shown = useMemo(() => {
    const q = search.toLowerCase();
    return q
      ? groups.filter(
          (g) =>
            g.name.toLowerCase().includes(q) ||
            categoryLabel(g.category).toLowerCase().includes(q),
        )
      : groups;
  }, [groups, search]);
  const { sorted, head } = useSort(shown, GROUP_SORTS, "total", [
    "name",
    "category",
  ]);
  const categorySizes = useMemo(
    () => [...new Set(groups.map((g) => categoryLabel(g.category)))],
    [groups],
  );

  if (groups.length === 0) return null;

  return (
    <Card
      title={`Subscriptions & recurring (${groups.length})`}
      icon={RecurringIcon}
    >
      <SearchBox
        value={search}
        onChange={setSearch}
        placeholder="Search subscriptions…"
      />
      {sorted.length === 0 ? (
        <Empty>No subscriptions match the search.</Empty>
      ) : (
        <DataTable
          scroll
          columns={[
            head("Subscription", "name"),
            head("Category", "category", { min: true, sizer: categorySizes }),
            head("Charges", "count", { num: true, min: true }),
            head("Per month", "latest", {
              num: true,
              min: true,
              sizer: AMOUNT_SIZE,
            }),
            head("Total", "total", {
              num: true,
              min: true,
              sizer: AMOUNT_SIZE,
            }),
            head("Last", "last", { min: true }),
          ]}
          rows={sorted.map((g) => [
            <PickCell label={g.name} onPick={onMerchant} />,
            <PickCell
              label={categoryLabel(g.category)}
              value={g.category}
              color={categoryColor(g.category)}
              onPick={onCategory}
            />,
            g.count,
            fmtNOK(g.latest),
            fmtNOK(g.total),
            g.last,
          ])}
        />
      )}
    </Card>
  );
};

interface TransactionsCardProps {
  txns: Categorized[];
  search: string;
  onSearch: (search: string) => void;
  onMerchant: (merchant: string, meta: boolean) => void;
  onCategory: (category: string, meta: boolean) => void;
  onAccount: (account: string, meta: boolean) => void;
  onFile?: (txn: Categorized, file: RuleFile) => void;
  onBulk?: (txns: Categorized[], file: BulkFile) => void;
}

export const TransactionsCard = ({
  txns,
  search,
  onSearch,
  onMerchant,
  onCategory,
  onAccount,
  onFile,
  onBulk,
}: TransactionsCardProps) => {
  const { sorted, head } = useTxnSort(txns);
  const [open, setOpen] = useState<Categorized | null>(null);
  const [selected, setSelected] = useState<Set<Categorized>>(new Set());
  const picked = txns.filter((t) => selected.has(t));
  if (picked.length !== selected.size) setSelected(new Set(picked));

  const subcategorySizes = useMemo(
    () => [...new Set(txns.map((t) => rowLabel(t.category, t.subcategory)))],
    [txns],
  );

  return (
    <section className="min-w-0">
      <div className="px-3 sm:px-0">
        <h2 className="mb-2.5 flex items-center gap-1.5 text-sm font-semibold">
          <Icon
            icon={TransactionsIcon}
            size={15}
            className="shrink-0 text-ink-soft"
          />
          Transactions ({txns.length})
          {onBulk && txns.length > 0 && (
            <BulkToolbar
              txns={txns}
              picked={picked}
              onBulk={onBulk}
              onClear={() => setSelected(new Set())}
            />
          )}
        </h2>
        <SearchBox
          hotkey
          value={search}
          onChange={onSearch}
          placeholder="Search merchant or description…"
        />
      </div>
      {sorted.length === 0 ? (
        <Empty>No transactions match the current filters.</Empty>
      ) : (
        <DataTable
          scroll
          onRow={(i) => setOpen(sorted[i] ?? null)}
          rowClassName={(i) =>
            `${sorted[i]?.isPending ? "striped" : ""} ${selected.has(sorted[i]!) ? "bg-hover" : ""}`
          }
          columns={[
            ...(onBulk
              ? [
                  {
                    label: "Select transactions",
                    header: (
                      <BulkSelectAll
                        checked={selected.size === txns.length}
                        onChange={(checked) =>
                          setSelected(checked ? new Set(txns) : new Set())
                        }
                      />
                    ),
                    min: true,
                  },
                ]
              : []),
            head("Date", "date", { min: true }),
            head("Merchant / description", "merchant"),
            head("Category", "subcategory", {
              min: true,
              sizer: subcategorySizes,
            }),
            head("Account", "account", { min: true }),
            head("Amount", "amount", {
              num: true,
              min: true,
              sizer: AMOUNT_SIZE_EXACT,
            }),
          ]}
          rows={sorted.map((t) => [
            ...(onBulk
              ? [
                  <BulkCheckbox
                    txn={t}
                    selected={selected}
                    onSelect={setSelected}
                  />,
                ]
              : []),
            <button
              type="button"
              onClick={(e) => !highlighting(e) && setOpen(t)}
              className="text-left hover:underline"
            >
              {t.date}
            </button>,
            <span className="inline-flex items-center gap-1">
              <PickCell label={merchantOf(t)} onPick={onMerchant} />
              {t.receipt && (
                <Icon
                  icon={ReceiptIcon}
                  size={12}
                  aria-hidden={false}
                  aria-label="Has a receipt"
                  role="img"
                  className="shrink-0 text-ink-muted"
                />
              )}
            </span>,
            <PickCell
              label={rowLabel(t.category, t.subcategory)}
              value={subcategoryOf(t)}
              color={categoryColor(t.category)}
              onPick={onCategory}
            />,
            <PickCell label={t.account} onPick={onAccount} />,
            fmtNOKExact(t.amount),
          ])}
        />
      )}
      {open && (
        <TxnDialog
          txn={open}
          onClose={() => setOpen(null)}
          {...(onFile && {
            onFile: (file) => {
              setOpen(null);
              onFile(open, file);
            },
          })}
        />
      )}
    </section>
  );
};
