import { useState } from "react";
import {
  AXES,
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
}

export type Scope = Axis | "home";

const TOP = 5;

const nameOf = (s: AxisSpec) => s.fullLabel ?? ((v: string) => v);

const valuesOf = (s: AxisSpec, f: Filters) => [
  ...f[s.axis],
  ...f[AXES[s.axis]],
];

const candidates = (s: AxisSpec) => [
  ...s.options,
  ...s.options.flatMap((o) => {
    const kids = s.subs?.(o) ?? [];
    return kids.length > 1 ? kids.filter((k) => !k.endsWith("/")) : [];
  }),
];

interface HomeProps {
  specs: AxisSpec[];
  filters: Filters;
  toggle: (axis: Axis) => (value: string, exclude: boolean) => void;
  query: string;
  onQuery: (query: string) => void;
  onScope: (scope: Scope | null) => void;
  onSearch: (text: string) => void;
}

const Home = ({
  specs,
  filters,
  toggle,
  query,
  onQuery,
  onScope,
  onSearch,
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
    const name = nameOf(s);
    const hit = candidates(s).filter((v) => name(v).toLowerCase().includes(q));
    return [
      ...hit.filter((v) => name(v).toLowerCase().startsWith(q)),
      ...hit.filter((v) => !name(v).toLowerCase().startsWith(q)),
    ];
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
      <CommandList className="max-h-none min-h-0 flex-1">
        {q === "" ? (
          <>
            {selected.length > 0 && (
              <CommandGroup heading="Selected">
                {selected.map(([s, v]) => row(s, v, s.name))}
              </CommandGroup>
            )}
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
          </>
        ) : (
          <>
            {specs.map((s) => {
              const hits = matches(s);
              if (hits.length === 0) return null;
              return (
                <CommandGroup key={s.axis} heading={s.plural}>
                  {hits.slice(0, TOP).map((v) => row(s, v))}
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
            <CommandGroup heading="Text">
              <CommandItem
                value="text-search"
                onSelect={() => onSearch(query.trim())}
                className={ROW}
              >
                <Icon
                  icon={SearchIcon}
                  size={15}
                  className="text-muted-foreground"
                />
                <span className="min-w-0 flex-1 truncate">
                  Names and descriptions with “{query.trim()}”
                </span>
              </CommandItem>
            </CommandGroup>
          </>
        )}
        <CommandEmpty className="py-4 text-xs text-muted-foreground">
          No match.
        </CommandEmpty>
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
}

export const FilterPanel = ({
  specs,
  filters,
  onFilters,
  scope,
  onScope,
  matching,
}: FilterPanelProps) => {
  const [query, setQuery] = useState("");
  const [carried, setCarried] = useState("");
  const spec = specs.find((s) => s.axis === scope);
  const toggle = (axis: Axis) => (value: string, exclude: boolean) =>
    onFilters(cycleFilter(filters, axis, value, exclude));
  const back = () => onScope("home");

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {spec && (
        <div className="flex items-center gap-1 border-b p-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={back}
            className="text-muted-foreground"
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
        />
      )}
      {!spec && query.trim() === "" && (
        <label className="flex cursor-pointer items-center justify-between gap-3 border-t px-3 py-2 text-sm hover:bg-muted/50">
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
      )}
      <div className="border-t px-3 py-2">
        <p className="text-[11px] leading-snug text-muted-foreground">{HINT}</p>
        <div className="mt-1.5 flex items-center justify-between gap-2">
          <span
            aria-live="polite"
            className="text-xs text-muted-foreground tabular-nums"
          >
            {matching} {matching === 1 ? "transaction" : "transactions"} match
          </span>
          <Button size="sm" onClick={() => onScope(null)}>
            Done
          </Button>
        </div>
      </div>
    </div>
  );
};
