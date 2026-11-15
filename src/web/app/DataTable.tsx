import {
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { fmtNOK, fmtNOKExact } from "./format.ts";
import { Icon, SortAscIcon, SortDescIcon, SortableIcon } from "./icons.ts";
import { cn } from "./ui/utils.ts";

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
  className?: string;
  phone?: "lead" | "title" | "end" | "meta" | "labeled";
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
    className="text-left underline-offset-2 hover:underline"
  >
    {label}
  </button>
);

const SortHeader = ({ c }: { c: Column }) => (
  <button
    type="button"
    onClick={c.onClick}
    className="inline-flex items-center gap-1 font-medium text-muted-foreground hover:text-foreground"
  >
    {c.label}
    <Icon
      icon={
        c.sort === "asc"
          ? SortAscIcon
          : c.sort === "desc"
            ? SortDescIcon
            : SortableIcon
      }
      size={13}
      className={cn("shrink-0", !c.sort && "opacity-40")}
    />
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
const PAGE = 50;

const phoneQuery = window.matchMedia("(max-width: 639px)");
const usePhone = () =>
  useSyncExternalStore(
    (change) => {
      phoneQuery.addEventListener("change", change);
      return () => phoneQuery.removeEventListener("change", change);
    },
    () => phoneQuery.matches,
  );

const PhoneSort = ({ columns }: { columns: Column[] }) => {
  const sortable = columns.filter((c) => c.onClick && c.phone);
  const current = sortable.find((c) => c.sort);
  const lead = columns.find((c) => c.phone === "lead")?.header;
  if (!lead && sortable.length === 0) return null;
  return (
    <div className="flex items-center gap-3 border-b pb-2">
      {lead}
      {sortable.length > 0 && (
        <label className="ml-auto flex items-center gap-1.5 text-xs text-muted-foreground">
          Sort by
          <select
            value={current?.label ?? ""}
            onChange={(e) =>
              sortable.find((c) => c.label === e.target.value)?.onClick?.()
            }
            className="h-8 rounded-md border bg-transparent px-2 text-xs text-foreground"
          >
            {!current && <option value="">None</option>}
            {sortable.map((c) => (
              <option key={c.label} value={c.label}>
                {c.label}
              </option>
            ))}
          </select>
        </label>
      )}
      {current && (
        <button
          type="button"
          onClick={current.onClick}
          aria-label={`Sorted ${current.sort === "asc" ? "ascending" : "descending"}. Change the order`}
          className="inline-flex size-8 items-center justify-center rounded-md border text-muted-foreground"
        >
          <Icon
            icon={current.sort === "asc" ? SortAscIcon : SortDescIcon}
            size={14}
          />
        </button>
      )}
    </div>
  );
};

const PhoneList = ({ columns, rows, onRow, rowClassName }: DataTableProps) => {
  const [limit, setLimit] = useState(PAGE);
  const slot = (row: ReactNode[], ...phone: Column["phone"][]) =>
    row.flatMap((cell, j) =>
      phone.includes(columns[j]?.phone) && cell !== false
        ? [{ cell, c: columns[j]! }]
        : [],
    );

  return (
    <div>
      <PhoneSort columns={columns} />
      <ul>
        {rows.slice(0, limit).map((row, i) => {
          const meta = slot(row, "meta", "labeled");
          return (
            <li
              key={i}
              onClick={onRow && ((e) => !highlighting(e) && onRow(i))}
              className={cn(
                "flex min-h-12 items-start gap-3 border-b border-border/70 py-2.5 text-sm tabular-nums",
                onRow && "cursor-pointer active:bg-muted/60",
                rowClassName?.(i),
              )}
            >
              {slot(row, "lead").map(({ cell }, k) => (
                <span key={k} className="pt-0.5">
                  {cell}
                </span>
              ))}
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-3">
                  <div
                    className={cn(
                      "min-w-0 flex-1 truncate",
                      onRow && "pointer-events-none",
                    )}
                  >
                    {slot(row, "title").map(({ cell }) => cell)}
                  </div>
                  {slot(row, "end").map(({ cell }, k) => (
                    <span key={k} className="shrink-0 font-medium">
                      {cell}
                    </span>
                  ))}
                </div>
                {meta.length > 0 && (
                  <div className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-muted-foreground">
                    {meta.map(({ cell, c }, k) => (
                      <span key={k} className="inline-flex gap-1">
                        {c.phone === "labeled" && <span>{c.label}</span>}
                        <span className="text-foreground/80">{cell}</span>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      {rows.length > limit && (
        <button
          type="button"
          onClick={() => setLimit(limit + PAGE)}
          className="mt-2 h-10 w-full rounded-md border text-sm text-muted-foreground"
        >
          Show more ({rows.length - limit} left)
        </button>
      )}
    </div>
  );
};

const WideTable = ({
  columns,
  rows,
  scroll,
  onRow,
  rowClassName,
}: DataTableProps) => {
  const [scrollTop, setScrollTop] = useState(0);
  const [rowH, setRowH] = useState(32);
  const probe = useRef<HTMLTableRowElement>(null);
  const box = useRef<HTMLDivElement>(null);

  const windowed = !!scroll && rows.length > WINDOW_OVER;

  useLayoutEffect(() => {
    const h = probe.current?.getBoundingClientRect().height;
    if (h && Math.abs(h - rowH) > 0.5) setRowH(h);
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

  const align = (c: Column | undefined) =>
    cn(
      "px-2 first:pl-0 last:pr-0",
      c?.num ? "text-right" : "text-left",
      c?.min && "w-px whitespace-nowrap",
      c?.className,
    );

  return (
    <div
      ref={box}
      onScroll={
        windowed ? (e) => setScrollTop(e.currentTarget.scrollTop) : undefined
      }
      className={cn(
        "overflow-x-auto",
        scroll && "max-h-115 overflow-y-auto pr-2",
      )}
    >
      <table className="w-full border-separate border-spacing-0 text-[13px] tabular-nums">
        <thead className={cn(scroll && "sticky top-0 z-10")}>
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
                className={cn(
                  "h-8 border-b bg-card text-xs font-medium text-muted-foreground",
                  align(c),
                )}
              >
                {c.sizer && <Sizer of={c.sizer} />}
                {c.onClick ? <SortHeader c={c} /> : (c.header ?? c.label)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {spacer(first * rowH)}
          {rows.slice(first, last).map((row, i) => (
            <tr
              key={first + i}
              ref={i === 0 ? probe : undefined}
              onClick={onRow && ((e) => !highlighting(e) && onRow(first + i))}
              className={cn(
                "transition-colors hover:bg-muted/60",
                onRow && "cursor-pointer",
                rowClassName?.(first + i),
              )}
            >
              {row.map((cell, j) => (
                <td
                  key={j}
                  className={cn(
                    "h-8 border-b border-border/70 py-1 whitespace-nowrap",
                    align(columns[j]),
                  )}
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

export const DataTable = (props: DataTableProps) =>
  usePhone() && props.columns.some((c) => c.phone === "title") ? (
    <PhoneList {...props} />
  ) : (
    <WideTable {...props} />
  );
