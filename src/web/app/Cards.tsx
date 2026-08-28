import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { merchantOf, subcategoryOf } from "../../core/select.ts";
import { type SubscriptionGroup } from "../../core/stats.ts";
import type { Categorized } from "../../core/types.ts";
import {
  ID_FIELD,
  bankLabel,
  categoryColor,
  categoryLabel,
  fmtDate,
  fmtNOK,
  fmtNOKExact,
  fmtPct,
  rowLabel,
  txnFields,
} from "./format.ts";
import {
  CategoryIcon,
  CloseIcon,
  DownIcon,
  FlatIcon,
  Icon,
  RecurringIcon,
  SearchIcon,
  SortAscIcon,
  SortDescIcon,
  SortableIcon,
  TransactionsIcon,
  UpIcon,
  type IconSvgElement,
} from "./icons.ts";
import { Modal } from "./Modal.tsx";
import { isPageKey } from "./Shortcuts.tsx";

interface CardProps {
  title: string;
  icon?: IconSvgElement;
  action?: ReactNode;
  children: ReactNode;
}

export const Card = ({ title, icon, action, children }: CardProps) => (
  <div className="min-w-0 rounded-[10px] border border-line bg-surface p-4">
    <h2 className="mb-2.5 flex items-center gap-1.5 text-sm font-semibold">
      {icon && (
        <Icon
          aria-hidden
          icon={icon}
          size={15}
          className="shrink-0 text-ink-soft"
        />
      )}
      {title}
      {action && <span className="ml-auto font-normal">{action}</span>}
    </h2>
    {children}
  </div>
);

export interface Delta {
  raw: number;
  pct: number;
  good: boolean;
}

export const deltaInfo = (
  current: number,
  previous: number,
  goodIfUp: boolean,
): Delta => {
  const raw = Math.round((current - previous) * 100) / 100;
  const pct = previous !== 0 ? raw / Math.abs(previous) : raw === 0 ? 0 : 1;
  return { raw, pct, good: raw === 0 ? true : goodIfUp === raw > 0 };
};

interface StatTileProps {
  label: string;
  value: string;
  delta?: Delta;
  vs?: string;
  sub?: string;
}

export const StatTile = ({ label, value, delta, vs, sub }: StatTileProps) => (
  <div className="rounded-[10px] border border-line bg-surface px-4 py-3.5">
    <div className="text-xs text-ink-soft">{label}</div>
    {/* Smaller on a phone, where two tiles share a 375px row: `123 456 kr` at
        26px is wider than the 128px a tile has left inside its own padding, and
        a six-figure total is the ordinary case here rather than the outlier. */}
    <div className="mt-1 text-[22px] font-semibold sm:text-[26px]">{value}</div>
    {sub && <div className="mt-1 text-xs text-ink-muted">{sub}</div>}
    {delta && (
      <div
        className={`mt-1 flex items-center gap-1 text-xs ${Math.abs(delta.pct) < 0.005 ? "text-ink-muted" : delta.good ? "text-good" : "text-critical"}`}
      >
        {/* Labelled, not decorative: direction is otherwise only in the colour. */}
        <Icon
          role="img"
          aria-label={
            delta.raw > 0 ? "up" : delta.raw < 0 ? "down" : "unchanged"
          }
          icon={delta.raw > 0 ? UpIcon : delta.raw < 0 ? DownIcon : FlatIcon}
          size={14}
          className="shrink-0"
        />
        {fmtNOK(Math.abs(delta.raw))} vs {vs}
      </div>
    )}
  </div>
);

interface MeterTileProps {
  label: string;
  share: number;
  note?: string;
}

export const MeterTile = ({ label, share, note }: MeterTileProps) => (
  <div className="rounded-[10px] border border-line bg-surface px-4 py-3.5">
    <div className="text-xs text-ink-soft">{label}</div>
    <div className="mt-1 text-[22px] font-semibold sm:text-[26px]">
      {fmtPct(share)}
    </div>
    <div className="mt-2 h-2.5 overflow-hidden rounded-md bg-series-1-track">
      <div
        className="h-full rounded-md bg-series-1"
        style={{ width: `${Math.min(share * 100, 100)}%` }}
      />
    </div>
    {note && <div className="mt-1.5 text-[11px] text-ink-muted">{note}</div>}
  </div>
);

const Sizer = ({ of }: { of: string[] }) => (
  <span aria-hidden className="invisible block h-0 font-normal">
    {of.map((s) => (
      <span key={s} className="block">
        {s}
      </span>
    ))}
  </span>
);

export const AMOUNT_SIZE = [fmtNOK(-100000)];
export const AMOUNT_SIZE_EXACT = [fmtNOKExact(-100000.5)];

export interface Column {
  label: string;
  num?: boolean;
  sizer?: string[];
  min?: boolean;
  onClick?: () => void;
  sort?: "asc" | "desc" | null;
}

const highlighting = (e: { detail: number }) =>
  e.detail > 0 && !(window.getSelection()?.isCollapsed ?? true);

interface PickCellProps {
  label: string;
  value?: string;
  color?: string;
  onPick: (value: string, meta: boolean) => void;
}

export const PickCell = ({
  label,
  value = label,
  color,
  onPick,
}: PickCellProps) => (
  <button
    type="button"
    onClick={(e) => {
      e.stopPropagation();
      if (!highlighting(e)) onPick(value, e.metaKey);
    }}
    style={color ? { color } : undefined}
    className="text-left hover:underline"
  >
    {label}
  </button>
);

interface DataTableProps {
  columns: Column[];
  rows: ReactNode[][];
  scroll?: boolean;
  onRow?: (index: number) => void;
}

const WINDOW_OVER = 80;

const OVERSCAN = 12;

const VIEWPORT = 460;

export const DataTable = ({ columns, rows, scroll, onRow }: DataTableProps) => {
  const [scrollTop, setScrollTop] = useState(0);
  const [rowH, setRowH] = useState(24);
  const probe = useRef<HTMLTableRowElement>(null);
  const box = useRef<HTMLDivElement>(null);

  const windowed = !!scroll && rows.length > WINDOW_OVER;

  useLayoutEffect(() => {
    const h = probe.current?.getBoundingClientRect().height;
    if (h && Math.abs(h - rowH) > 0.5) setRowH(h);
  });

  const top = Math.min(scrollTop, Math.max(0, rows.length * rowH - VIEWPORT));
  const first = windowed ? Math.max(0, Math.floor(top / rowH) - OVERSCAN) : 0;
  const last = windowed
    ? Math.min(rows.length, Math.ceil((top + VIEWPORT) / rowH) + OVERSCAN)
    : rows.length;

  const spacer = (h: number) =>
    h > 0 ? (
      <tr aria-hidden style={{ height: h }}>
        <td colSpan={columns.length} className="p-0" />
      </tr>
    ) : null;

  return (
    <div
      ref={box}
      onScroll={
        windowed ? (e) => setScrollTop(e.currentTarget.scrollTop) : undefined
      }
      className={`mt-2 overflow-x-auto ${scroll ? "max-h-115 overflow-y-auto" : ""}`}
    >
      {/* Tabular figures for the whole table, not just the money column: it is
          what makes every date exactly as wide as every other one, so the date
          column has a width the rows cannot argue with.

          The borders stay separate. A collapsed border belongs to the table,
          so a sticky header cell paints no bottom edge of its own, and the
          rows then show through that strip. */}
      <table className="w-full border-separate border-spacing-0 text-xs tabular-nums">
        <thead
          className={scroll ? "sticky top-0 z-10 bg-surface" : ""}
          style={
            scroll
              ? { boxShadow: "0 -32px 0 32px var(--color-surface)" }
              : undefined
          }
        >
          <tr>
            {columns.map((c) => (
              <th
                key={c.label}
                aria-sort={
                  c.sort
                    ? c.sort === "asc"
                      ? "ascending"
                      : "descending"
                    : undefined
                }
                className={`border-b border-grid bg-surface py-1 pr-2 font-semibold ${c.num ? "text-right" : "text-left"} ${c.min ? "w-px whitespace-nowrap" : ""}`}
              >
                {c.sizer && <Sizer of={c.sizer} />}
                {c.onClick ? (
                  <button
                    type="button"
                    onClick={c.onClick}
                    className="inline-flex items-center gap-1 font-semibold text-ink-soft hover:text-ink"
                  >
                    {c.label}
                    {/* Always shown, so a sortable column looks sortable before anyone hovers it.
                      Decorative — `aria-sort` on the `th` above says the same thing. */}
                    <Icon
                      aria-hidden
                      icon={
                        c.sort === "asc"
                          ? SortAscIcon
                          : c.sort === "desc"
                            ? SortDescIcon
                            : SortableIcon
                      }
                      size={13}
                      className={`shrink-0 ${c.sort ? "" : "text-ink-muted opacity-50"}`}
                    />
                  </button>
                ) : (
                  c.label
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {spacer(first * rowH)}
          {rows.slice(first, last).map((row, i) => (
            // Key on the position in the whole list, not in the slice. A slice key
            // repeats for each row as the user scrolls.
            <tr
              key={first + i}
              ref={i === 0 ? probe : undefined}
              onClick={onRow && ((e) => !highlighting(e) && onRow(first + i))}
              className={`hover:bg-hover ${onRow ? "cursor-pointer" : ""}`}
            >
              {row.map((cell, j) => (
                // No cell wraps in a windowed table. One tall row moves every row below it
                // out of position.
                <td
                  key={j}
                  className={`border-b border-grid py-1 pr-2 ${columns[j]?.num ? "text-right" : "text-left"} ${columns[j]?.min ? "w-px whitespace-nowrap" : ""} ${windowed ? "whitespace-nowrap" : ""}`}
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
          {spacer((rows.length - last) * rowH)}
        </tbody>
      </table>
    </div>
  );
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

interface SearchBoxProps {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  hotkey?: boolean;
}

export const SearchBox = ({
  value,
  onChange,
  placeholder,
  hotkey,
}: SearchBoxProps) => {
  const box = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!hotkey) return;
    const find = (e: KeyboardEvent) => {
      const modified = e.metaKey || e.ctrlKey;
      const slash = e.key === "/" && !modified && isPageKey(e);
      if (!slash && !(e.key === "f" && modified)) return;
      if (e.altKey) return;
      e.preventDefault();
      box.current?.select();
    };
    document.addEventListener("keydown", find);
    return () => document.removeEventListener("keydown", find);
  }, [hotkey]);

  return (
    <div className="relative">
      <Icon
        aria-hidden
        icon={SearchIcon}
        size={17}
        className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-ink-muted"
      />
      <input
        ref={box}
        type="search"
        className={`w-full rounded-md border border-line bg-page py-2.5 pl-10 text-sm text-ink ${hotkey ? "pr-14" : "pr-3"}`}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={placeholder}
      />
      {/* A shortcut that took over a browser one has to say so somewhere. `/`
          is in the shortcuts dialog; only the one that overrides the browser
          needs saying on the box itself. */}
      {hotkey && (
        <kbd className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 rounded border border-line px-1.5 py-0.5 text-[11px] text-ink-muted">
          ⌘F
        </kbd>
      )}
    </div>
  );
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
        <div className="py-10 text-center text-ink-muted">
          No subscriptions match the search.
        </div>
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
  onFile?: () => void;
}

const Chip = ({ children }: { children: ReactNode }) => (
  <span className="rounded-full border border-line px-2 py-0.5 text-[11px] text-ink-soft">
    {children}
  </span>
);

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
  "bankCategory",
  "bankSub",
  "bankCategoryName",
  "bankSubName",
  "bankConfidence",
];

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
            <span aria-hidden className="text-ink-muted">
              ·
            </span>
            <span>{txn.account}</span>
            <span aria-hidden className="text-ink-muted">
              ·
            </span>
            <span>{fmtDate(txn.date)}</span>
          </div>
        </div>
        {/* Income is the colour, spending is not: everything here is money out,
          and a page of red says nothing the sign does not. */}
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
          <Icon aria-hidden icon={CloseIcon} size={16} />
        </button>
      </div>
      <div className="px-5 py-4">
        {/* The one control here that changes the data rather than reading it.
            Above the fields, because a dialog this long scrolls. */}
        {onFile && (
          <button
            type="button"
            onClick={onFile}
            className="mb-3 flex items-center gap-1.5 rounded-md border border-line bg-page px-2.5 py-1.5 text-xs text-ink-soft"
          >
            <Icon aria-hidden icon={CategoryIcon} size={14} />
            File this merchant…
          </button>
        )}
        {(txn.excluded ||
          txn.isSubscription ||
          txn.isRecurring ||
          txn.country) && (
          <div className="mb-3 flex flex-wrap gap-1.5">
            {/* First, because it is the one chip that says something about the
                row rather than about how it is treated. */}
            {txn.country && <Chip>{txn.country}</Chip>}
            {txn.excluded && <Chip>Excluded</Chip>}
            {txn.isSubscription && <Chip>Subscription</Chip>}
            {txn.isRecurring && <Chip>Recurring</Chip>}
          </div>
        )}
        {/* A line per field rather than a grid, so each can have a rule under
            it: nineteen without is one paragraph shaped like a table. */}
        <dl className="text-xs">
          {bank && (
            <div className={ROW}>
              <dt className="shrink-0 text-ink-soft">Bank category</dt>
              <dd className="min-w-0 text-right">
                <div className="text-sm wrap-break-word">{bank[0]}</div>
                {/* The slug in the shape a rule is written in, monospaced
                    because that is what it is. */}
                <div className="font-mono text-[11px] break-all text-ink-muted">
                  {bank[1]}
                </div>
              </dd>
            </div>
          )}
          {txnFields(txn, SHOWN_ABOVE).map(([name, value]) => (
            <div key={name} className={ROW}>
              <dt className="shrink-0 text-ink-soft">{name}</dt>
              {/* Cut in CSS rather than in the string, so the whole id is
                  still there to select and copy — `min-w-0` because a flex item
                  will not shrink below its content without it. */}
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
  onFile?: (txn: Categorized) => void;
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
    <Card title={`Transactions (${txns.length})`} icon={TransactionsIcon}>
      <SearchBox
        hotkey
        value={search}
        onChange={onSearch}
        placeholder="Search merchant or description…"
      />
      {sorted.length === 0 ? (
        <div className="py-10 text-center text-ink-muted">
          No transactions match the current filters.
        </div>
      ) : (
        <DataTable
          scroll
          onRow={(i) => setOpen(sorted[i] ?? null)}
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
            onFile: () => {
              const t = open;
              setOpen(null);
              onFile(t);
            },
          })}
        />
      )}
    </Card>
  );
};
