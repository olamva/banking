import type { Axis, Filters } from "../../core/select.ts";
import {
  axisPairs,
  cycleFilter,
  NO_COUNTRY,
  NO_FILTERS,
} from "../../core/select.ts";
import { Picker } from "./FilterPicker.tsx";
import { pairLabel, treeLabel } from "./format.ts";
import { CloseIcon, DropdownIcon, Icon, ResetFiltersIcon } from "./icons.ts";
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

interface SettingsProps {
  filters: Filters;
  onFilters: (filters: Filters) => void;
  className?: string;
}

const Settings = ({ filters, onFilters, className }: SettingsProps) => {
  const count = Number(filters.showExcluded) + Number(filters.withoutDeposit);
  const rows: [string, boolean, (on: boolean) => Filters][] = [
    [
      "Show excluded rows",
      filters.showExcluded,
      (showExcluded) => ({ ...filters, showExcluded }),
    ],
    [
      "Include deposit in item prices",
      !filters.withoutDeposit,
      (on) => ({ ...filters, withoutDeposit: !on }),
    ],
  ];
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={cn("justify-between font-normal", className)}
        >
          Settings
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
        className="w-[min(18rem,calc(100vw-1.5rem))] gap-0 p-1"
      >
        {rows.map(([label, checked, next]) => (
          <label
            key={label}
            className="flex cursor-pointer items-center justify-between gap-3 rounded-md px-2 py-2 text-sm hover:bg-muted"
          >
            {label}
            <Switch
              checked={checked}
              onCheckedChange={(on) => onFilters(next(on))}
            />
          </label>
        ))}
      </PopoverContent>
    </Popover>
  );
};

interface FilterBarProps {
  view: View;
  categories: string[];
  subcategories: string[];
  merchants: string[];
  items: string[];
  people: ReadonlySet<string>;
  accounts: string[];
  countries: string[];
  filters: Filters;
  onFilters: (filters: Filters) => void;
}

const AXIS_NAME: Record<Axis, string> = {
  categories: "Category",
  merchants: "Merchant",
  items: "Item",
  accounts: "Account",
  countries: "Country",
};

interface ChipProps {
  axis: string;
  text: string;
  out?: boolean;
  onRemove: () => void;
}

const Chip = ({ axis, text, out, onRemove }: ChipProps) => (
  <Badge
    asChild
    variant={out ? "destructive" : "secondary"}
    className="h-6 max-w-full cursor-pointer gap-1 pr-0.5 pl-2 font-normal"
  >
    <button
      type="button"
      onClick={onRemove}
      aria-label={`Remove ${out ? "exclusion " : ""}${text}`}
    >
      <span className="opacity-70">{axis}:</span>
      {out && <span className="font-medium">not</span>}
      <span className={cn("truncate", out && "line-through")}>{text}</span>
      <span className="flex size-5 shrink-0 items-center justify-center rounded-full opacity-70 group-hover/badge:bg-foreground/10 group-hover/badge:opacity-100">
        <Icon icon={CloseIcon} size={12} />
      </span>
    </button>
  </Badge>
);

export const FilterBar = ({
  view,
  categories,
  subcategories,
  merchants,
  items,
  people,
  accounts,
  countries,
  filters,
  onFilters,
}: FilterBarProps) => {
  const toggle = (key: Axis) => (value: string, exclude: boolean) =>
    onFilters(cycleFilter(filters, key, value, exclude));

  const subsOf = (category: string) =>
    subcategories.filter(
      (pair) => pair.slice(0, pair.indexOf("/")) === category,
    );

  const labelOf = (axis: Axis, value: string) =>
    axis === "categories"
      ? value.includes("/")
        ? pairLabel(value)
        : treeLabel(value, subsOf(value))
      : axis === "countries" && value === NO_COUNTRY
        ? "No country"
        : value;

  const chips = axisPairs().flatMap(([key, outKey]) => [
    ...filters[key].map((v) => ({ key, list: key, v, out: false })),
    ...filters[outKey].map((v) => ({ key, list: outKey, v, out: true })),
  ]);
  const searchChip = filters.search !== "" && !SEARCH_VIEWS.includes(view);
  const dirty =
    chips.length > 0 ||
    filters.search !== "" ||
    filters.showExcluded ||
    filters.withoutDeposit;
  const PICKER = "max-sm:flex-1 max-sm:basis-[calc(50%-0.25rem)]";

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <Picker
          title="Categories"
          options={categories}
          picked={filters.categories}
          excluded={filters.categoriesOut}
          onToggle={toggle("categories")}
          label={(c) => treeLabel(c, subsOf(c))}
          subs={subsOf}
          subLabel={pairLabel}
          className={PICKER}
        />
        <Picker
          title="Merchants"
          options={merchants}
          picked={filters.merchants}
          excluded={filters.merchantsOut}
          onToggle={toggle("merchants")}
          people={people}
          className={PICKER}
        />
        <Picker
          title="Items"
          options={items}
          picked={filters.items}
          excluded={filters.itemsOut}
          onToggle={toggle("items")}
          className={PICKER}
        />
        <Picker
          title="Accounts"
          options={accounts}
          picked={filters.accounts}
          excluded={filters.accountsOut}
          onToggle={toggle("accounts")}
          className={PICKER}
        />
        <Picker
          title="Countries"
          options={countries}
          picked={filters.countries}
          excluded={filters.countriesOut}
          onToggle={toggle("countries")}
          label={(c) => (c === NO_COUNTRY ? "No country" : c)}
          className={PICKER}
        />
        <Settings filters={filters} onFilters={onFilters} className={PICKER} />
        <Button
          variant="ghost"
          disabled={!dirty}
          onClick={() => onFilters(NO_FILTERS)}
          className={cn(
            PICKER,
            "text-muted-foreground",
            !dirty && "invisible max-sm:hidden",
          )}
        >
          <Icon icon={ResetFiltersIcon} size={15} />
          Reset
        </Button>
      </div>
      {(chips.length > 0 || searchChip) && (
        <div className="flex flex-wrap items-center gap-1.5">
          {chips.map(({ key, list, v, out }) => (
            <Chip
              key={`${key}:${out}:${v}`}
              axis={AXIS_NAME[key]}
              text={labelOf(key, v)}
              out={out}
              onRemove={() =>
                onFilters({
                  ...filters,
                  [list]: filters[list].filter((x) => x !== v),
                })
              }
            />
          ))}
          {searchChip && (
            <Chip
              axis="Search"
              text={filters.search}
              onRemove={() => onFilters({ ...filters, search: "" })}
            />
          )}
        </div>
      )}
    </div>
  );
};
