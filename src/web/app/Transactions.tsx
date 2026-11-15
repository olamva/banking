import { useMemo, useState, type ReactNode } from "react";
import type { BulkFile } from "../../core/bulkRules.ts";
import { BulkCheckbox, BulkSelectAll, BulkToolbar } from "./BulkToolbar.tsx";
import type { RuleFile, RuleMap } from "../../core/ruleFiles.ts";
import { merchantOf, subcategoryOf } from "../../core/select.ts";
import type { SubscriptionGroup } from "../../core/stats.ts";
import type { Categorized } from "../../core/types.ts";
import { Empty, Panel } from "./Cards.tsx";
import {
  AMOUNT_SIZE,
  AMOUNT_SIZE_EXACT,
  DataTable,
  PickCell,
  type Column,
} from "./DataTable.tsx";
import {
  categoryColor,
  categoryLabel,
  fmtNOK,
  fmtNOKExact,
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
    by,
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

const useTxnSort = (txns: Categorized[]) =>
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
  const { sorted, head } = useSort(groups, GROUP_SORTS, "total", [
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
  onMerchant: (merchant: string, meta: boolean) => void;
  onCategory: (category: string, meta: boolean) => void;
  onAccount: (account: string, meta: boolean) => void;
  onItem?: (txn: Categorized, raw: string, action: ItemAction) => void;
  onFile?: (txn: Categorized, file: RuleFile) => void;
  onBulk?: (txns: Categorized[], file: BulkFile) => void;
}

export const TransactionsCard = ({
  txns,
  info,
  all,
  branchRules,
  onMerchant,
  onCategory,
  onAccount,
  onItem,
  onFile,
  onBulk,
}: TransactionsCardProps) => {
  const { sorted: bySort, head, by } = useTxnSort(txns);
  const [groupBy, setGroupBy] = useState("Day");
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
  const [open, setOpen] = useState<Categorized | null>(null);
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

  return (
    <section className="min-w-0">
      <div className="mb-2 flex min-h-8 flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-0.5 text-sm text-muted-foreground tabular-nums">
          {txns.length} {txns.length === 1 ? "transaction" : "transactions"}
          {info}
        </p>
        {onBulk && (
          <BulkToolbar
            picked={picked}
            onBulk={onBulk}
            onClear={() => setSelected(new Set())}
          />
        )}
      </div>
      {sorted.length === 0 ? (
        <Empty>No transactions match the current filters.</Empty>
      ) : (
        <DataTable
          list
          onRow={(i) => setOpen(sorted[i] ?? null)}
          controls={<GroupBySelect value={groupBy} onChange={setGroupBy} />}
          group={
            grouping
              ? {
                  of: (i) => grouping.of(sorted[i]!),
                  label: grouping.label,
                  total: (indices) =>
                    fmtNOKExact(
                      Math.round(
                        indices.reduce((s, i) => s + sorted[i]!.amount, 0) *
                          100,
                      ) / 100,
                    ),
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
                        checked={selected.size === txns.length}
                        onChange={(checked) =>
                          setSelected(checked ? new Set(txns) : new Set())
                        }
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
              sizer: AMOUNT_SIZE_EXACT,
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
                onPick={onMerchant}
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
              onPick={onCategory}
            />,
            accountCell(t, onAccount),
            <span className={cn("font-semibold", t.amount > 0 && "text-good")}>
              {fmtNOKExact(t.amount)}
            </span>,
          ])}
        />
      )}
      {open && (
        <TxnDialog
          txn={open}
          onClose={() => setOpen(null)}
          {...(onItem && {
            onItem: (raw, action) => {
              setOpen(null);
              onItem(open, raw, action);
            },
          })}
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
