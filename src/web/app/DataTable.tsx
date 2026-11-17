import * as rv from "@tanstack/react-virtual";
import {
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { fmtNOK, fmtNOKExact } from "./format.ts";
import {
  DownIcon,
  Icon,
  SortAscIcon,
  SortDescIcon,
  SortableIcon,
  UpIcon,
} from "./icons.ts";
import { Caret } from "./Cards.tsx";
import { Button } from "./ui/button.tsx";
import { ButtonGroup } from "./ui/button-group.tsx";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "./ui/select.tsx";
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
  phone?: "lead" | "title" | "end" | "meta" | "labeled" | "aside";
}

export const highlighting = (e: { detail: number }) =>
  e.detail > 0 && !(window.getSelection()?.isCollapsed ?? true);

const SortHeader = ({ c }: { c: Column }) => (
  <Button
    variant="ghost"
    size="xs"
    onClick={c.onClick}
    className="h-auto px-0 text-muted-foreground hover:bg-transparent dark:hover:bg-transparent"
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
      className={cn(!c.sort && "opacity-40")}
    />
  </Button>
);

interface DataTableProps {
  columns: Column[];
  rows: ReactNode[][];
  scroll?: boolean;
  onRow?: (index: number) => void;
  rowClassName?: (index: number) => string;
  list?: boolean;
  controls?: ReactNode;
  start?: ReactNode;
  group?: {
    of: (index: number) => string;
    label: (key: string) => ReactNode;
    total: (indices: number[]) => ReactNode;
    lead?: (key: string, indices: number[]) => ReactNode;
  };
}

const WINDOW_OVER = 80;
const OVERSCAN = 12;
const VIEWPORT = 460;

const phoneQuery = window.matchMedia("(max-width: 639px)");
const usePhone = () =>
  useSyncExternalStore(
    (change) => {
      phoneQuery.addEventListener("change", change);
      return () => phoneQuery.removeEventListener("change", change);
    },
    () => phoneQuery.matches,
  );

const scrollBox = (el: Element | null): Element | null =>
  !el || el === document.body
    ? null
    : /auto|scroll/.test(getComputedStyle(el).overflowY) &&
        el.scrollHeight > el.clientHeight
      ? el
      : scrollBox(el.parentElement);

const ListSort = ({
  columns,
  controls,
  start,
}: Pick<DataTableProps, "columns" | "controls" | "start">) => {
  const sortable = columns.filter((c) => c.onClick && c.phone);
  const current = sortable.find((c) => c.sort);
  const lead = columns.find((c) => c.phone === "lead")?.header;
  if (!lead && sortable.length === 0 && !controls && !start) return null;
  return (
    <div className="flex flex-wrap items-center gap-2 pb-2">
      {(lead || start) && (
        <span className="mr-auto flex h-8 items-center gap-3">
          {lead}
          {start}
        </span>
      )}
      {!lead && !start && <span className="ml-auto" />}
      {controls}
      {sortable.length > 0 && (
        <ButtonGroup>
          <Select
            value={current?.label ?? ""}
            onValueChange={(label) =>
              sortable.find((c) => c.label === label)?.onClick?.()
            }
          >
            <SelectTrigger size="sm" aria-label="Sort by" className="text-xs">
              <SelectValue placeholder="Sort" />
            </SelectTrigger>
            <SelectContent position="popper" align="end">
              <SelectGroup>
                <SelectLabel>Sort by</SelectLabel>
                {sortable.map((c) => (
                  <SelectItem key={c.label} value={c.label}>
                    {c.label}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            size="icon-sm"
            disabled={!current}
            onClick={current?.onClick}
            aria-label={`Sorted ${current?.sort === "asc" ? "ascending" : "descending"}. Change the order`}
          >
            <Icon icon={current?.sort === "asc" ? UpIcon : DownIcon} />
          </Button>
        </ButtonGroup>
      )}
    </div>
  );
};

const List = ({
  columns,
  rows,
  onRow,
  rowClassName,
  group,
  controls,
  start,
}: DataTableProps) => {
  const [closed, setClosed] = useState<Set<string>>(new Set());
  const list = useRef<HTMLUListElement>(null);
  const [margin, setMargin] = useState(0);
  const [box, setBox] = useState<Element | null>(null);
  useLayoutEffect(() => {
    const b = scrollBox(list.current?.parentElement ?? null);
    if (b !== box) setBox(b);
    const m =
      (list.current?.getBoundingClientRect().top ?? 0) +
      (b ? b.scrollTop - b.getBoundingClientRect().top : window.scrollY);
    if (Math.abs(m - margin) > 0.5) setMargin(m);
  });
  const slot = (row: ReactNode[], ...phone: Column["phone"][]) =>
    row.flatMap((cell, j) =>
      phone.includes(columns[j]?.phone) && cell !== false
        ? [{ cell, c: columns[j]! }]
        : [],
    );
  const days = group && Map.groupBy(rows.keys(), group.of);
  const hasAside = columns.some((c) => c.phone === "aside");
  const toggle = (key: string) =>
    setClosed((s) => new Set(s.symmetricDifference(new Set([key]))));
  const entries: (number | string)[] = days
    ? [...days].flatMap(([key, ix]) => [key, ...(closed.has(key) ? [] : ix)])
    : [...rows.keys()];
  const v = rv.useWindowVirtualizer({
    count: entries.length,
    estimateSize: () => 48,
    overscan: 8,
    scrollMargin: margin,
    getItemKey: (k) =>
      typeof entries[k] === "string" ? `g${entries[k]}` : entries[k]!,
    ...(box &&
      ({
        getScrollElement: () => box,
        observeElementRect: rv.observeElementRect,
        observeElementOffset: rv.observeElementOffset,
        scrollToFn: rv.elementScroll,
      } as unknown as Partial<rv.VirtualizerOptions<Window, Element>>)),
  });
  const sized = ({ cell, c }: { cell: ReactNode; c: Column }) => (
    <span className="inline-flex flex-col">
      {cell}
      {c.sizer && (
        <span className="hidden sm:block">
          <Sizer of={c.sizer} />
        </span>
      )}
    </span>
  );

  const head = (key: string) => (
    <div className="flex items-center gap-3 bg-muted/40 px-(--card-spacing)">
      {group!.lead?.(key, days!.get(key)!)}
      <Button
        variant="ghost"
        aria-expanded={!closed.has(key)}
        onClick={() => toggle(key)}
        className="h-8 flex-1 justify-start gap-2 rounded-none px-0 text-xs font-medium text-muted-foreground hover:bg-transparent aria-expanded:bg-transparent aria-expanded:text-muted-foreground dark:hover:bg-transparent"
      >
        <span className="text-foreground">{group!.label(key)}</span>
        <span className="ml-auto tabular-nums">
          {group!.total(days!.get(key)!)}
        </span>
        <Caret open={!closed.has(key)} />
      </Button>
    </div>
  );

  const item = (i: number, last: boolean) => {
    const row = rows[i]!;
    const meta = slot(row, "meta");
    const labeled = slot(row, "labeled");
    const aside = slot(row, "aside");
    return (
      <div
        onClick={onRow && ((e) => !highlighting(e) && onRow(i))}
        className={cn(
          "flex min-h-12 items-start gap-3 border-b border-border/70 px-(--card-spacing) py-3 tabular-nums sm:min-h-10 sm:items-center sm:py-2",
          last && "border-b-0",
          onRow && "cursor-pointer hover:bg-muted/60 active:bg-muted/60",
          rowClassName?.(i),
        )}
      >
        {slot(row, "lead").map(({ cell }, k) => (
          <span key={k} className="pt-0.5 sm:pt-0">
            {cell}
          </span>
        ))}
        <div className="min-w-0 flex-1 sm:flex sm:items-center sm:gap-6">
          <div className="flex items-baseline gap-3 text-[15px] leading-5 sm:contents sm:text-sm">
            <div
              className={cn(
                "min-w-0 flex-1 truncate sm:order-1",
                onRow && "max-sm:pointer-events-none",
              )}
            >
              {slot(row, "title").map(({ cell }) => cell)}
            </div>
            {slot(row, "end").map(({ cell }, k) => (
              <span
                key={k}
                className="shrink-0 font-semibold sm:order-4 sm:w-28 sm:text-right"
              >
                {cell}
              </span>
            ))}
          </div>
          {meta.length + labeled.length + aside.length > 0 && (
            <div className="mt-1 flex items-start gap-3 text-[13px] leading-4.5 text-muted-foreground sm:contents">
              <div className="flex min-w-0 flex-1 flex-wrap gap-x-3 sm:order-2 sm:flex-none sm:flex-nowrap">
                {meta.length > 0 && (
                  <span className="inline-flex flex-wrap items-baseline gap-x-1 sm:gap-x-3">
                    {meta.map((m, k) => (
                      <span
                        key={k}
                        className="inline-flex gap-1 not-first:before:text-muted-foreground/60 not-first:before:content-['·'] sm:not-first:before:content-none"
                      >
                        {sized(m)}
                      </span>
                    ))}
                  </span>
                )}
                {labeled.map((l, k) => (
                  <span key={k} className="inline-flex items-baseline gap-1">
                    <span className="text-muted-foreground/70">
                      {l.c.label}
                    </span>
                    {sized(l)}
                  </span>
                ))}
              </div>
              {hasAside && (
                <span className="flex shrink-0 sm:order-1">
                  {aside.map(({ cell }) => cell)}
                </span>
              )}
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div>
      <ListSort columns={columns} controls={controls} start={start} />
      <ul
        ref={list}
        className="relative -mx-(--card-spacing) border-t"
        style={{ height: v.getTotalSize() }}
      >
        {v.getVirtualItems().map((vi) => {
          const e = entries[vi.index]!;
          return (
            <li
              key={vi.key}
              data-index={vi.index}
              ref={v.measureElement}
              className="absolute inset-x-0 top-0"
              style={{ transform: `translateY(${vi.start - margin}px)` }}
            >
              {typeof e === "string"
                ? head(e)
                : item(e, typeof entries[vi.index + 1] !== "number")}
            </li>
          );
        })}
      </ul>
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
                  "h-8 border-b bg-background text-xs font-medium text-muted-foreground",
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

export const DataTable = (props: DataTableProps) => {
  const phone = usePhone();
  return (props.list || phone) &&
    props.columns.some((c) => c.phone === "title") ? (
    <List {...props} />
  ) : (
    <WideTable {...props} />
  );
};
