import { useRef, useState, type ReactNode } from "react";
import type { Axis, Filters, PeriodKind } from "../../core/select.ts";
import { AXES, cycleFilter, NO_COUNTRY } from "../../core/select.ts";
import { Picker, useDismiss } from "./FilterPicker.tsx";
import { FilterSummary } from "./FilterSummary.tsx";
import { pairLabel, treeLabel } from "./format.ts";
import { DropdownIcon, Icon } from "./icons.ts";
import { keyboardFocused } from "./Shortcuts.tsx";

export type View = "dashboard" | "transactions" | "rules";

const VIEWS: View[] = ["dashboard", "transactions", "rules"];

interface FilterBarProps {
  view: View;
  onView: (view: View) => void;
  // What the rules page puts where the filters go. This bar knows no rule, so
  // App composes it and hands it over whole.
  tabs: ReactNode;
  months: string[];
  years: string[];
  period: string;
  kind: PeriodKind;
  from: string | null;
  to: string | null;
  earliest: string;
  latest: string;
  onPeriod: (period: string) => void;
  categories: string[];
  subcategories: string[];
  merchants: string[];
  people: ReadonlySet<string>;
  accounts: string[];
  countries: string[];
  filters: Filters;
  onFilters: (filters: Filters) => void;
}

const CONTROL =
  "rounded-md border border-line bg-page px-2 py-1.5 text-[13px] text-ink";

// A phone gives each control of a group an equal share of one line, because
// none of them needs the whole width. Above `sm` the group is only the gap
// between its members, so the bar reads as one row of controls.
const GROUP = "flex flex-wrap items-center gap-2 max-sm:w-full max-sm:*:flex-1";

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const realDate = (d: string): string => {
  const [y, m, day] = d.split("-").map(Number) as [number, number, number];
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return day > last ? `${d.slice(0, 8)}${last}` : d;
};

interface PeriodMenuProps {
  months: string[];
  years: string[];
  period: string;
  kind: PeriodKind;
  from: string | null;
  to: string | null;
  onPeriod: (period: string) => void;
}

const PeriodMenu = ({
  months,
  years,
  period,
  kind,
  from,
  to,
  onPeriod,
}: PeriodMenuProps) => {
  const menu = useRef<HTMLDetailsElement>(null);
  useDismiss(menu);
  const [looking, setLooking] = useState<string | null>(null);

  const inView = kind === "month" || kind === "year" ? period.slice(0, 4) : "";
  const latest = years[years.length - 1] ?? "";
  const shown = looking ?? (inView || latest);
  const has = (m: number) =>
    months.includes(`${shown}-${String(m + 1).padStart(2, "0")}`);

  const choose = (next: string) => {
    onPeriod(next);
    if (menu.current) menu.current.open = false;
  };

  const label =
    kind === "all"
      ? "All time"
      : kind === "custom"
        ? "Custom range"
        : kind === "year"
          ? period
          : `${MONTH_NAMES[Number(period.slice(5)) - 1]} ${period.slice(0, 4)}`;

  const ROW =
    "rounded px-2 py-1 text-left text-[13px] hover:bg-hover disabled:cursor-default disabled:opacity-35 disabled:hover:bg-transparent";
  const ON = "bg-series-1 text-white hover:bg-series-1";

  return (
    <details
      ref={menu}
      className="group relative"
      onToggle={(e) => {
        if (!e.currentTarget.open) setLooking(null);
      }}
    >
      <summary
        className={`${CONTROL} flex list-none items-center gap-1.5 marker:content-none`}
      >
        {label}
        <Icon
          aria-hidden
          icon={DropdownIcon}
          size={14}
          className="shrink-0 text-ink-muted transition-transform group-open:rotate-180"
        />
      </summary>
      <div className="absolute left-0 z-20 mt-1 w-72 rounded-md border border-line bg-surface p-1.5 shadow-lg">
        {/* The two periods that sit inside no year, above the ones that do. */}
        <div className="mb-1.5 flex gap-1 border-b border-line pb-1.5">
          <button
            type="button"
            onClick={() => choose("all")}
            className={`flex-1 ${ROW} ${kind === "all" ? ON : ""}`}
          >
            All time
          </button>
          <button
            type="button"
            onClick={() => choose(`${from ?? ""}..${to ? realDate(to) : ""}`)}
            className={`flex-1 ${ROW} ${kind === "custom" ? ON : ""}`}
          >
            Custom range
          </button>
        </div>

        <div className="flex gap-1.5">
          {/* Newest first: the year you want is nearly always one of the last
              few, and 24 of them the other way round opens the menu two
              decades from anything worth clicking. */}
          <div className="flex max-h-56 w-16 shrink-0 flex-col overflow-y-auto">
            {[...years].reverse().map((y) => (
              <button
                key={y}
                type="button"
                onPointerEnter={() => setLooking(y)}
                onFocus={() => setLooking(y)}
                onClick={() => setLooking(y)}
                aria-expanded={y === shown}
                className={`${ROW} shrink-0 ${y === shown ? "bg-hover font-medium text-ink" : "text-ink-soft"}`}
              >
                {y}
              </button>
            ))}
          </div>

          <div className="min-w-0 flex-1 border-l border-line pl-1.5">
            <button
              type="button"
              onClick={() => choose(shown)}
              className={`mb-1 w-full ${ROW} ${period === shown ? ON : ""}`}
            >
              Whole year
            </button>
            {/* All twelve, disabled where there is nothing — a grid with the
                empty months missing loses the shape that makes it readable at
                a glance. */}
            <div className="grid grid-cols-3 gap-0.5">
              {MONTH_NAMES.map((name, i) => {
                const m = `${shown}-${String(i + 1).padStart(2, "0")}`;
                return (
                  <button
                    key={name}
                    type="button"
                    disabled={!has(i)}
                    onClick={() => choose(m)}
                    aria-label={`${name} ${shown}`}
                    className={`${ROW} text-center ${period === m ? ON : ""}`}
                  >
                    {name.slice(0, 3)}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </details>
  );
};

export const FilterBar = ({
  view,
  onView,
  tabs,
  months,
  years,
  period,
  kind,
  from,
  to,
  earliest,
  latest,
  onPeriod,
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
  const toggleCategory = toggle("categories");

  const subsOf = (category: string) =>
    subcategories.filter(
      (pair) => pair.slice(0, pair.indexOf("/")) === category,
    );
  const toggleMerchant = toggle("merchants");
  const toggleAccount = toggle("accounts");
  const toggleCountry = toggle("countries");

  const labelOf = (axis: Axis, value: string) =>
    axis === "categories"
      ? value.includes("/")
        ? pairLabel(value)
        : treeLabel(value, subsOf(value))
      : axis === "countries" && value === NO_COUNTRY
        ? "No country"
        : value;

  const picked = (Object.entries(AXES) as [Axis, (typeof AXES)[Axis]][]).reduce(
    (n, [key, outKey]) => n + filters[key].length + filters[outKey].length,
    0,
  );

  const active =
    picked + (filters.search !== "" && view !== "transactions" ? 1 : 0);
  const dirty = picked > 0 || filters.search !== "" || filters.showExcluded;

  const Views = () => (
    <div
      role="tablist"
      aria-label="Page"
      className="inline-flex overflow-hidden rounded-md border border-line"
    >
      {VIEWS.map((v, i) => (
        <button
          key={v}
          type="button"
          role="tab"
          aria-selected={view === v}
          tabIndex={view === v ? 0 : -1}
          onClick={() => onView(v)}
          onKeyDown={(e) => {
            const by =
              e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
            if (!by || !keyboardFocused(e.currentTarget)) return;
            e.preventDefault();
            const next = (i + by + VIEWS.length) % VIEWS.length;
            onView(VIEWS[next]!);
            e.currentTarget.parentElement
              ?.querySelectorAll<HTMLButtonElement>("[role=tab]")
              [next]?.focus({ preventScroll: true });
          }}
          className={`px-2 py-1.5 text-[13px] capitalize sm:px-3 ${view === v ? "bg-series-1 text-white" : "bg-page text-ink-soft"}`}
        >
          {v}
        </button>
      ))}
    </div>
  );

  // The rules are not a period and they take no filter. The rule files take
  // the row instead, rather than a line of controls that change nothing on the
  // page below.
  if (view === "rules")
    return (
      <div className="flex flex-wrap items-center gap-2">
        <Views />
        {tabs}
      </div>
    );

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Views />

      {/* One menu: the years, and the months of whichever one is pointed at. */}

      <div className={GROUP}>
        <PeriodMenu
          months={months}
          years={years}
          period={period}
          kind={kind}
          from={from}
          to={to}
          onPeriod={onPeriod}
        />

        {kind === "custom" && (
          <>
            <input
              type="date"
              className={CONTROL}
              value={from ?? ""}
              min={earliest}
              max={to ?? latest}
              onChange={(e) => onPeriod(`${e.target.value}..${to ?? ""}`)}
              aria-label="From"
            />
            <input
              type="date"
              className={CONTROL}
              value={to ?? ""}
              min={from ?? earliest}
              max={latest}
              onChange={(e) => onPeriod(`${from ?? ""}..${e.target.value}`)}
              aria-label="To"
            />
          </>
        )}

        <Picker
          title="Categories"
          options={categories}
          picked={filters.categories}
          excluded={filters.categoriesOut}
          onToggle={toggleCategory}
          label={(c) => treeLabel(c, subsOf(c))}
          subs={subsOf}
          subLabel={pairLabel}
        />

        <Picker
          title="Merchants"
          options={merchants}
          picked={filters.merchants}
          excluded={filters.merchantsOut}
          onToggle={toggleMerchant}
          people={people}
          right
        />
      </div>

      <div className={GROUP}>
        {/* A handful of accounts, so it needs no search box either. */}
        <Picker
          title="Accounts"
          options={accounts}
          picked={filters.accounts}
          excluded={filters.accountsOut}
          onToggle={toggleAccount}
        />

        {/* The dash at the end of the list is a foreign booking that names no
            place, not a row without data — see `NO_COUNTRY`. */}
        <Picker
          title="Countries"
          options={countries}
          picked={filters.countries}
          excluded={filters.countriesOut}
          onToggle={toggleCountry}
          label={(c) => (c === NO_COUNTRY ? "No country" : c)}
          right
        />

        {/* Not a Picker: there is nothing to pick, only whether the flagged rows
            are listed at all. No number moves either way — `stats.ts` has already
            left them out of every sum — so this shows the audit trail, and never
            re-counts a transfer as spending. */}
        <button
          type="button"
          aria-pressed={filters.showExcluded}
          onClick={() =>
            onFilters({ ...filters, showExcluded: !filters.showExcluded })
          }
          className={`${CONTROL} whitespace-nowrap ${filters.showExcluded ? "bg-series-1 text-white" : "text-ink-soft"}`}
        >
          <span className="sm:hidden">Excluded</span>
          <span className="max-sm:hidden">Excluded rows</span>
        </button>
      </div>

      {dirty && (
        <div className="ml-auto max-sm:flex-none">
          <FilterSummary
            filters={filters}
            onFilters={onFilters}
            labelOf={labelOf}
            active={active}
          />
        </div>
      )}
    </div>
  );
};
