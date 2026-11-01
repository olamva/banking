import type { Axis, Filters } from "../../core/select.ts";
import {
  axisPairs,
  cycleFilter,
  NO_COUNTRY,
  NO_FILTERS,
} from "../../core/select.ts";
import { Picker } from "./FilterPicker.tsx";
import { pairLabel, treeLabel } from "./format.ts";
import {
  CloseIcon,
  Icon,
  ResetFiltersIcon,
  ShowExcludedIcon,
} from "./icons.ts";
import { Badge } from "./ui/badge.tsx";
import { Button } from "./ui/button.tsx";
import { Toggle } from "./ui/toggle.tsx";
import { cn } from "./ui/utils.ts";

export type View = "dashboard" | "insights" | "transactions" | "rules";

interface FilterBarProps {
  view: View;
  categories: string[];
  subcategories: string[];
  merchants: string[];
  people: ReadonlySet<string>;
  accounts: string[];
  countries: string[];
  filters: Filters;
  onFilters: (filters: Filters) => void;
}

const AXIS_NAME: Record<Axis, string> = {
  categories: "Category",
  merchants: "Merchant",
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
    variant={out ? "destructive" : "secondary"}
    className="h-6 max-w-full gap-1 pr-0.5 pl-2 font-normal"
  >
    <span className="opacity-70">{axis}:</span>
    {out && <span className="font-medium">not</span>}
    <span className={cn("truncate", out && "line-through")}>{text}</span>
    <button
      type="button"
      onClick={onRemove}
      aria-label={`Remove ${out ? "exclusion " : ""}${text}`}
      className="flex size-5 shrink-0 items-center justify-center rounded-full opacity-70 hover:bg-foreground/10 hover:opacity-100"
    >
      <Icon icon={CloseIcon} size={12} />
    </button>
  </Badge>
);

export const FilterBar = ({
  view,
  categories,
  subcategories,
  merchants,
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
  const searchChip = filters.search !== "" && view !== "transactions";
  const dirty =
    chips.length > 0 || filters.search !== "" || filters.showExcluded;
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
        <Toggle
          variant="outline"
          pressed={filters.showExcluded}
          onPressedChange={(showExcluded) =>
            onFilters({ ...filters, showExcluded })
          }
          className="font-normal max-sm:flex-1 data-[state=on]:border-primary data-[state=on]:bg-primary data-[state=on]:text-primary-foreground"
        >
          <Icon icon={ShowExcludedIcon} size={15} />
          Excluded rows
        </Toggle>
        {dirty && (
          <Button
            variant="ghost"
            onClick={() => onFilters(NO_FILTERS)}
            className="text-muted-foreground max-sm:flex-1"
          >
            <Icon icon={ResetFiltersIcon} size={15} />
            Reset
          </Button>
        )}
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
