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
import { merchantOf } from "../../core/select.ts";
import type { Categorized } from "../../core/types.ts";
import { categoryLabel, fmtNOK, fmtPct } from "./format.ts";
import {
  DownIcon,
  FlatIcon,
  Icon,
  SearchIcon,
  SortAscIcon,
  SortDescIcon,
  SortableIcon,
  TransactionsIcon,
  UpIcon,
  type IconSvgElement,
} from "./icons.ts";

interface CardProps {
  title: string;
  icon?: IconSvgElement;
  children: ReactNode;
}

export const Card = ({ title, icon, children }: CardProps) => (
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
    <div className="mt-1 text-[26px] font-semibold">{value}</div>
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
    <div className="mt-1 text-[26px] font-semibold">{fmtPct(share)}</div>
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
  onPick: (value: string, meta: boolean) => void;
}

/**
 * A cell that is also the filter for its own value, the same gesture as a chart
 * bar: click to show only it, meta-click to hide it.
 */
export const PickCell = ({ label, value = label, onPick }: PickCellProps) => (
  <button
    type="button"
    onClick={(e) => onPick(value, e.metaKey)}
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

export const DataTable = ({ columns, rows, scroll }: DataTableProps) => {
  const [win, setWin] = useState({ top: 0, height: VIEWPORT });
  /**
   * Measured rather than assumed: padding and font size are the card's business,
   * and a hardcoded row height here would silently drift the moment either
   * changes. One row is representative because the cells cannot wrap — see the
   * `whitespace-nowrap` below.
   */
  const [rowH, setRowH] = useState(24);
  const probe = useRef<HTMLTableRowElement>(null);

  const windowed = !!scroll && rows.length > WINDOW_OVER;

  useLayoutEffect(() => {
    const h = probe.current?.getBoundingClientRect().height;
    if (h && Math.abs(h - rowH) > 0.5) setRowH(h);
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
              className="hover:bg-hover"
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

const SORTS = {
  date: (a: Categorized, b: Categorized) => a.date.localeCompare(b.date),
  merchant: (a: Categorized, b: Categorized) =>
    merchantOf(a).localeCompare(merchantOf(b)),
  // On the label, not the slug, so the order matches the column: `Strøm` belongs
  // under S, where it reads, and not under the `stroem` nobody sees.
  category: (a: Categorized, b: Categorized) =>
    categoryLabel(a.category).localeCompare(categoryLabel(b.category)),
  amount: (a: Categorized, b: Categorized) => a.amount - b.amount,
};

type SortKey = keyof typeof SORTS;

/**
 * Sort state, and the headers that drive it. Shared, so the subscriptions list
 * sorts by the same rules and the same clicks as the full table — one of them
 * having its own would be two behaviours for one gesture.
 *
 * Names A-Z on first click, everything else biggest/newest first. A third click
 * drops the sort and the rows fall back to the order they arrived in.
 */
export const useTxnSort = (txns: Categorized[]) => {
  const [by, setBy] = useState<SortKey | null>("date");
  const [asc, setAsc] = useState(false);

  const firstAsc = (key: SortKey) => key === "merchant" || key === "category";

  return {
    sorted: by
      ? [...txns].sort((a, b) => (asc ? 1 : -1) * SORTS[by](a, b))
      : txns,
    head: (label: string, key: SortKey, extra?: Partial<Column>): Column => ({
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

interface TransactionsCardProps {
  txns: Categorized[];
  /** The search box sits on the table it filters, rather than off in the filter bar. */
  search: string;
  onSearch: (search: string) => void;
  /** The merchant and category cells filter to themselves; see `PickCell`. */
  onMerchant: (merchant: string, meta: boolean) => void;
  onCategory: (category: string, meta: boolean) => void;
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
}: TransactionsCardProps) => {
  const { sorted, head } = useTxnSort(txns);
  const box = useRef<HTMLInputElement>(null);
  /**
   * Every category the table can show, not the ones a screenful happens to
   * hold. Over `txns` rather than over every category there is, so a filtered
   * table does not hold room open for a category it can no longer show.
   */
  const categorySizes = useMemo(
    () => [...new Set(txns.map((t) => categoryLabel(t.category)))],
    [txns],
  );

  useEffect(() => {
    const find = (e: KeyboardEvent) => {
      if (e.key !== "f" || !(e.metaKey || e.ctrlKey) || e.altKey) return;
      e.preventDefault();
      // `select`, not `focus`: ⌘F on a box that already has a search in it means
      // a new search, so the old one goes as soon as you type.
      box.current?.select();
    };
    document.addEventListener("keydown", find);
    return () => document.removeEventListener("keydown", find);
  }, []);

  return (
    <Card title={`Transactions (${txns.length})`} icon={TransactionsIcon}>
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
          className="w-full rounded-md border border-line bg-page py-2.5 pr-14 pl-10 text-sm text-ink"
          placeholder="Search merchant or description…"
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          aria-label="Search merchant or description"
        />
        {/* A shortcut that took over a browser one has to say so somewhere. */}
        <kbd className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 rounded border border-line px-1.5 py-0.5 text-[11px] text-ink-muted">
          ⌘F
        </kbd>
      </div>
      {sorted.length === 0 ? (
        <div className="py-10 text-center text-ink-muted">
          No transactions match the current filters.
        </div>
      ) : (
        <DataTable
          scroll
          /* Everything but the merchant is content-width, so the one column
             whose text actually varies is the one that absorbs the slack —
             filtering the rows no longer slides the others sideways. */
          columns={[
            head("Date", "date", { min: true }),
            head("Merchant / description", "merchant"),
            head("Category", "category", { min: true, sizer: categorySizes }),
            { label: "Source", min: true },
            head("Amount", "amount", {
              num: true,
              min: true,
              sizer: AMOUNT_SIZE,
            }),
          ]}
          rows={sorted.map((t) => [
            t.date,
            <PickCell label={merchantOf(t)} onPick={onMerchant} />,
            <PickCell
              label={categoryLabel(t.category)}
              value={t.category}
              onPick={onCategory}
            />,
            t.source === "card" ? "card" : "bank",
            fmtNOK(t.amount),
          ])}
        />
      )}
    </Card>
  );
};
