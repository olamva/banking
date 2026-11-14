import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  AXES,
  clearFilters,
  cycleFilter,
  type Axis,
  type Filters,
} from "../../core/select.ts";
import {
  fine,
  HINT,
  PickerList,
  ROW,
  useExcludeKey,
  ValueRow,
} from "./FilterPicker.tsx";
import { BackIcon, ExpandIcon, Icon, SearchIcon } from "./icons.ts";
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
import { Switch } from "./ui/switch.tsx";

export interface AxisSpec {
  axis: Axis;
  name: string;
  plural: string;
  options: string[];
  label?: (value: string) => string;
  fullLabel?: (value: string) => string;
  subs?: (option: string) => string[];
  subLabel?: (value: string) => string;
  people?: ReadonlySet<string>;
  uses: ReadonlyMap<string, number>;
}

export type Scope = Axis | "home";

const TOP = 5;

const nameOf = (s: AxisSpec) => s.fullLabel ?? ((v: string) => v);

const valuesOf = (s: AxisSpec, f: Filters) => [
  ...f[s.axis],
  ...f[AXES[s.axis]],
];

const candidates = (s: AxisSpec, f: Filters) =>
  s.options.flatMap((o) => {
    const kids = (s.subs?.(o) ?? []).filter((k) => !k.endsWith("/"));
    const lone = s.subs?.(o).length === 1 ? kids[0] : undefined;
    return lone
      ? [valuesOf(s, f).includes(lone) ? lone : o]
      : [o, ...(kids.length > 1 ? kids : [])];
  });

interface HomeProps {
  specs: AxisSpec[];
  filters: Filters;
  toggle: (axis: Axis) => (value: string, exclude: boolean) => void;
  query: string;
  onQuery: (query: string) => void;
  onScope: (scope: Scope | null) => void;
  onSearch: (text: string) => void;
  options: ReactNode;
}

const Home = ({
  specs,
  filters,
  toggle,
  query,
  onQuery,
  onScope,
  onSearch,
  options,
}: HomeProps) => {
  const keys = useExcludeKey();
  const [pinned] = useState(() =>
    specs.flatMap((s) => valuesOf(s, filters).map((v) => `${s.axis}:${v}`)),
  );
  const q = query.trim().toLowerCase();

  const row = (s: AxisSpec, v: string, note?: string) => (
    <ValueRow
      key={`${s.axis}:${v}`}
      id={`${s.axis}:${v}`}
      text={nameOf(s)(v)}
      note={note}
      on={filters[s.axis].includes(v)}
      out={filters[AXES[s.axis]].includes(v)}
      meta={keys.meta}
      onToggle={(exclude) => toggle(s.axis)(v, exclude)}
    />
  );

  const selected = [
    ...new Set([
      ...pinned,
      ...specs.flatMap((s) =>
        valuesOf(s, filters).map((v) => `${s.axis}:${v}`),
      ),
    ]),
  ].map((id) => {
    const at = id.indexOf(":");
    return [
      specs.find((s) => s.axis === id.slice(0, at))!,
      id.slice(at + 1),
    ] as const;
  });

  const matches = (s: AxisSpec) => {
    const rank = (v: string) => {
      const name = nameOf(s)(v).toLowerCase();
      return name.startsWith(q)
        ? 0
        : name.split(/[\s›/-]+/).some((w) => w.startsWith(q))
          ? 1
          : name.includes(q)
            ? 2
            : 3;
    };
    return candidates(s, filters)
      .map((v) => [v, rank(v), s.uses.get(v) ?? 0] as const)
      .filter(([, r]) => r < 3)
      .sort((a, b) => a[1] - b[1] || b[2] - a[2])
      .map(([v]) => v);
  };

  return (
    <Command
      shouldFilter={false}
      loop
      onKeyDown={keys.onKeyDown}
      onPointerDownCapture={keys.onPointerDownCapture}
      className="min-h-0 flex-1 rounded-none!"
    >
      <CommandInput
        autoFocus={fine()}
        placeholder="Search categories, merchants, items…"
        value={query}
        onValueChange={onQuery}
        aria-label="Search filters"
      />
      {q !== "" && (
        <button
          type="button"
          onClick={() => onSearch(query.trim())}
          className="mx-1 mt-1 flex min-h-8 items-center gap-2 rounded-sm px-2 text-left text-sm hover:bg-muted pointer-coarse:min-h-11"
        >
          <Icon
            icon={SearchIcon}
            size={15}
            className="shrink-0 text-muted-foreground"
          />
          <span className="min-w-0 flex-1 truncate">
            Text contains “{query.trim()}”
          </span>
        </button>
      )}
      <CommandList className="max-h-none min-h-0 flex-1">
        {q === "" ? (
          <>
            <CommandGroup heading="Filter by">
              {specs.map((s) => {
                const count = valuesOf(s, filters).length;
                return (
                  <CommandItem
                    key={s.axis}
                    value={`axis:${s.axis}`}
                    onSelect={() => onScope(s.axis)}
                    className={ROW}
                  >
                    <span className="flex-1">{s.plural}</span>
                    {count > 0 && (
                      <Badge
                        variant="secondary"
                        className="h-4.5 px-1.5 tabular-nums"
                      >
                        {count}
                        <span className="sr-only"> selected</span>
                      </Badge>
                    )}
                    <Icon
                      icon={ExpandIcon}
                      size={14}
                      className="text-muted-foreground"
                    />
                  </CommandItem>
                );
              })}
            </CommandGroup>
            {selected.length > 0 && (
              <CommandGroup heading="Selected">
                {selected.map(([s, v]) => row(s, v, s.name))}
              </CommandGroup>
            )}
            {options}
          </>
        ) : (
          <>
            {specs.map((s) => {
              const hits = matches(s);
              if (hits.length === 0) return null;
              return (
                <CommandGroup
                  key={s.axis}
                  heading={s.plural}
                  className="overflow-visible py-0 **:[[cmdk-group-heading]]:sticky **:[[cmdk-group-heading]]:top-0 **:[[cmdk-group-heading]]:z-10 **:[[cmdk-group-heading]]:bg-popover"
                >
                  {hits
                    .slice(0, TOP)
                    .map((v) =>
                      row(s, v, s.people?.has(v) ? "Person" : undefined),
                    )}
                  {hits.length > TOP && (
                    <CommandItem
                      value={`more:${s.axis}`}
                      onSelect={() => onScope(s.axis)}
                      className={`${ROW} pl-8 text-muted-foreground`}
                    >
                      <span className="flex-1">
                        Show all {hits.length} {s.plural.toLowerCase()}
                      </span>
                      <Icon icon={ExpandIcon} size={14} />
                    </CommandItem>
                  )}
                </CommandGroup>
              );
            })}
          </>
        )}
        {q !== "" && (
          <CommandEmpty className="px-3 py-3 text-left text-xs text-muted-foreground">
            No category, merchant, item, account or country matches. Use the
            text search above.
          </CommandEmpty>
        )}
      </CommandList>
    </Command>
  );
};

interface FilterPanelProps {
  specs: AxisSpec[];
  filters: Filters;
  onFilters: (filters: Filters) => void;
  scope: Scope;
  onScope: (scope: Scope | null) => void;
  matching: number;
  active: boolean;
}

export const FilterPanel = ({
  specs,
  filters,
  onFilters,
  scope,
  onScope,
  matching,
  active,
}: FilterPanelProps) => {
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!fine()) root.current?.focus({ preventScroll: true });
  }, []);
  const [query, setQuery] = useState("");
  const [carried, setCarried] = useState("");
  const spec = specs.find((s) => s.axis === scope);
  const toggle = (axis: Axis) => (value: string, exclude: boolean) =>
    onFilters(cycleFilter(filters, axis, value, exclude));
  const back = () => onScope("home");

  return (
    <div
      ref={root}
      tabIndex={-1}
      aria-label="Filters"
      role="group"
      className="flex min-h-0 flex-1 flex-col outline-none"
    >
      {spec && (
        <div className="flex items-center gap-1 border-b p-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={back}
            className="text-muted-foreground pointer-coarse:h-10"
          >
            <Icon icon={BackIcon} size={15} />
            All filters
          </Button>
          <span className="ml-auto pr-2 text-sm font-medium">
            {spec.plural}
          </span>
        </div>
      )}
      {spec ? (
        <PickerList
          key={spec.axis}
          title={spec.plural}
          options={spec.options}
          picked={filters[spec.axis]}
          excluded={filters[AXES[spec.axis]]}
          onToggle={toggle(spec.axis)}
          label={spec.label}
          subs={spec.subs}
          subLabel={spec.subLabel}
          people={spec.people}
          query={carried}
          onBack={back}
        />
      ) : (
        <Home
          specs={specs}
          filters={filters}
          toggle={toggle}
          query={query}
          onQuery={setQuery}
          onScope={(next) => {
            setCarried(query);
            onScope(next);
          }}
          onSearch={(search) => {
            onFilters({ ...filters, search });
            onScope(null);
          }}
          options={
            <label className="mx-1 mb-1 flex cursor-pointer items-center justify-between gap-3 rounded-sm border-t px-2 pt-2.5 pb-1.5 text-sm hover:bg-muted/50">
              <span>
                Show internal transfers
                <span className="block text-xs text-muted-foreground">
                  Moves between your accounts, card bills and funds
                </span>
              </span>
              <Switch
                checked={filters.showExcluded}
                onCheckedChange={(showExcluded) =>
                  onFilters({ ...filters, showExcluded })
                }
              />
            </label>
          }
        />
      )}
      <div className="border-t px-3 py-2">
        <p className="text-[11px] leading-snug text-muted-foreground">{HINT}</p>
        <div className="mt-1.5 flex items-center gap-2">
          <span
            aria-live="polite"
            className="mr-auto text-xs text-muted-foreground tabular-nums"
          >
            {matching} {matching === 1 ? "transaction" : "transactions"} match
          </span>
          {active && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onFilters(clearFilters(filters))}
              className="text-muted-foreground pointer-coarse:h-10"
            >
              Clear all
            </Button>
          )}
          <Button
            size="sm"
            onClick={() => onScope(null)}
            className="pointer-coarse:h-10 pointer-coarse:px-4"
          >
            Done
          </Button>
        </div>
      </div>
    </div>
  );
};
