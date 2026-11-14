import { useRef, useState, type ReactNode, type RefObject } from "react";
import { toggled } from "./format.ts";
import {
  DropdownIcon,
  ExcludeIcon,
  Icon,
  RemovedIcon,
  TickIcon,
} from "./icons.ts";
import { Badge } from "./ui/badge.tsx";
import { Button } from "./ui/button.tsx";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "./ui/command.tsx";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover.tsx";
import { ToggleGroup, ToggleGroupItem } from "./ui/toggle-group.tsx";
import { cn } from "./ui/utils.ts";

export const fine = () => matchMedia("(pointer: fine)").matches;

export const useExcludeKey = () => {
  const meta = useRef(false);
  const read = (e: React.KeyboardEvent | React.PointerEvent) => {
    meta.current = e.metaKey || e.ctrlKey || e.shiftKey;
  };
  return {
    meta,
    onKeyDown: (e: React.KeyboardEvent) => {
      if (e.key === "Enter") read(e);
    },
    onPointerDownCapture: read,
  };
};

export const ROW =
  "gap-2 py-1 pointer-coarse:min-h-11 [&>svg:last-child]:hidden";

const State = ({ on, out }: { on: boolean; out: boolean }) => (
  <span
    aria-hidden
    className={cn(
      "flex size-4 shrink-0 items-center justify-center rounded-[4px] border border-input",
      on && "border-primary bg-primary text-primary-foreground",
      out && "border-destructive bg-destructive text-white",
    )}
  >
    {on && <Icon icon={TickIcon} size={12} strokeWidth={2.5} />}
    {out && <Icon icon={RemovedIcon} size={12} strokeWidth={2.5} />}
  </span>
);

interface ValueRowProps {
  id: string;
  text: string;
  on: boolean;
  out: boolean;
  meta: RefObject<boolean>;
  onToggle: (exclude: boolean) => void;
  note?: string;
  className?: string;
  children?: ReactNode;
}

export const ValueRow = ({
  id,
  text,
  on,
  out,
  meta,
  onToggle,
  note,
  className,
  children,
}: ValueRowProps) => (
  <CommandItem
    value={id}
    onSelect={() => onToggle(meta.current)}
    className={cn(ROW, className)}
  >
    <State on={on} out={out} />
    <span
      className={cn(
        "min-w-0 flex-1 truncate",
        out && "text-destructive line-through",
      )}
    >
      {text}
      <span className="sr-only">
        {on ? ", included" : out ? ", excluded" : ""}
      </span>
    </span>
    {note && (
      <span className="shrink-0 text-xs text-muted-foreground">{note}</span>
    )}
    {children}
    <button
      type="button"
      tabIndex={-1}
      aria-hidden
      title={out ? "Stop excluding" : "Exclude"}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.stopPropagation();
        onToggle(true);
      }}
      className={cn(
        "-my-1.5 -mr-1 flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground/60 hover:bg-destructive/10 hover:text-destructive pointer-coarse:size-10",
        out && "text-destructive",
      )}
    >
      <Icon icon={ExcludeIcon} size={15} />
    </button>
  </CommandItem>
);

type Kind = "all" | "people" | "business";
type Row = { value: string; sub: boolean };

const PAGE = 80;

const keyOf = (row: Row) => `${row.sub ? "sub:" : ""}${row.value}`;

export interface PickerListProps {
  title: string;
  options: string[];
  picked: string[];
  excluded: string[];
  onToggle: (value: string, exclude: boolean) => void;
  label?: (value: string) => string;
  subs?: (option: string) => string[];
  subLabel?: (value: string) => string;
  people?: ReadonlySet<string>;
  query?: string;
  onBack?: () => void;
}

export const PickerList = ({
  title,
  options,
  picked,
  excluded,
  onToggle,
  label = (v) => v,
  subs,
  subLabel = (v) => v,
  people,
  query: initialQuery = "",
  onBack,
}: PickerListProps) => {
  const [query, setQuery] = useState(initialQuery);
  const [kind, setKind] = useState<Kind>("all");
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  const [limit, setLimit] = useState(PAGE);
  const [pinned] = useState<readonly string[]>(() => [...picked, ...excluded]);
  const [active, setActive] = useState("");
  const keys = useExcludeKey();
  const on = (v: string) => picked.includes(v) || excluded.includes(v);

  const q = query.trim().toLowerCase();
  const listed =
    !people || kind === "all"
      ? options
      : options.filter((o) => people.has(o) === (kind === "people") || on(o));
  const childrenOf = (o: string) => subs?.(o) ?? [];
  const hits = (name: string) => name.toLowerCase().includes(q);

  const shown = q
    ? listed.filter(
        (o) =>
          hits(label(o)) ||
          on(o) ||
          childrenOf(o).some((c) => hits(subLabel(c)) || on(c)),
      )
    : listed;

  const isPinned = (o: string) =>
    pinned.includes(o) || childrenOf(o).some((c) => pinned.includes(c));

  const rowsOf = (o: string): Row[] => {
    const all = childrenOf(o);
    const kids = q === "" ? all : all.filter((c) => hits(subLabel(c)) || on(c));
    const openByDefault =
      kids.length < all.length ||
      (all.length > 1 && kids.some((c) => pinned.includes(c)));
    const openHere = openByDefault !== expanded.has(o);
    const lone = all.length === 1 && !all[0]!.endsWith("/") ? all[0]! : null;
    const parent = { value: lone && !on(o) ? lone : o, sub: false };
    return kids.length > 0 && openHere && !lone
      ? [parent, ...kids.map((c) => ({ value: c, sub: true }))]
      : [parent];
  };

  const top = shown.filter(isPinned).flatMap(rowsOf);
  const rest = shown.filter((o) => !isPinned(o)).flatMap(rowsOf);
  const restShown = rest.slice(0, Math.max(limit - top.length, 0));

  const rowByKey = (key: string) =>
    [...top, ...restShown].find((row) => keyOf(row) === key);

  const onKeyDown = (e: React.KeyboardEvent) => {
    keys.onKeyDown(e);
    if (e.key === "Backspace" && query === "" && onBack) {
      e.preventDefault();
      onBack();
      return;
    }
    if (q || (e.key !== "ArrowRight" && e.key !== "ArrowLeft")) return;
    const row = rowByKey(active);
    if (!row || row.sub || childrenOf(row.value).length < 2) return;
    e.preventDefault();
    const isOpen = rowsOf(row.value).length > 1;
    if ((e.key === "ArrowRight") !== isOpen)
      setExpanded((prev) => toggled(prev, row.value));
  };

  const item = (row: Row) => {
    const kids = row.sub ? [] : childrenOf(row.value);
    const text =
      row.sub || row.value.includes("/")
        ? subLabel(row.value)
        : label(row.value);
    const openHere = kids.length > 1 && rowsOf(row.value).length > 1;
    return (
      <ValueRow
        key={keyOf(row)}
        id={keyOf(row)}
        text={text}
        on={picked.includes(row.value)}
        out={excluded.includes(row.value)}
        meta={keys.meta}
        onToggle={(exclude) => onToggle(row.value, exclude)}
        className={cn(row.sub && "pl-8 text-muted-foreground")}
      >
        {kids.length > 1 && (
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            aria-expanded={openHere}
            aria-label={`${openHere ? "Hide" : "Show"} ${label(row.value)} subcategories`}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              setExpanded((prev) => toggled(prev, row.value));
            }}
            className="-my-1 text-muted-foreground pointer-coarse:size-8"
          >
            <Icon
              icon={DropdownIcon}
              size={14}
              className={cn("transition-transform", openHere && "rotate-180")}
            />
          </Button>
        )}
      </ValueRow>
    );
  };

  return (
    <Command
      shouldFilter={false}
      loop
      value={active}
      onValueChange={setActive}
      onKeyDown={onKeyDown}
      onPointerDownCapture={keys.onPointerDownCapture}
      className="min-h-0 flex-1 rounded-none!"
    >
      {people && (
        <ToggleGroup
          type="single"
          variant="outline"
          size="sm"
          spacing={0}
          value={kind}
          onValueChange={(v) => {
            if (!v) return;
            setKind(v as Kind);
            setLimit(PAGE);
          }}
          className="w-full p-1 pb-0 *:flex-1"
        >
          <ToggleGroupItem value="all">All</ToggleGroupItem>
          <ToggleGroupItem value="people">People</ToggleGroupItem>
          <ToggleGroupItem value="business">Businesses</ToggleGroupItem>
        </ToggleGroup>
      )}
      <CommandInput
        autoFocus={fine()}
        placeholder={`Search ${title.toLowerCase()}…`}
        value={query}
        onValueChange={(v) => {
          setQuery(v);
          setLimit(PAGE);
        }}
        aria-label={`Search ${title.toLowerCase()}`}
      />
      <CommandList
        className="max-h-none min-h-0 flex-1"
        onScroll={(e) => {
          const el = e.currentTarget;
          if (el.scrollHeight - el.scrollTop - el.clientHeight < 120)
            setLimit((n) => n + PAGE);
        }}
      >
        <CommandEmpty className="py-4 text-xs text-muted-foreground">
          {options.length === 0 ? "Nothing in this period." : "No match."}
        </CommandEmpty>
        {top.length > 0 && (
          <CommandGroup heading="Selected">{top.map(item)}</CommandGroup>
        )}
        {restShown.length > 0 && (
          <CommandGroup heading={top.length > 0 ? "All" : undefined}>
            {restShown.map(item)}
          </CommandGroup>
        )}
      </CommandList>
    </Command>
  );
};

export const HINT = (
  <>
    <span className="pointer-coarse:hidden">Click</span>
    <span className="hidden pointer-coarse:inline">Tap</span>{" "}
    <Icon icon={ExcludeIcon} size={11} className="inline align-[-1px]" /> to
    exclude a row
    <span className="pointer-coarse:hidden">, or press Shift Enter</span>.
  </>
);

interface PickerProps extends Omit<PickerListProps, "query" | "onBack"> {
  className?: string;
}

export const Picker = ({ className, ...list }: PickerProps) => {
  const count = list.picked.length + list.excluded.length;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={cn("justify-between font-normal", className)}
        >
          {list.title}
          {count > 0 && (
            <Badge variant="secondary" className="h-4.5 px-1.5 tabular-nums">
              {count}
            </Badge>
          )}
          <Icon
            icon={DropdownIcon}
            size={14}
            className="text-muted-foreground"
          />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        onOpenAutoFocus={(e) => e.preventDefault()}
        className="max-h-[min(30rem,var(--radix-popover-content-available-height))] w-[min(18rem,calc(100vw-1.5rem))] gap-0 p-0"
      >
        <PickerList {...list} />
        <p className="border-t px-3 py-2 text-[11px] leading-snug text-muted-foreground">
          {HINT}
        </p>
      </PopoverContent>
    </Popover>
  );
};
