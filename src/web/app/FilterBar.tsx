import { Fragment, type ReactNode } from "react";
import { topCategory } from "../../core/items.ts";
import type { Filters } from "../../core/select.ts";
import {
  AXES,
  clearFilters,
  emptyGroup,
  groupsOf,
  NO_COUNTRY,
  pruneGroups,
  withGroupAt,
} from "../../core/select.ts";
import { FilterPanel, type AxisSpec, type Scope } from "./FilterPanel.tsx";
import { categoryLabel, pairLabel, treeLabel } from "./format.ts";
import { AddedIcon, CloseIcon, FilterIcon, Icon } from "./icons.ts";
import type { useFilterOptions } from "./options.ts";
import { Badge } from "./ui/badge.tsx";
import { Button } from "./ui/button.tsx";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover.tsx";
import { Switch } from "./ui/switch.tsx";
import { ToggleGroup, ToggleGroupItem } from "./ui/toggle-group.tsx";
import { cn } from "./ui/utils.ts";

export type View = "transactions" | "overview" | "rules";

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
      axis: "kinds",
      name: "Item category",
      plural: "Item categories",
      options: o.kinds,
      fullLabel: (k) => k.replace("/", " › "),
      subs: (top) => o.kindPairs.filter((p) => topCategory(p) === top),
      subLabel: (k) => k.slice(k.indexOf("/") + 1),
    },
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
  deposit: boolean;
  group: number;
  groups: number;
  onGroup: (group: number) => void;
}

const GroupStrip = ({
  group,
  groups,
  onGroup,
  canAdd,
}: {
  group: number;
  groups: number;
  onGroup: (group: number) => void;
  canAdd: boolean;
}) => (
  <div className="flex items-center gap-1 overflow-x-auto border-b p-1">
    {groups > 1 && (
      <ToggleGroup
        type="single"
        variant="outline"
        size="sm"
        spacing={0}
        value={String(group)}
        onValueChange={(v) => v && onGroup(Number(v))}
        aria-label="Filter group"
      >
        {Array.from({ length: groups }, (_, i) => (
          <ToggleGroupItem
            key={i}
            value={String(i)}
            className="px-2 text-xs pointer-coarse:h-9"
          >
            {i ? `Or ${i + 1}` : "Group 1"}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    )}
    <Button
      variant="ghost"
      size="sm"
      disabled={!canAdd}
      onClick={() => onGroup(groups)}
      className="shrink-0 text-muted-foreground pointer-coarse:h-9"
    >
      <Icon icon={AddedIcon} size={14} />
      Or
    </Button>
    {groups > 1 && (
      <span className="ml-auto min-w-0 truncate pr-2 text-xs text-muted-foreground">
        Any group matches
      </span>
    )}
  </div>
);

export const FilterButton = ({
  specs,
  filters,
  onFilters,
  scope,
  onScope,
  matching,
  count,
  deposit,
  group,
  groups,
  onGroup,
}: FilterButtonProps) => {
  const filled = !emptyGroup(filters);
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
        {(groups > 1 || filled) && (
          <GroupStrip
            group={group}
            groups={groups}
            onGroup={onGroup}
            canAdd={filled}
          />
        )}
        {scope && (
          <FilterPanel
            key={group}
            specs={specs}
            filters={filters}
            onFilters={onFilters}
            scope={scope}
            onScope={onScope}
            matching={matching}
            active={count > 0}
            deposit={deposit}
          />
        )}
      </PopoverContent>
    </Popover>
  );
};

const Chip = ({ children }: { children: ReactNode }) => (
  <Badge
    variant="secondary"
    className="h-8 max-w-full gap-0 overflow-visible rounded-full p-0 text-sm font-normal transition-colors has-[[data-chip=body]:hover]:bg-[color-mix(in_oklch,var(--secondary),var(--foreground)_6%)]"
  >
    {children}
  </Badge>
);

const CHIP_BODY =
  "h-full min-w-0 shrink justify-start gap-1 rounded-none py-0 pr-1 pl-3 font-normal hover:bg-transparent active:not-aria-[haspopup]:translate-y-0 dark:hover:bg-transparent";

const X = ({ label, onClick }: { label: string; onClick: () => void }) => (
  <Button
    variant="ghost"
    size="icon-xs"
    aria-label={label}
    onClick={onClick}
    className="relative mr-1.5 size-5 rounded-full text-muted-foreground after:absolute after:-inset-2 hover:bg-foreground/10 dark:hover:bg-foreground/15"
  >
    <Icon icon={CloseIcon} size={12} />
  </Button>
);

export const activeCount = (specs: AxisSpec[], f: Filters) =>
  groupsOf(f).reduce(
    (n, g) =>
      specs.reduce((m, s) => m + g[s.axis].length + g[AXES[s.axis]].length, n),
    0,
  ) +
  Number(f.showExcluded) +
  Number(f.withReceipt);

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
  const words = [...inn, ...out];
  const sep = (i: number) => (i === 0 ? "" : i < inn.length ? " or " : ", ");
  const not = (i: number) => i >= inn.length;
  const parts = words
    .map((v, i) => `${sep(i)}${not(i) ? "not " : ""}${name(v)}`)
    .join("");

  return (
    <Chip>
      <Button
        variant="ghost"
        data-chip="body"
        onClick={onEdit}
        aria-label={`${spec.name}: ${parts}. Edit`}
        className={CHIP_BODY}
      >
        <span className="text-muted-foreground">{spec.name}:</span>
        <span className="truncate">
          {words.slice(0, 2).map((v, i) => (
            <Fragment key={v}>
              {sep(i)}
              {not(i) && <span className="text-destructive">NOT </span>}
              {name(v)}
            </Fragment>
          ))}
          {words.length > 2 && ` +${words.length - 2}`}
        </span>
      </Button>
      <X
        label={`Remove every ${spec.name.toLowerCase()} filter`}
        onClick={() => onFilters({ ...filters, [spec.axis]: [], [outKey]: [] })}
      />
    </Chip>
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
  <Chip>
    <span className="min-w-0 truncate pr-1 pl-3">{children}</span>
    <X label={label} onClick={onRemove} />
  </Chip>
);

interface FilterChipsProps {
  specs: AxisSpec[];
  filters: Filters;
  onFilters: (filters: Filters) => void;
  onEdit: (group: number, scope: Scope) => void;
}

export const FilterChips = ({
  specs,
  filters,
  onFilters,
  onEdit,
}: FilterChipsProps) => {
  const groups = groupsOf(filters)
    .map((g, i) => ({
      i,
      g,
      axes: specs.filter((s) => g[s.axis].length + g[AXES[s.axis]].length > 0),
    }))
    .filter(({ axes }) => axes.length > 0);
  const chips = groups.reduce((n, { axes }) => n + axes.length, 0);
  const count =
    chips + Number(filters.showExcluded) + Number(filters.withReceipt);
  if (count === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {groups.map(({ i, g, axes }, at) => (
        <Fragment key={i}>
          {at > 0 && (
            <span className="px-0.5 text-xs font-medium text-muted-foreground uppercase">
              or
            </span>
          )}
          {axes.map((spec) => (
            <AxisChip
              key={spec.axis}
              spec={spec}
              filters={g}
              onFilters={(next) =>
                onFilters(pruneGroups(withGroupAt(filters, i, next)))
              }
              onEdit={() => onEdit(i, spec.axis)}
            />
          ))}
        </Fragment>
      ))}
      {chips > 0 && (
        <Button
          variant="ghost"
          aria-label="Add an or group"
          onClick={() => onEdit(filters.or.length + 1, "home")}
          className="shrink-0 text-muted-foreground"
        >
          <Icon icon={AddedIcon} size={15} />
          Or
        </Button>
      )}
      {filters.showExcluded && (
        <PlainChip
          label="Hide internal transfers"
          onRemove={() => onFilters({ ...filters, showExcluded: false })}
        >
          Internal transfers shown
        </PlainChip>
      )}
      {filters.withReceipt && (
        <PlainChip
          label="Show transactions without a receipt"
          onRemove={() => onFilters({ ...filters, withReceipt: false })}
        >
          With receipts
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
