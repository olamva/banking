import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { fmtNOK, fmtNOKExact, fmtPct } from "./format.ts";
import {
  DownIcon,
  ExpandIcon,
  FlatIcon,
  Icon,
  LoadingIcon,
  SortAscIcon,
  SortDescIcon,
  SortableIcon,
  UpIcon,
  type IconSvgElement,
} from "./icons.ts";

export const BUTTON =
  "shrink-0 rounded-md border border-line bg-surface px-2.5 py-1.5 text-xs text-ink-soft disabled:opacity-60";

// The picked half of a segmented control, and the rest of it.
export const PILL = (on: boolean): string =>
  on ? "bg-series-1 text-white" : "bg-page text-ink-soft";

export const Empty = ({ children }: { children: ReactNode }) => (
  <div className="py-10 text-center text-ink-muted">{children}</div>
);

interface NoteProps {
  icon: IconSvgElement;
  className?: string;
  children: ReactNode;
}

export const Note = ({ icon, className = "", children }: NoteProps) => (
  <p
    className={`flex items-start gap-1.5 text-[11px] text-ink-muted ${className}`}
  >
    <Icon icon={icon} size={12} className="mt-px shrink-0" />
    <span>{children}</span>
  </p>
);

// Points right when shut and down when open.
export const Caret = ({ open }: { open: boolean }) => (
  <Icon
    icon={ExpandIcon}
    size={12}
    className={`transition-transform ${open ? "rotate-90" : ""}`}
  />
);

export const Loading = () => (
  <div className="flex items-center justify-center gap-2 py-10 text-ink-muted">
    <Icon icon={LoadingIcon} size={16} className="animate-spin" />
    Loading…
  </div>
);

interface CardProps {
  title: string;
  icon?: IconSvgElement;
  action?: ReactNode;
  children: ReactNode;
}

export const Card = ({ title, icon, action, children }: CardProps) => (
  <section className="flex min-w-0 flex-col">
    <h2 className="mb-2.5 flex items-center gap-1.5 text-sm font-semibold">
      {icon && (
        <Icon icon={icon} size={15} className="shrink-0 text-ink-soft" />
      )}
      {title}
      {action && <span className="ml-auto font-normal">{action}</span>}
    </h2>
    {children}
  </section>
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
  <div className="rounded-[10px] border border-line px-4 py-3.5">
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
          aria-hidden={false}
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
  <div className="rounded-[10px] border border-line px-4 py-3.5">
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
  header?: ReactNode;
  num?: boolean;
  sizer?: string[];
  min?: boolean;
  onClick?: () => void;
  sort?: "asc" | "desc" | null;
}

export const highlighting = (e: { detail: number }) =>
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
  rowClassName?: (index: number) => string;
}

const WINDOW_OVER = 80;

const OVERSCAN = 12;

const VIEWPORT = 460;

export const DataTable = ({
  columns,
  rows,
  scroll,
  onRow,
  rowClassName,
}: DataTableProps) => {
  const [scrollTop, setScrollTop] = useState(0);
  const [rowH, setRowH] = useState(24);
  const probe = useRef<HTMLTableRowElement>(null);
  const box = useRef<HTMLDivElement>(null);

  const windowed = !!scroll && rows.length > WINDOW_OVER;

  useLayoutEffect(() => {
    const h = probe.current?.getBoundingClientRect().height;
    if (h && Math.abs(h - rowH) > 0.5) setRowH(h);
    // The box owns the scroll position, not this state. A filter that changes
    // the row count moves the box without a scroll event, so read it back.
    const t = box.current?.scrollTop ?? 0;
    if (t !== scrollTop) setScrollTop(t);
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
          className={scroll ? "sticky top-0 z-10 bg-page" : ""}
          style={
            scroll
              ? { boxShadow: "0 -32px 0 32px var(--color-page)" }
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
                className={`border-b border-grid bg-page py-1 pr-2 font-semibold ${c.num ? "text-right" : "text-left"} ${c.min ? "w-px whitespace-nowrap" : ""}`}
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
                  (c.header ?? c.label)
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
              className={`hover:bg-hover ${onRow ? "cursor-pointer" : ""} ${rowClassName?.(first + i) ?? ""}`}
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
