import type { ReactNode } from "react";
import type { Axis, Filters } from "../../core/select.ts";
import { AXES, clearFilters, NO_COUNTRY } from "../../core/select.ts";
import { FilterPanel, type AxisSpec, type Scope } from "./FilterPanel.tsx";
import { categoryLabel, pairLabel, treeLabel } from "./format.ts";
import { CloseIcon, FilterIcon, Icon } from "./icons.ts";
import type { useFilterOptions } from "./options.ts";
import { Badge } from "./ui/badge.tsx";
import { Button } from "./ui/button.tsx";
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
  const tree = (c: string) => treeLabel(c, subsOf(c));
  const specs: Omit<AxisSpec, "uses">[] = [
    {
      axis: "categories",
      name: "Category",
      plural: "Categories",
      options: o.categories.toSorted((a, b) => tree(a).localeCompare(tree(b))),
      label: tree,
      fullLabel: (c) =>
        c.includes("/")
          ? `${categoryLabel(c.slice(0, c.indexOf("/")))} › ${pairLabel(c)}`
          : tree(c),
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
  return specs.map((s) => ({ ...s, uses: o.uses[s.axis] }));
};

interface FilterButtonProps {
  specs: AxisSpec[];
  filters: Filters;
  onFilters: (filters: Filters) => void;
  scope: Scope | null;
  onScope: (scope: Scope | null) => void;
  matching: number;
  count: number;
}

export const FilterButton = ({
  specs,
  filters,
  onFilters,
  scope,
  onScope,
  matching,
  count,
}: FilterButtonProps) => {
  return (
    <Popover
      open={scope !== null}
      onOpenChange={(open) => onScope(open ? "home" : null)}
    >
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          aria-label={count ? `Filter, ${count} active` : "Filter"}
          className="relative shrink-0 after:absolute after:inset-x-0 after:-inset-y-1.5"
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
            active={count > 0}
          />
        )}
      </PopoverContent>
    </Popover>
  );
};

const CHIP =
  "inline-flex h-8 max-w-full shrink-0 items-center rounded-full bg-secondary text-sm text-secondary-foreground";

const CHIP_BODY =
  "flex h-full min-w-0 items-center gap-1 rounded-l-full pl-3 hover:bg-foreground/5";

const X = ({ label, onClick }: { label: string; onClick: () => void }) => (
  <button
    type="button"
    aria-label={label}
    onClick={onClick}
    className="relative flex size-8 shrink-0 items-center justify-center rounded-full text-muted-foreground after:absolute after:-inset-1.5 hover:bg-foreground/10 hover:text-foreground"
  >
    <Icon icon={CloseIcon} size={13} />
  </button>
);

export const activeCount = (specs: AxisSpec[], f: Filters, view: View) =>
  specs.reduce((n, s) => n + f[s.axis].length + f[AXES[s.axis]].length, 0) +
  Number(f.search !== "" && !SEARCH_VIEWS.includes(view)) +
  Number(f.showExcluded);

interface AxisChipProps {
  spec: AxisSpec;
  filters: Filters;
  onFilters: (filters: Filters) => void;
  onEdit: () => void;
}

const AxisChip = ({ spec, filters, onFilters, onEdit }: AxisChipProps) => {
  const outKey = AXES[spec.axis];
  const inn = filters[spec.axis];
  const out = filters[outKey];
  const name = spec.fullLabel ?? ((v: string) => v);
  const words = [...inn.map(name), ...out.map((v) => `not ${name(v)}`)];
  const join = (list: string[]) =>
    list.reduce((s, w, i) => `${s}${i < inn.length ? " or " : ", "}${w}`);
  const parts = join(words);
  const text =
    join(words.slice(0, 2)) + (words.length > 2 ? ` +${words.length - 2}` : "");

  return (
    <span className={CHIP}>
      <button
        type="button"
        onClick={onEdit}
        aria-label={`${spec.name}: ${parts}. Edit`}
        className={CHIP_BODY}
      >
        <span className="text-muted-foreground">{spec.name}:</span>
        <span
          className={cn("truncate", inn.length === 0 && "text-destructive")}
        >
          {text}
        </span>
      </button>
      <X
        label={`Remove every ${spec.name.toLowerCase()} filter`}
        onClick={() => onFilters({ ...filters, [spec.axis]: [], [outKey]: [] })}
      />
    </span>
  );
};

const PlainChip = ({
  children,
  label,
  onRemove,
}: {
  children: ReactNode;
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
    <div className="flex flex-wrap items-center gap-1.5">
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
