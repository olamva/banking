/**
 * The boxes everything sits in: cards, KPI tiles and tables. Presentation only.
 */
import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { merchantOf, subcategoryOf } from "../../core/select.ts";
import {
  subscriptionGroups,
  type SubscriptionGroup,
} from "../../core/stats.ts";
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
import { isPageKey } from "./Shortcuts.tsx";

interface CardProps {
  title: string;
  icon?: IconSvgElement;
  /** A control belonging to this card, parked at the far end of its heading. */
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

/** `goodIfUp` because more income is good and more spending is not. */
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
  /** What the delta is measured against — "last month" for a month, "last year" for a year. */
  vs?: string;
  /** A quiet second line. The per-month average lives here rather than in a tile of its own. */
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
  /** Only when there is something to say — an empty note renders nothing. */
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

/**
 * Holds a `min` column at the width of the widest value it can hold, rather
 * than the widest one on screen. A windowed table renders a screenful, so
 * without this a column resizes as you scroll onto a longer value and takes
 * every other column sideways with it.
 *
 * Rendered rather than written as a `ch` width, because it has to be right in
 * whatever font the page ends up with: the header's own, at the cells' weight,
 * invisible and zero height, so it sets the width and nothing else.
 *
 * A longer value than any of these still fits — no cell wraps. It just starts
 * moving the column again, which for the rare outlier is a better trade than
 * reserving the room for it forever.
 */
const Sizer = ({ of }: { of: string[] }) => (
  <span aria-hidden className="invisible block h-0 font-normal">
    {of.map((s) => (
      <span key={s} className="block">
        {s}
      </span>
    ))}
  </span>
);

/** The widest amount worth holding a money column open for. */
export const AMOUNT_SIZE = [fmtNOK(-100000)];

export interface Column {
  label: string;
  /** Money: right-aligned. */
  num?: boolean;
  /** Values this column must stay wide enough for, whatever is rendered — see `Sizer`. */
  sizer?: string[];
  /**
   * Shrink to the widest cell instead of sharing the slack. `w-px` with
   * `nowrap` is the table-layout way of saying "as narrow as the content
   * allows", which leaves one flexible column to absorb the rest — so filtering
   * the rows cannot shuffle every column sideways.
   */
  min?: boolean;
  /** Set to make the header a sort button. The caller owns the sort; the header owns the arrow. */
  onClick?: () => void;
  /** Which way this column is sorted, or null when it is sortable but not the sorted one. */
  sort?: "asc" | "desc" | null;
}

interface PickCellProps {
  /** What the cell reads as. */
  label: string;
  /** What that stands for — the slug, where the label is not the filter value. */
  value?: string;
  /** A CSS colour for the text, where the cell encodes something by colour. */
  color?: string;
  onPick: (value: string, meta: boolean) => void;
}

/**
 * A cell that is also the filter for its own value, the same gesture as a chart
 * bar: click to show only it, meta-click to hide it.
 *
 * The click stops here: the row around it may open the details dialog, and a
 * click meant to filter to a merchant must not also open the row it sits in.
 */
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
      onPick(value, e.metaKey);
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
  /** Caps the height and pins the header, for the long lists. */
  scroll?: boolean;
  /**
   * Makes the rows clickable, by index into `rows`. `PickCell` stops its own
   * click, so the filter cells keep filtering.
   */
  onRow?: (index: number) => void;
}

/**
 * Past this many rows the table windows itself. Below it the whole thing is
 * cheaper to render than the arithmetic that would avoid rendering it.
 */
const WINDOW_OVER = 80;

/** Rows kept above and below the viewport, so a flick of the wheel lands on rows that exist. */
const OVERSCAN = 12;

/** The scroller's own height, matching `max-h-[460px]` — a starting guess, remeasured on the first scroll. */
const VIEWPORT = 460;

export const DataTable = ({ columns, rows, scroll, onRow }: DataTableProps) => {
  const [win, setWin] = useState({ top: 0, height: VIEWPORT });
  /**
   * Measured rather than assumed: padding and font size are the card's business,
   * and a hardcoded row height here would silently drift the moment either
   * changes. One row is representative because the cells cannot wrap — see the
   * `whitespace-nowrap` below.
   */
  const [rowH, setRowH] = useState(24);
  const probe = useRef<HTMLTableRowElement>(null);
  const box = useRef<HTMLDivElement>(null);

  const windowed = !!scroll && rows.length > WINDOW_OVER;

  useLayoutEffect(() => {
    const h = probe.current?.getBoundingClientRect().height;
    if (h && Math.abs(h - rowH) > 0.5) setRowH(h);

    /**
     * The scroller is what the user is looking at; `win` is only this
     * component's copy of where it is, and the two come apart. A filter that
     * drops the list under `WINDOW_OVER` detaches `onScroll` below, and the
     * browser then clamps its own `scrollTop` to the shorter content with
     * nothing left listening — so widening the filter again would window the
     * rows around a position abandoned several filters ago, and draw a table
     * of blank space that no further scrolling is needed to correct.
     *
     * Read back rather than remembered, then. In a layout effect the value is
     * the browser's own post-clamp one, and both comparisons are equalities,
     * so a correction settles in one extra pass.
     */
    const el = box.current;
    if (el && (el.scrollTop !== win.top || el.clientHeight !== win.height))
      setWin({ top: el.scrollTop, height: el.clientHeight });
  });

  /**
   * Clamped to what the new row set can actually scroll to. Filtering shrinks
   * the list under a scroll position the browser has not corrected yet, and an
   * uncorrected one would slice past the end and render a blank table for a
   * frame.
   */
  const top = Math.min(win.top, Math.max(0, rows.length * rowH - win.height));
  const first = windowed ? Math.max(0, Math.floor(top / rowH) - OVERSCAN) : 0;
  const last = windowed
    ? Math.min(rows.length, Math.ceil((top + win.height) / rowH) + OVERSCAN)
    : rows.length;

  /**
   * The rows that are not rendered still have to take up their space, or the
   * scrollbar would report the height of a dozen rows and the thumb would jump
   * about as you drag it. One empty row at each end does it.
   */
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
        windowed
          ? (e) =>
              setWin({
                top: e.currentTarget.scrollTop,
                height: e.currentTarget.clientHeight,
              })
          : undefined
      }
      className={`mt-2 overflow-x-auto ${scroll ? "max-h-115 overflow-y-auto" : ""}`}
    >
      {/* Tabular figures for the whole table, not just the money column: it is
          what makes every date exactly as wide as every other one, so the date
          column has a width the rows cannot argue with. */}
      <table className="w-full border-collapse text-xs tabular-nums">
        <thead>
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
                className={`border-b border-grid bg-surface py-1 pr-2 font-semibold ${c.num ? "text-right" : "text-left"} ${c.min ? "w-px whitespace-nowrap" : ""} ${scroll ? "sticky top-0" : ""}`}
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
            // Keyed on where the row is in the whole list, not in the slice, or
            // scrolling would reuse the same dozen keys for every row in turn.
            <tr
              key={first + i}
              ref={i === 0 ? probe : undefined}
              onClick={onRow && (() => onRow(first + i))}
              className={`hover:bg-hover ${onRow ? "cursor-pointer" : ""}`}
            >
              {row.map((cell, j) => (
                <td
                  key={j}
                  /* Nothing wraps in a windowed table: one tall row would put
                   every row below it out of place by the difference. */
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

/**
 * Sort state, and the headers that drive it. One hook over any row shape, so
 * every table on the page sorts by the same clicks — each having its own would
 * be several behaviours for one gesture.
 *
 * `ascFirst` names the columns that read A-Z on the first click; everything else
 * starts biggest/newest first. A third click drops the sort and the rows fall
 * back to the order they arrived in.
 */
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

  return {
    sorted: by
      ? [...items].sort((a, b) => (asc ? 1 : -1) * sorts[by](a, b))
      : items,
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
  // On the label, not the slug, so the order matches the column: `Strøm` belongs
  // under S, where it reads, and not under the `stroem` nobody sees. By the main
  // first, so sorting the column groups the colours — the main has no column of
  // its own to sort by any more.
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
  /**
   * Take ⌘F over while mounted, and answer to `/` as well. Windowing hides the
   * unrendered rows from the browser's own find, and this box searches all of
   * them rather than the on-screen ones — the better answer anyway. One box per
   * page may claim it.
   */
  hotkey?: boolean;
}

const SearchBox = ({
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
      // `/` only where it is not a character being typed — in this box, or in a
      // filter menu's own search, it is one. Same test the page's own keys use.
      const slash = e.key === "/" && !modified && isPageKey(e);
      if (!slash && !(e.key === "f" && modified)) return;
      if (e.altKey) return;
      e.preventDefault();
      // `select`, not `focus`: ⌘F on a box that already has a search in it means
      // a new search, so the old one goes as soon as you type.
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
  /**
   * Every row in view, not only the flagged ones — `subscriptionGroups` picks
   * the payees, because the flag belongs to the payee and the bank puts it on
   * an arbitrary subset of that payee's rows.
   */
  txns: Categorized[];
  onMerchant: (merchant: string, meta: boolean) => void;
  onCategory: (category: string, meta: boolean) => void;
}

/**
 * What is subscribed to, not every charge it ever made: eleven Spotify rows are
 * one subscription that took 99 kr eleven times, and reading that off a list of
 * eleven identical lines was the reader doing the summing.
 *
 * The same table as the transactions one underneath — sortable, searchable and
 * windowed by `DataTable` — because a year of these is a list long enough to
 * need all three.
 */
export const SubscriptionsCard = ({
  txns,
  onMerchant,
  onCategory,
}: SubscriptionsCardProps) => {
  const [search, setSearch] = useState("");
  const groups = useMemo(() => subscriptionGroups(txns), [txns]);
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

  // Nothing recurring in this period is no card at all, rather than an empty box.
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
          /* Only the name is flexible, so sorting and searching cannot slide
             the other columns about — the same rule as the full table. */
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
}

/** A quiet outlined word — what a row *is*, where a Yes/No line said it duller. */
const Chip = ({ children }: { children: ReactNode }) => (
  <span className="rounded-full border border-line px-2 py-0.5 text-[11px] text-ink-soft">
    {children}
  </span>
);

/**
 * What the heading, the chips and the bank row already say. Repeating it in the
 * list below is the same fact twice, and that list of nineteen was most of why
 * the dialog read as a dump — what is left is the part they cannot carry.
 * `reason` is not here: the chip says a row is out, the field says why.
 *
 * `bankConfidence` is simply dropped. Nothing gates on it, 7 802 of 8 547 rows
 * are at 100, and a line saying so on almost every row is a line nobody reads.
 */
const SHOWN_ABOVE = [
  "date",
  "amount",
  "counterparty",
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

/** One field of the detail list. Its own rule under it, the last one bare. */
const ROW =
  "flex items-baseline justify-between gap-4 border-b border-line py-1.5 last:border-0";

/**
 * One row, with everything on it. A native `<dialog>` opened modally, so Esc,
 * the backdrop, the scroll lock and keeping focus inside are the browser's job
 * and not ours — the fields are read off the row by `txnFields`, so this stays a
 * layout and nothing else.
 *
 * The heading is the row as the table reads it — merchant, its category in that
 * category's own hue, account, date, and the amount at the size of the one
 * number the dialog is about. It stays put while the rest scrolls under it.
 */
const TxnDialog = ({ txn, onClose }: TxnDialogProps) => {
  const bank = bankLabel(txn);

  return (
    <dialog
      ref={(el) => {
        el?.showModal();
      }}
      onClose={onClose}
      /* The padding is on the inner div so that a click landing on it is a
         click on the card, not on the dialog box — only the backdrop closes. */
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="m-auto max-h-[80vh] w-[min(560px,92vw)] overflow-y-auto rounded-xl border border-line bg-surface p-0 text-ink shadow-2xl backdrop:bg-black/50"
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
        {(txn.excluded || txn.isSubscription || txn.isRecurring) && (
          <div className="mb-3 flex flex-wrap gap-1.5">
            {txn.excluded && <Chip>Excluded</Chip>}
            {txn.isSubscription && <Chip>Subscription</Chip>}
            {txn.isRecurring && <Chip>Recurring</Chip>}
          </div>
        )}
        {/* A line per field rather than a grid, so each can have a rule under
            it — the flat block of nineteen was one paragraph shaped like a
            table. */}
        <dl className="text-xs">
          {bank && (
            <div className={ROW}>
              <dt className="shrink-0 text-ink-soft">Bank category</dt>
              <dd className="min-w-0 text-right">
                <div className="text-sm wrap-break-word">{bank[0]}</div>
                {/* The slug in the shape a rule is written in, monospaced
                    because that is what it is — five fields said this, and four
                    of them were saying it twice. */}
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
    </dialog>
  );
};

interface TransactionsCardProps {
  txns: Categorized[];
  /** The search box sits on the table it filters, rather than off in the filter bar. */
  search: string;
  onSearch: (search: string) => void;
  /** The merchant, category and account cells filter to themselves; see `PickCell`. */
  onMerchant: (merchant: string, meta: boolean) => void;
  /** Takes a bare category or a `category/sub` pair — one list holds both levels. */
  onCategory: (category: string, meta: boolean) => void;
  onAccount: (account: string, meta: boolean) => void;
}

/**
 * Every row in view, newest first. It has a view of its own now — the dashboards
 * are the charts, this is the rows behind them.
 *
 * Long lists are windowed by `DataTable` itself, so the row count no longer
 * decides what a render costs. The search box still defers its filtering (see
 * `TransactionsView`), which is what keeps the totals above the table off the
 * typing path.
 *
 * Windowing hides the unrendered rows from the browser's own find, so ⌘F is
 * taken over here and pointed at the box instead — which searches all the rows
 * rather than the on-screen ones, and is the better answer anyway. Only while
 * this card is mounted: on the dashboards ⌘F is the browser's again.
 */
export const TransactionsCard = ({
  txns,
  search,
  onSearch,
  onMerchant,
  onCategory,
  onAccount,
}: TransactionsCardProps) => {
  const { sorted, head } = useTxnSort(txns);
  const [open, setOpen] = useState<Categorized | null>(null);
  /**
   * Every subcategory the table can show, not the ones a screenful happens to
   * hold. Over `txns` rather than over every subcategory there is, so a filtered
   * table does not hold room open for one it can no longer show.
   */
  const subcategorySizes = useMemo(
    () => [
      ...new Set(txns.map((t) => rowLabel(t.category, t.subcategory))),
    ],
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
          /* Everything but the merchant is content-width, so the one column
             whose text actually varies is the one that absorbs the slack —
             filtering the rows no longer slides the others sideways. */
          columns={[
            head("Date", "date", { min: true }),
            head("Merchant / description", "merchant"),
            /* "Category", not "Subcategory": the column is the one category
               column now, and which level its text is at is not a distinction
               the header has to make — the colour carries the main. */
            head("Category", "subcategory", {
              min: true,
              sizer: subcategorySizes,
            }),
            head("Account", "account", { min: true }),
            head("Amount", "amount", {
              num: true,
              min: true,
              sizer: AMOUNT_SIZE,
            }),
          ]}
          rows={sorted.map((t) => [
            /* The whole row opens the details; the date is the same thing as a
               button, so a keyboard reaches it too. */
            <button
              type="button"
              onClick={() => setOpen(t)}
              className="text-left hover:underline"
            >
              {t.date}
            </button>,
            <PickCell label={merchantOf(t)} onPick={onMerchant} />,
            /* The main category is the colour, not a column of its own: the
               name repeated on every row said less than a hue does, and
               `Filters.categories` holds both levels, so the pair filters on
               the same axis the bare category used to. */
            <PickCell
              label={rowLabel(t.category, t.subcategory)}
              value={subcategoryOf(t)}
              color={categoryColor(t.category)}
              onPick={onCategory}
            />,
            <PickCell label={t.account} onPick={onAccount} />,
            fmtNOK(t.amount),
          ])}
        />
      )}
      {open && <TxnDialog txn={open} onClose={() => setOpen(null)} />}
    </Card>
  );
};
