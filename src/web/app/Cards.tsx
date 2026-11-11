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
import { Badge } from "./ui/badge.tsx";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "./ui/card.tsx";
import { cn } from "./ui/utils.ts";

export const Empty = ({ children }: { children: ReactNode }) => (
  <div className="py-10 text-center text-sm text-muted-foreground">
    {children}
  </div>
);

interface NoteProps {
  icon: IconSvgElement;
  className?: string;
  children: ReactNode;
}

export const Note = ({ icon, className = "", children }: NoteProps) => (
  <p
    className={cn(
      "flex items-start gap-1.5 text-xs text-muted-foreground",
      className,
    )}
  >
    <Icon icon={icon} size={13} className="mt-px shrink-0" />
    <span>{children}</span>
  </p>
);

export const Caret = ({ open }: { open: boolean }) => (
  <Icon
    icon={ExpandIcon}
    size={12}
    className={cn("transition-transform", open && "rotate-90")}
  />
);

export const Loading = () => (
  <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
    <Icon icon={LoadingIcon} size={16} className="animate-spin" />
    Loading…
  </div>
);

interface PanelProps {
  title: ReactNode;
  icon?: IconSvgElement;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
  children: ReactNode;
}

export const Panel = ({
  title,
  icon,
  description,
  action,
  className,
  children,
}: PanelProps) => (
  <Card className={cn("min-w-0 gap-3", className)}>
    <CardHeader>
      <CardTitle className="flex items-center gap-2 text-sm font-medium">
        {icon && (
          <Icon
            icon={icon}
            size={16}
            className="shrink-0 text-muted-foreground"
          />
        )}
        {title}
      </CardTitle>
      {description && (
        <CardDescription className="text-xs">{description}</CardDescription>
      )}
      {action && <CardAction>{action}</CardAction>}
    </CardHeader>
    <CardContent className="flex min-w-0 flex-1 flex-col">
      {children}
    </CardContent>
  </Card>
);

export interface Delta {
  raw: number;
  pct: number | null;
  good: boolean;
}

export const deltaInfo = (
  current: number,
  previous: number,
  goodIfUp: boolean,
): Delta => {
  const raw = Math.round((current - previous) * 100) / 100;
  const pct = previous > 0 && current >= 0 ? raw / previous : null;
  return { raw, pct, good: raw === 0 ? true : goodIfUp === raw > 0 };
};

const deltaTone = (delta: Delta) =>
  Math.abs(delta.raw) < 0.5
    ? "text-muted-foreground"
    : delta.good
      ? "text-good"
      : "text-bad";

const DeltaIcon = ({ delta }: { delta: Delta }) => (
  <Icon
    aria-hidden={false}
    role="img"
    aria-label={delta.raw > 0 ? "up" : delta.raw < 0 ? "down" : "unchanged"}
    icon={delta.raw > 0 ? UpIcon : delta.raw < 0 ? DownIcon : FlatIcon}
    size={13}
    className="shrink-0"
  />
);

interface StatTileProps {
  label: string;
  value: string;
  delta?: Delta;
  vs?: string;
  sub?: string;
}

export const StatTile = ({ label, value, delta, vs, sub }: StatTileProps) => (
  <Card className="min-w-0 gap-1.5 py-3.5 [--card-spacing:--spacing(3.5)] sm:[--card-spacing:--spacing(4)]">
    <CardHeader>
      <CardDescription className="flex min-h-5 items-center justify-between gap-2 text-xs">
        <span className="truncate">{label}</span>
        {delta?.pct != null && (
          <Badge variant="outline" className={cn("gap-0.5", deltaTone(delta))}>
            <DeltaIcon delta={delta} />
            {fmtPct(Math.abs(delta.pct))}
          </Badge>
        )}
      </CardDescription>
      <CardTitle className="min-w-0 text-xl font-semibold tracking-tight break-words tabular-nums sm:text-[26px]">
        {value}
      </CardTitle>
    </CardHeader>
    {(sub || delta) && (
      <CardContent className="space-y-0.5 text-xs text-muted-foreground">
        {delta && (
          <div className={deltaTone(delta)}>
            {delta.raw > 0 ? "+" : delta.raw < 0 ? "−" : "±"}
            {fmtNOK(Math.abs(delta.raw))} vs {vs}
          </div>
        )}
        {sub && <div>{sub}</div>}
      </CardContent>
    )}
  </Card>
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

export const DataTable = ({
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
