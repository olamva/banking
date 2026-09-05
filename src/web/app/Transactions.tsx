import { useMemo, useState, type ReactNode } from "react";
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
  ID_FIELD,
  bankLabel,
  categoryColor,
  categoryLabel,
  fmtDate,
  fmtNOK,
  fmtNOKExact,
  rowLabel,
  txnFields,
} from "./format.ts";
import {
  CategoryIcon,
  CloseIcon,
  EditIcon,
  Icon,
  RecurringIcon,
  TransactionsIcon,
} from "./icons.ts";
import { Modal } from "./Modal.tsx";
import { SearchBox } from "./SearchBox.tsx";

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

interface TxnDialogProps {
  txn: Categorized;
  onClose: () => void;
  onFile?: (file: RuleFile) => void;
}

const TXN_RULE_ACTIONS: [RuleFile, string][] = [
  ["categories", "Recategorize…"],
  ["payees", "Rename payee…"],
  ["family", "Mark as family…"],
];

const Chip = ({
  children,
  onClick,
  dashed,
}: {
  children: ReactNode;
  onClick?: () => void;
  dashed?: boolean;
}) => {
  const Element = onClick ? "button" : "span";
  return (
    <Element
      type={onClick ? "button" : undefined}
      onClick={onClick}
      className={`inline-flex items-center gap-1 flex-row rounded-full border px-2 py-0.5 text-[11px] text-ink-soft ${dashed ? "border-dashed border-ink-muted" : "border-line"} ${onClick ? "hover:bg-hover hover:text-ink" : ""}`}
    >
      {children}
    </Element>
  );
};

const SHOWN_ABOVE = [
  "date",
  "amount",
  "counterparty",
  "country",
  "account",
  "category",
  "subcategory",
  "excluded",
  "isSubscription",
  "isRecurring",
  "isPending",
  "bankCategory",
  "bankSub",
  "bankCategoryName",
  "bankSubName",
  "bankConfidence",
];

const DOT = (
  <span aria-hidden className="text-ink-muted">
    ·
  </span>
);

const ROW =
  "flex items-baseline justify-between gap-4 border-b border-line py-1.5 last:border-0";

export const TxnDialog = ({ txn, onClose, onFile }: TxnDialogProps) => {
  const bank = bankLabel(txn);

  return (
    <Modal
      onClose={onClose}
      className="max-h-[80vh] w-[min(560px,92vw)] overflow-y-auto"
    >
      <div className="sticky top-0 z-10 flex items-start gap-3 border-b border-line bg-surface px-5 py-4">
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-base font-semibold">
            {merchantOf(txn)}
          </h2>
          <div className="mt-1 flex flex-wrap items-center gap-x-1.5 text-xs text-ink-soft">
            <span
              className="font-medium"
              style={{ color: categoryColor(txn.category) }}
            >
              {rowLabel(txn.category, txn.subcategory)}
            </span>
            {DOT}
            <span>{txn.account}</span>
            {DOT}
            <span>{fmtDate(txn.date)}</span>
          </div>
        </div>
        <div
          className={`text-xl font-semibold tabular-nums whitespace-nowrap ${txn.amount > 0 ? "text-good" : ""}`}
        >
          {fmtNOKExact(txn.amount)}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="-m-1 shrink-0 rounded p-1 text-ink-muted hover:bg-hover hover:text-ink"
        >
          <Icon icon={CloseIcon} size={16} />
        </button>
      </div>
      <div className="px-5 py-4">
        {onFile && (
          <div className="mb-3 flex flex-wrap gap-1.5">
            {[
              ...TXN_RULE_ACTIONS,
              txn.isSubscription
                ? (["not-subscriptions", "Not a subscription…"] as const)
                : (["subscriptions", "Mark as subscription…"] as const),
            ].map(([file, label]) => (
              <button
                key={file}
                type="button"
                onClick={() => onFile(file)}
                className="flex items-center gap-1.5 rounded-md border border-line bg-page px-2.5 py-1.5 text-xs text-ink-soft"
              >
                <Icon icon={CategoryIcon} size={14} />
                {label}
              </button>
            ))}
          </div>
        )}
        {(txn.excluded ||
          txn.isSubscription ||
          txn.isRecurring ||
          txn.isPending ||
          txn.country) && (
          <div className="mb-3 flex flex-wrap gap-1.5">
            {txn.country && (
              <Chip onClick={onFile ? () => onFile("countries") : undefined}>
                {txn.country}
                {onFile && <Icon icon={EditIcon} size={11} />}
              </Chip>
            )}
            {txn.excluded && <Chip>Excluded</Chip>}
            {txn.isSubscription && <Chip>Subscription</Chip>}
            {txn.isRecurring && <Chip>Recurring</Chip>}
            {txn.isPending && <Chip dashed>Pending</Chip>}
          </div>
        )}
        <dl className="text-xs">
          {bank && (
            <div className={ROW}>
              <dt className="shrink-0 text-ink-soft">Bank category</dt>
              <dd className="min-w-0 text-right">
                <div className="text-sm wrap-break-word">{bank[0]}</div>
                <div className="font-mono text-[11px] break-all text-ink-muted">
                  {bank[1]}
                </div>
              </dd>
            </div>
          )}
          {txnFields(txn, SHOWN_ABOVE).map(([name, value]) => (
            <div key={name} className={ROW}>
              <dt className="shrink-0 text-ink-soft">{name}</dt>
              <dd
                className={`min-w-0 text-right ${name === ID_FIELD ? "truncate" : "wrap-break-word"}`}
                title={name === ID_FIELD ? value : undefined}
              >
                {value}
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </Modal>
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
}

export const TransactionsCard = ({
  txns,
  search,
  onSearch,
  onMerchant,
  onCategory,
  onAccount,
  onFile,
}: TransactionsCardProps) => {
  const { sorted, head } = useTxnSort(txns);
  const [open, setOpen] = useState<Categorized | null>(null);
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
            sorted[i]?.isPending
              ? "outline-1 -outline-offset-1 outline-dashed outline-line"
              : ""
          }
          columns={[
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
            <button
              type="button"
              onClick={(e) => !highlighting(e) && setOpen(t)}
              className="text-left hover:underline"
            >
              {t.date}
            </button>,
            <PickCell label={merchantOf(t)} onPick={onMerchant} />,
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
            onFile: (file) => onFile(open, file),
          })}
        />
      )}
    </section>
  );
};
