import { useMemo, useState, type ReactNode } from "react";
import type { BulkFile } from "../../core/bulkRules.ts";
import { BulkCheckbox, BulkSelectAll, BulkToolbar } from "./BulkToolbar.tsx";
import type { RuleFile, RuleMap } from "../../core/ruleFiles.ts";
import { merchantOf, subcategoryOf, type Axis } from "../../core/select.ts";
import type { SubscriptionGroup } from "../../core/stats.ts";
import type { Categorized } from "../../core/types.ts";
import { Empty, Panel } from "./Cards.tsx";
import {
  AMOUNT_SIZE,
  DataTable,
  type Column,
} from "./DataTable.tsx";
import { PickCell } from "./PickCell.tsx";
import {
  categoryColor,
  categoryLabel,
  fmtNOK,
  fmtShortDate,
  rowLabel,
  shortDateSizes,
} from "./format.ts";
import { CardIcon, Icon, ReceiptIcon, RecurringIcon } from "./icons.ts";
import type { ItemAction } from "./ReceiptLines.tsx";
import { TxnDialog } from "./TxnDialog.tsx";
import { GroupBySelect, TXN_GROUPS, useBranches } from "./TxnGroups.tsx";
import { Badge } from "./ui/badge.tsx";
import { cn } from "./ui/utils.ts";

export const useAccountCell = (txns: Categorized[]) => {
  const main = useMemo(() => {
    const groups = Object.groupBy(
      txns.filter((t) => !t.card),
      (t) => t.account,
    );
    return Object.keys(groups).sort(
      (a, b) => groups[b]!.length - groups[a]!.length,
    )[0];
  }, [txns]);
  return (
    t: Categorized,
    onPick?: (account: string, meta: boolean) => void,
  ) => {
    if (t.account === main) return false;
    const mark = t.card && (
      <Icon
        icon={CardIcon}
        size={15}
        aria-hidden={false}
        role="img"
        aria-label={t.account}
        className="block h-4.5"
      />
    );
    return (
      <span className="inline-flex align-middle text-muted-foreground">
        {onPick ? (
          <PickCell label={t.account} onPick={onPick}>
            {mark}
          </PickCell>
        ) : (
          mark || t.account
        )}
      </span>
    );
  };
};

const useSort = <T, S extends Record<string, (a: T, b: T) => number>>(
  items: T[],
  sorts: S,
  [sort, setSort]: [string, (sort: string) => void],
  ascFirst: (keyof S & string)[] = [],
) => {
  type K = keyof S & string;
  const firstAsc = (key: K) => ascFirst.includes(key);
  const key = sort.replace(/^-/, "");
  const by = Object.hasOwn(sorts, key) ? (key as K) : null;
  const asc = !sort.startsWith("-");
  const order = (key: K, up: boolean) => (up ? key : `-${key}`);
  const sorted = useMemo(
    () =>
      by ? [...items].sort((a, b) => (asc ? 1 : -1) * sorts[by](a, b)) : items,
    [items, sorts, by, asc],
  );

  return {
    sorted,
    by,
    head: (label: string, key: K, extra?: Partial<Column>): Column => ({
      label,
      ...extra,
      sort: by === key ? (asc ? "asc" : "desc") : null,
      onClick: () => setSort(order(key, by === key ? !asc : firstAsc(key))),
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
  const { sorted, head } = useSort(groups, GROUP_SORTS, useState("-total"), [
    "name",
    "category",
  ]);
  const categorySizes = useMemo(
    () => [...new Set(groups.map((g) => categoryLabel(g.category)))],
    [groups],
  );
  const lastSizes = useMemo(
    () => shortDateSizes(groups.map((g) => g.last)),
    [groups],
  );
  const countSizes = useMemo(
    () => [String(Math.max(...groups.map((g) => g.count)))],
    [groups],
  );

  if (groups.length === 0) return null;

  return (
    <Panel
      title="Subscriptions & recurring"
      description={`${groups.length} found in this period`}
      icon={RecurringIcon}
    >
      <DataTable
        list
        columns={[
          head("Subscription", "name", { phone: "title" }),
          head("Category", "category", {
            min: true,
            sizer: categorySizes,
            phone: "meta",
          }),
          head("Charges", "count", {
            num: true,
            min: true,
            sizer: countSizes,
            phone: "labeled",
          }),
          head("Per month", "latest", {
            num: true,
            min: true,
            sizer: AMOUNT_SIZE,
            phone: "end",
          }),
          head("Total", "total", {
            num: true,
            min: true,
            sizer: AMOUNT_SIZE,
            phone: "labeled",
          }),
          head("Last", "last", {
            min: true,
            sizer: lastSizes,
            phone: "labeled",
          }),
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
          fmtShortDate(g.last),
        ])}
      />
    </Panel>
  );
};

interface TransactionsCardProps {
  txns: Categorized[];
  info?: ReactNode;
  all?: Categorized[];
  branchRules?: RuleMap;
  open: Categorized | null;
  marked?: string[];
  onOpen: (txn: Categorized | null) => void;
  onPick: (axis: Axis) => (value: string, exclude: boolean) => void;
  onItem?: (txn: Categorized, raw: string, action: ItemAction) => void;
  onFile?: (txn: Categorized, file: RuleFile) => void;
  onBulk?: (txns: Categorized[], file: BulkFile) => void;
  onPayees?: (payees: string[], hide: boolean) => void;
  group: string;
  onGroup: (group: string) => void;
  sort: string;
  onSort: (sort: string) => void;
}

export const TransactionsCard = ({
  txns,
  info,
  all,
  branchRules,
  open,
  marked,
  onOpen,
  onPick,
  onItem,
  onFile,
  onBulk,
  onPayees,
  group,
  onGroup,
  sort,
  onSort,
}: TransactionsCardProps) => {
  const {
    sorted: bySort,
    head,
    by,
  } = useSort(
    txns,
    TXN_SORTS,
    [sort, onSort],
    ["merchant", "subcategory", "account"],
  );
  const groupBy =
    Object.hasOwn(TXN_GROUPS, group) || group === "None" ? group : "Day";
  const grouping = TXN_GROUPS[groupBy];
  const sorted = useMemo(
    () =>
      grouping?.time && by !== "date"
        ? bySort.toSorted((a, b) =>
            grouping.of(b).localeCompare(grouping.of(a)),
          )
        : bySort,
    [bySort, grouping, by],
  );
  const accountCell = useAccountCell(txns);
  const [selected, setSelected] = useState<Set<Categorized>>(new Set());
  const picked = txns.filter((t) => selected.has(t));
  if (picked.length !== selected.size) setSelected(new Set(picked));

  const subcategorySizes = useMemo(
    () => [...new Set(txns.map((t) => rowLabel(t.category, t.subcategory)))],
    [txns],
  );
  const dateSizes = useMemo(
    () => shortDateSizes(txns.map((t) => t.date)),
    [txns],
  );
  const { branches, ruled } = useBranches(all ?? txns, branchRules);

  const count = (
    <p
      aria-live="polite"
      className="flex items-center gap-0.5 text-sm text-muted-foreground tabular-nums"
    >
      {picked.length > 0
        ? `${picked.length}/${txns.length} selected`
        : `${txns.length} ${txns.length === 1 ? "transaction" : "transactions"}`}
      {info}
    </p>
  );

  return (
    <section className="min-w-0">
      {sorted.length === 0 ? (
        <>
          <div className="mb-2 flex min-h-8 items-center">{count}</div>
          <Empty>No transactions match the current filters.</Empty>
        </>
      ) : (
        <DataTable
          list
          onRow={(i) => onOpen(sorted[i] ?? null)}
          start={count}
          controls={
            <>
              {onBulk && picked.length > 0 && (
                <BulkToolbar
                  picked={picked}
                  onBulk={onBulk}
                  onPayees={onPayees}
                />
              )}
              <GroupBySelect value={groupBy} onChange={onGroup} />
            </>
          }
          group={
            grouping
              ? {
                  of: (i) => grouping.of(sorted[i]!),
                  label: grouping.label,
                  total: (indices) =>
                    fmtNOK(indices.reduce((s, i) => s + sorted[i]!.amount, 0)),
                  ...(onBulk && {
                    lead: (key: string, indices: number[]) => (
                      <BulkSelectAll
                        label={`Select ${grouping.label(key)}`}
                        txns={indices.map((i) => sorted[i]!)}
                        selected={selected}
                        onSelect={setSelected}
                      />
                    ),
                  }),
                }
              : undefined
          }
          rowClassName={(i) => (selected.has(sorted[i]!) ? "bg-muted" : "")}
          columns={[
            ...(onBulk
              ? [
                  {
                    label: "Select transactions",
                    header: (
                      <BulkSelectAll
                        label="Select all transactions"
                        txns={txns}
                        selected={selected}
                        onSelect={setSelected}
                      />
                    ),
                    min: true,
                    phone: "lead" as const,
                  },
                ]
              : []),
            head("Date", "date", {
              min: true,
              sizer: dateSizes,
              phone: "meta",
            }),
            head("Merchant / description", "merchant", { phone: "title" }),
            head("Category", "subcategory", {
              min: true,
              sizer: subcategorySizes,
              phone: "meta",
            }),
            head("Account", "account", { min: true, phone: "aside" }),
            head("Amount", "amount", {
              num: true,
              min: true,
              sizer: AMOUNT_SIZE,
              phone: "end",
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
            groupBy !== "Day" && fmtShortDate(t.date),
            <span className="inline-flex items-center gap-1">
              <PickCell
                label={
                  (groupBy === "Merchant" && branches.get(t)) || merchantOf(t)
                }
                value={merchantOf(t)}
                onPick={onPick("merchants")}
              />
              {groupBy !== "Merchant" && ruled.get(t) && (
                <span className="truncate text-muted-foreground">
                  {ruled.get(t)}
                </span>
              )}
              {t.receipt && (
                <Icon
                  icon={ReceiptIcon}
                  size={12}
                  aria-hidden={false}
                  aria-label="Has a receipt"
                  role="img"
                  className="shrink-0 text-muted-foreground"
                />
              )}
              {t.isPending && (
                <Badge
                  variant="outline"
                  className="border-dashed border-muted-foreground/60"
                >
                  Pending
                </Badge>
              )}
            </span>,
            <PickCell
              label={rowLabel(t.category, t.subcategory)}
              value={subcategoryOf(t)}
              color={categoryColor(t.category)}
              onPick={onPick("categories")}
            />,
            accountCell(t, onPick("accounts")),
            <span className={cn("font-semibold", t.amount > 0 && "text-good")}>
              {fmtNOK(t.amount)}
            </span>,
          ])}
        />
      )}
      {open && (
        <TxnDialog
          txn={open}
          marked={marked}
          onClose={() => onOpen(null)}
          onPick={(axis, value, exclude) => {
            onOpen(null);
            onPick(axis)(value, exclude);
          }}
          {...(onItem && {
            onItem: (raw, action) => {
              onOpen(null);
              onItem(open, raw, action);
            },
          })}
          {...(onFile && {
            onFile: (file) => {
              onOpen(null);
              onFile(open, file);
            },
          })}
        />
      )}
    </section>
  );
};
