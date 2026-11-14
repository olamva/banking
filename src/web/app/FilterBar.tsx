import { useRef } from "react";
import type { Axis, Filters } from "../../core/select.ts";
import { AXES, NO_COUNTRY, NO_FILTERS } from "../../core/select.ts";
import { FilterPanel, type AxisSpec, type Scope } from "./FilterPanel.tsx";
import { categoryLabel, pairLabel, treeLabel } from "./format.ts";
import { CloseIcon, FilterIcon, Icon } from "./icons.ts";
import type { useFilterOptions } from "./options.ts";
import { Badge } from "./ui/badge.tsx";
import { Button } from "./ui/button.tsx";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu.tsx";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover.tsx";
import { Switch } from "./ui/switch.tsx";
import { cn } from "./ui/utils.ts";

export type View =
  "dashboard" | "insights" | "transactions" | "items" | "rules";

export const SEARCH_VIEWS: View[] = ["transactions", "items"];

interface SwitchFieldProps {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  className?: string;
}

export const SwitchField = ({
  label,
  checked,
  onChange,
  className,
}: SwitchFieldProps) => (
  <label
    className={cn(
      "inline-flex h-8 shrink-0 cursor-pointer items-center gap-2 rounded-lg border border-border bg-background px-2.5 text-sm whitespace-nowrap hover:bg-muted dark:border-input dark:bg-input/30 dark:hover:bg-input/50",
      className,
    )}
  >
    <Switch checked={checked} onCheckedChange={onChange} />
    {label}
  </label>
);

type Options = ReturnType<typeof useFilterOptions>;

export const axisSpecs = (o: Options): AxisSpec[] => {
  const subsOf = (category: string) =>
    o.subcategories.filter(
      (pair) => pair.slice(0, pair.indexOf("/")) === category,
    );
  const country = (c: string) => (c === NO_COUNTRY ? "No country" : c);
  return [
    {
      axis: "categories",
      name: "Category",
      plural: "Categories",
      options: o.categories,
      label: (c) => treeLabel(c, subsOf(c)),
      fullLabel: (c) =>
        c.includes("/")
          ? `${categoryLabel(c.slice(0, c.indexOf("/")))} › ${pairLabel(c)}`
          : treeLabel(c, subsOf(c)),
      subs: subsOf,
      subLabel: pairLabel,
    },
    {
      axis: "merchants",
      name: "Merchant",
      plural: "Merchants",
      options: o.merchants,
      people: o.people,
    },
    { axis: "items", name: "Item", plural: "Items", options: o.items },
    {
      axis: "accounts",
      name: "Account",
      plural: "Accounts",
      options: o.accounts,
    },
    {
      axis: "countries",
      name: "Country",
      plural: "Countries",
      options: o.countries,
      label: country,
      fullLabel: country,
    },
  ];
};

export const activeCount = (filters: Filters) =>
  (Object.keys(AXES) as Axis[]).reduce(
    (n, a) => n + filters[a].length + filters[AXES[a]].length,
    0,
  );

export const clearFilters = (f: Filters): Filters => ({
  ...NO_FILTERS,
  withoutDeposit: f.withoutDeposit,
});

interface FilterButtonProps {
  specs: AxisSpec[];
  filters: Filters;
  onFilters: (filters: Filters) => void;
  scope: Scope | null;
  onScope: (scope: Scope | null) => void;
  matching: number;
}

export const FilterButton = ({
  specs,
  filters,
  onFilters,
  scope,
  onScope,
  matching,
}: FilterButtonProps) => {
  const count = activeCount(filters);
  return (
    <Popover
      open={scope !== null}
      onOpenChange={(open) => onScope(open ? "home" : null)}
    >
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          aria-label={count ? `Filter, ${count} active` : "Filter"}
          className="shrink-0"
        >
          <Icon icon={FilterIcon} size={15} />
          Filter
          {count > 0 && (
            <Badge className="h-4.5 min-w-4.5 px-1 tabular-nums">{count}</Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        collisionPadding={12}
        onOpenAutoFocus={(e) => e.preventDefault()}
        className="max-h-[min(34rem,var(--radix-popover-content-available-height))] w-[min(22rem,calc(100vw-1.5rem))] gap-0 overflow-hidden p-0"
      >
        {scope && (
          <FilterPanel
            specs={specs}
            filters={filters}
            onFilters={onFilters}
            scope={scope}
            onScope={onScope}
            matching={matching}
          />
        )}
      </PopoverContent>
    </Popover>
  );
};

const CHIP =
  "inline-flex h-8 max-w-[18rem] shrink-0 items-center rounded-full bg-secondary text-sm text-secondary-foreground";

const X = ({ label, onClick }: { label: string; onClick: () => void }) => (
  <button
    type="button"
    aria-label={label}
    onClick={onClick}
    className="flex size-8 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-foreground/10 hover:text-foreground"
  >
    <Icon icon={CloseIcon} size={13} />
  </button>
);

interface AxisChipProps {
  spec: AxisSpec;
  filters: Filters;
  onFilters: (filters: Filters) => void;
  onEdit: () => void;
}

const AxisChip = ({ spec, filters, onFilters, onEdit }: AxisChipProps) => {
  const editing = useRef(false);
  const outKey = AXES[spec.axis];
  const inn = filters[spec.axis];
  const out = filters[outKey];
  const name = spec.fullLabel ?? ((v: string) => v);
  const parts = [...inn.map(name), ...out.map((v) => `not ${name(v)}`)];
  const text =
    parts.slice(0, 2).join(", ") +
    (parts.length > 2 ? ` +${parts.length - 2}` : "");
  const flip =
    out.length === 0
      ? "Exclude instead"
      : inn.length === 0
        ? "Include instead"
        : "Swap include and exclude";
  const remove = () => onFilters({ ...filters, [spec.axis]: [], [outKey]: [] });

  return (
    <span className={CHIP}>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label={`${spec.name}: ${parts.join(", ")}. Filter options`}
            className="flex h-full min-w-0 items-center gap-1 rounded-l-full pl-3 hover:bg-foreground/5"
          >
            <span className="text-muted-foreground">{spec.name}:</span>
            <span
              className={cn("truncate", inn.length === 0 && "text-destructive")}
            >
              {text}
            </span>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          className="w-auto"
          onCloseAutoFocus={(e) => {
            if (!editing.current) return;
            editing.current = false;
            e.preventDefault();
          }}
        >
          <DropdownMenuItem
            onSelect={() => {
              editing.current = true;
              onEdit();
            }}
          >
            Edit {spec.plural.toLowerCase()}
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() =>
              onFilters({ ...filters, [spec.axis]: out, [outKey]: inn })
            }
          >
            {flip}
          </DropdownMenuItem>
          <DropdownMenuItem variant="destructive" onSelect={remove}>
            Remove
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <X label={`Remove ${spec.name.toLowerCase()} filter`} onClick={remove} />
    </span>
  );
};

const PlainChip = ({
  children,
  label,
  onRemove,
}: {
  children: React.ReactNode;
  label: string;
  onRemove: () => void;
}) => (
  <span className={CHIP}>
    <span className="min-w-0 truncate pl-3">{children}</span>
    <X label={label} onClick={onRemove} />
  </span>
);

interface FilterChipsProps {
  view: View;
  specs: AxisSpec[];
  filters: Filters;
  onFilters: (filters: Filters) => void;
  onEdit: (axis: Axis) => void;
}

export const FilterChips = ({
  view,
  specs,
  filters,
  onFilters,
  onEdit,
}: FilterChipsProps) => {
  const axes = specs.filter(
    (s) => filters[s.axis].length + filters[AXES[s.axis]].length > 0,
  );
  const search = filters.search !== "" && !SEARCH_VIEWS.includes(view);
  const count = axes.length + Number(search) + Number(filters.showExcluded);
  if (count === 0) return null;

  return (
    <div className="no-scrollbar -mx-3 flex items-center gap-1.5 overflow-x-auto px-3 sm:mx-0 sm:flex-wrap sm:px-0">
      {axes.map((spec) => (
        <AxisChip
          key={spec.axis}
          spec={spec}
          filters={filters}
          onFilters={onFilters}
          onEdit={() => onEdit(spec.axis)}
        />
      ))}
      {search && (
        <PlainChip
          label="Remove text search"
          onRemove={() => onFilters({ ...filters, search: "" })}
        >
          <span className="text-muted-foreground">Text:</span> “{filters.search}
          ”
        </PlainChip>
      )}
      {filters.showExcluded && (
        <PlainChip
          label="Hide internal transfers"
          onRemove={() => onFilters({ ...filters, showExcluded: false })}
        >
          Internal transfers shown
        </PlainChip>
      )}
      {count > 1 && (
        <Button
          variant="ghost"
          onClick={() => onFilters(clearFilters(filters))}
          className="shrink-0 text-muted-foreground"
        >
          Clear all
        </Button>
      )}
    </div>
  );
};
