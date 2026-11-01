import { useRef, useState } from "react";
import { toggled } from "./format.ts";
import { DropdownIcon, Icon, RemovedIcon, TickIcon } from "./icons.ts";
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

interface PickerProps {
  title: string;
  options: string[];
  picked: string[];
  excluded: string[];
  onToggle: (value: string, exclude: boolean) => void;
  label?: (value: string) => string;
  subs?: (option: string) => string[];
  subLabel?: (value: string) => string;
  people?: ReadonlySet<string>;
  className?: string;
}

type Kind = "all" | "people" | "business";
type Row = { value: string; sub: boolean };

const PAGE = 80;

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

const keyOf = (row: Row) => `${row.sub ? "sub:" : ""}${row.value}`;

export const Picker = ({
  title,
  options,
  picked,
  excluded,
  onToggle,
  label = (v) => v,
  subs,
  subLabel = (v) => v,
  people,
  className,
}: PickerProps) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<Kind>("all");
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  const [limit, setLimit] = useState(PAGE);
  const [pinned, setPinned] = useState<readonly string[]>([]);
  const [active, setActive] = useState("");
  const meta = useRef(false);
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
    const parent = { value: lone ?? o, sub: false };
    return kids.length > 0 && openHere && !lone
      ? [parent, ...kids.map((c) => ({ value: c, sub: true }))]
      : [parent];
  };

  const top = shown.filter(isPinned).flatMap(rowsOf);
  const rest = shown.filter((o) => !isPinned(o)).flatMap(rowsOf);
  const restShown = rest.slice(0, Math.max(limit - top.length, 0));
  const count = picked.length + excluded.length;

  const onOpenChange = (next: boolean) => {
    setOpen(next);
    if (next) {
      setPinned([...picked, ...excluded]);
      return;
    }
    setQuery("");
    setExpanded(new Set());
    setLimit(PAGE);
  };

  const rowByKey = (key: string) =>
    [...top, ...restShown].find((row) => keyOf(row) === key);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") meta.current = e.metaKey || e.ctrlKey;
    if (q || (e.key !== "ArrowRight" && e.key !== "ArrowLeft")) return;
    const row = rowByKey(active);
    if (!row || row.sub || childrenOf(row.value).length < 2) return;
    e.preventDefault();
    const isOpen = expanded.has(row.value);
    if ((e.key === "ArrowRight") !== isOpen)
      setExpanded((prev) => toggled(prev, row.value));
  };

  const item = (row: Row) => {
    const kids = row.sub ? [] : childrenOf(row.value);
    const out = excluded.includes(row.value);
    const isOn = picked.includes(row.value);
    const text =
      row.sub || row.value.includes("/")
        ? subLabel(row.value)
        : label(row.value);
    const openHere = kids.length > 1 && rowsOf(row.value).length > 1;
    return (
      <CommandItem
        key={keyOf(row)}
        value={keyOf(row)}
        onSelect={() => onToggle(row.value, meta.current)}
        className={cn("gap-2 py-1", row.sub && "pl-8 text-muted-foreground")}
      >
        <State on={isOn} out={out} />
        <span
          className={cn(
            "min-w-0 flex-1 truncate",
            out && "text-destructive line-through",
          )}
        >
          {out && <span className="sr-only">Except </span>}
          {text}
        </span>
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
            className="-my-1 text-muted-foreground"
          >
            <Icon
              icon={DropdownIcon}
              size={14}
              className={cn("transition-transform", openHere && "rotate-180")}
            />
          </Button>
        )}
      </CommandItem>
    );
  };

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={cn("justify-between font-normal", className)}
        >
          {title}
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
        className="w-[min(18rem,calc(100vw-1.5rem))] gap-0 p-0"
      >
        <Command
          shouldFilter={false}
          loop
          value={active}
          onValueChange={setActive}
          onKeyDown={onKeyDown}
          onPointerDownCapture={(e) => {
            meta.current = e.metaKey || e.ctrlKey;
          }}
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
            placeholder={`Search ${title.toLowerCase()}…`}
            value={query}
            onValueChange={(v) => {
              setQuery(v);
              setLimit(PAGE);
            }}
            aria-label={`Search ${title.toLowerCase()}`}
          />
          <CommandList
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
          <p className="border-t px-3 py-2 text-[11px] leading-snug text-muted-foreground">
            Tap to include, again to exclude, again to clear.
          </p>
        </Command>
      </PopoverContent>
    </Popover>
  );
};
