/**
 * The one control surface: what period you are looking at, and which categories
 * and merchants are in play.
 *
 * Both lists are picked from a dropdown and removed from chips. The dropdown
 * holds checkboxes rather than being a `<select multiple>`, because ctrl-
 * clicking a multi-select is not something anyone should have to do; the chips
 * exist so an active filter is always visible and always one click from gone —
 * a filter you cannot see is a filter you cannot turn off.
 */
import { useEffect, useRef, useState } from "react";
import type { Filters, Mode, PeriodKind } from "../../core/select.ts";
import { NO_FILTERS } from "../../core/select.ts";
import { categoryLabel } from "./format.ts";
import {
  CloseIcon,
  DropdownIcon,
  Icon,
  ResetFiltersIcon,
  SearchIcon,
} from "./icons.ts";

export type View = "dashboard" | "transactions";

interface FilterBarProps {
  view: View;
  onView: (view: View) => void;
  /** Every `YYYY-MM` and `YYYY` there are rows for; the pickers are built from these. */
  months: string[];
  years: string[];
  /** Both views run on one period, so there is one pair of pickers for it. */
  period: string;
  /** What `period` is, already parsed — the shape of the string, without a second copy of the regexes. */
  kind: PeriodKind;
  onPeriod: (period: string) => void;
  /** Every value the two dropdowns offer, already narrowed to the period. */
  categories: string[];
  merchants: string[];
  filters: Filters;
  onFilters: (filters: Filters) => void;
}

const CONTROL =
  "rounded-md border border-line bg-page px-2 py-1.5 text-[13px] text-ink";

/** Spelled out, because "2026 / 07" beside a year picker reads as a second year. */
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

interface ChipProps {
  label: string;
  /** An excluding chip is doing the opposite of an including one; it should not look identical. */
  tone?: "include" | "exclude";
  onRemove: () => void;
}

/** An active filter, and the way to drop it. */
const Chip = ({ label, tone = "include", onRemove }: ChipProps) => (
  <button
    type="button"
    onClick={onRemove}
    className={`flex items-center gap-1 rounded-full border py-1 pr-1.5 pl-2.5 text-xs text-white ${
      tone === "exclude"
        ? "border-critical-strong bg-critical-strong"
        : "border-series-1 bg-series-1"
    }`}
  >
    {label}
    <Icon
      role="img"
      aria-label={`Remove ${label}`}
      icon={CloseIcon}
      size={12}
      className="shrink-0 opacity-80"
    />
  </button>
);

interface PickerProps {
  /** What the summary says, before the count. */
  title: string;
  /** Everything on offer, in the order it should read. */
  options: string[];
  picked: string[];
  mode: Mode;
  onToggle: (value: string) => void;
  onMode: (mode: Mode) => void;
  /** How an option reads; the values themselves are slugs for categories. */
  label?: (value: string) => string;
  /** For a list too long to scan. Filters the options, nothing else. */
  searchable?: boolean;
}

/**
 * One list, picked from checkboxes, read either as the only rows to show or the
 * only ones to hide. Categories and merchants are the same control over two
 * lists, so they are the same component.
 *
 * ponytail: renders every option, so all-time merchants is a few hundred
 * `<label>` in a scroller. Virtualise only if opening it ever feels slow.
 */
const Picker = ({
  title,
  options,
  picked,
  mode,
  onToggle,
  onMode,
  label = (v) => v,
  searchable,
}: PickerProps) => {
  const [query, setQuery] = useState("");
  /**
   * Which option the arrow keys are on, as an index into `shown`. Null until
   * something puts it somewhere — an untouched list should not open with a row
   * already lit, as if it were hovered.
   */
  const [active, setActive] = useState<number | null>(null);
  const excluding = mode === "exclude";

  /**
   * `details` opens itself and closes itself on its own summary, but nothing
   * else — Escape and a click elsewhere are ours. Open state stays in the DOM
   * rather than in React, so the listeners just read it and set it back.
   */
  const menu = useRef<HTMLDetailsElement>(null);
  const reset = useRef<ReturnType<typeof setTimeout>>(undefined);
  /**
   * A mirror of the DOM's own open flag, kept only so a closed menu can render
   * nothing at all. 668 merchants is 1300-odd elements for React to walk on
   * every keystroke anywhere on the page, and a shut dropdown has no business
   * costing that.
   */
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const close = (e: Event) => {
      const el = menu.current;
      if (!el?.open) return;
      if (e instanceof KeyboardEvent && e.key !== "Escape") return;
      if (e.type === "pointerdown" && el.contains(e.target as Node)) return;
      el.open = false;
    };
    document.addEventListener("keydown", close);
    document.addEventListener("pointerdown", close);
    return () => {
      document.removeEventListener("keydown", close);
      document.removeEventListener("pointerdown", close);
      clearTimeout(reset.current);
    };
  }, []);

  const q = query.trim().toLowerCase();
  // Whatever is checked stays listed however the search box is filtered, or
  // turning a filter off becomes a matter of retyping its name first.
  const shown = q
    ? options.filter(
        (o) => label(o).toLowerCase().includes(q) || picked.includes(o),
      )
    : options;

  // Clamped on read rather than reset on every change: typing shortens the list
  // under the cursor, and the row it was on is not always still there. `-1`
  // matches no row, which is what "nothing is arrowed to" looks like.
  const at = active === null ? -1 : Math.min(active, shown.length - 1);

  /**
   * A closed menu forgets what was typed in it, a few seconds later — long
   * enough that closing it by accident and reopening keeps your place, short
   * enough that coming back to it starts clean rather than on a list narrowed
   * by a search you have forgotten about. Clearing it on the spot would empty
   * the box in plain sight as the menu animates shut.
   */
  const toggled = (e: React.SyntheticEvent<HTMLDetailsElement>) => {
    clearTimeout(reset.current);
    setOpen(e.currentTarget.open);
    if (e.currentTarget.open) return;
    reset.current = setTimeout(() => {
      setQuery("");
      setActive(null);
    }, 3000);
  };

  /**
   * Arrows walk the list and Enter checks what they land on, so a merchant can
   * be searched and picked without the mouse. Only from inside the panel: on the
   * summary the arrows still scroll the page and Enter still opens the menu.
   */
  const navigate = (e: React.KeyboardEvent) => {
    const step = e.key === "ArrowDown" ? 1 : e.key === "ArrowUp" ? -1 : 0;
    if (step) {
      e.preventDefault();
      // Clamped, not wrapped: running off the end of a long list and landing
      // back at the top is a good way to lose track of where you were.
      // From nothing, either arrow lands on the first row rather than off the end.
      setActive(
        at < 0 ? 0 : Math.max(0, Math.min(at + step, shown.length - 1)),
      );
    } else if (e.key === "Enter") {
      // The mode toggle is in here too, and Enter on a button means that button.
      if (e.target instanceof HTMLButtonElement) return;
      // Typing a name and pressing Enter means the one match you typed it for,
      // without arrowing onto it first.
      const i = at < 0 ? 0 : at;
      if (!shown[i]) return;
      e.preventDefault();
      setActive(i);
      onToggle(shown[i]);
    }
  };

  return (
    <details
      ref={menu}
      className="group relative"
      // The panel mounts and unmounts with the menu, so this is what tells React
      // it has opened at all.
      onToggle={toggled}
    >
      {/* The caret is the only thing saying this opens rather than toggles. */}
      <summary
        className={`${CONTROL} flex list-none items-center gap-1.5 marker:content-none`}
      >
        {title}
        {picked.length > 0 && ` (${picked.length})`}
        <Icon
          aria-hidden
          icon={DropdownIcon}
          size={14}
          className="shrink-0 text-ink-muted transition-transform group-open:rotate-180"
        />
      </summary>
      {open && (
        <div
          onKeyDown={navigate}
          className="absolute z-20 mt-1 flex max-h-72 w-64 flex-col rounded-md border border-line bg-surface p-1.5 shadow-lg"
        >
          {/* Same list, read either way round: the only ones to show, or the only
            ones to hide. Both words stay visible so the alternative is never a
            guess, but the whole thing is one button — clicking anywhere on it
            flips, including the half already lit. */}
          <button
            type="button"
            aria-pressed={excluding}
            aria-label={`Exclude the checked ${title.toLowerCase()}`}
            onClick={() => onMode(excluding ? "include" : "exclude")}
            className="mb-1.5 flex w-full shrink-0 overflow-hidden rounded-md border border-line text-xs"
          >
            <span
              className={`flex-1 px-2 py-1 ${excluding ? "bg-page text-ink-soft" : "bg-series-1 text-white"}`}
            >
              Include
            </span>
            <span
              className={`flex-1 px-2 py-1 ${excluding ? "bg-critical-strong text-white" : "bg-page text-ink-soft"}`}
            >
              Exclude
            </span>
          </button>
          {searchable && (
            <div className="relative mb-1.5 shrink-0">
              <Icon
                aria-hidden
                icon={SearchIcon}
                size={14}
                className="pointer-events-none absolute top-1/2 left-2 -translate-y-1/2 text-ink-muted"
              />
              <input
                /* Right this time: the box now mounts with the panel, and opening
                 a searchable list is asking to type in it. */
                autoFocus
                type="search"
                className="w-full rounded-md border border-line bg-page py-1 pr-2 pl-7 text-xs text-ink"
                placeholder={`Search ${title.toLowerCase()}…`}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                aria-label={`Search ${title.toLowerCase()}`}
              />
            </div>
          )}
          {/* Only the list scrolls: the mode toggle and the search box stay put
            rather than sliding away as you scroll past them. */}
          <div className="min-h-0 overflow-y-auto">
            {shown.length === 0 ? (
              <div className="px-1.5 py-1 text-xs text-ink-muted">
                {options.length === 0 ? "Nothing in this period." : "No match."}
              </div>
            ) : (
              shown.map((o, i) => (
                <label
                  key={o}
                  // Keeps the arrowed-to row in the scroller. `nearest` so it only
                  // moves when the row is actually out of sight.
                  ref={
                    i === at
                      ? (el) => el?.scrollIntoView({ block: "nearest" })
                      : undefined
                  }
                  className={`flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-[13px] hover:bg-hover ${i === at ? "bg-hover" : ""}`}
                >
                  <input
                    type="checkbox"
                    className="shrink-0"
                    checked={picked.includes(o)}
                    onChange={() => onToggle(o)}
                    // The arrows own the highlight, so a row reached by tabbing
                    // moves it rather than leaving two rows looking active.
                    onFocus={() => setActive(i)}
                  />
                  {label(o)}
                </label>
              ))
            )}
          </div>
        </div>
      )}
    </details>
  );
};

export const FilterBar = ({
  view,
  onView,
  months,
  years,
  period,
  kind,
  onPeriod,
  categories,
  merchants,
  filters,
  onFilters,
}: FilterBarProps) => {
  // A month period is a year with a month in it, so the year picker reads the
  // front of the same string rather than being state of its own — two selects,
  // still one value, and nothing to keep in sync.
  const year = kind === "all" ? period : period.slice(0, 4);
  const monthsOfYear = months.filter((m) => m.startsWith(`${year}-`));

  /**
   * Changing the year keeps the month when the new year has one, so stepping
   * back a year lands on the same month rather than dumping you at the top of
   * it. All time has no month at all and is passed straight through.
   */
  const changeYear = (next: string) => {
    if (!years.includes(next)) return onPeriod(next);
    const mm = kind === "month" ? period.slice(5) : "";
    onPeriod(mm && months.includes(`${next}-${mm}`) ? `${next}-${mm}` : next);
  };

  const toggleCategory = (cat: string) =>
    onFilters({
      ...filters,
      categories: filters.categories.includes(cat)
        ? filters.categories.filter((c) => c !== cat)
        : [...filters.categories, cat],
    });

  const toggleMerchant = (m: string) =>
    onFilters({
      ...filters,
      merchants: filters.merchants.includes(m)
        ? filters.merchants.filter((x) => x !== m)
        : [...filters.merchants, m],
    });

  const excluding = filters.categoryMode === "exclude";
  const excludingMerchants = filters.merchantMode === "exclude";

  // The search box is on the transactions table, in plain sight — a chip for it
  // there would only be a second copy that shoves the page down as you type.
  const searchChip = filters.search !== "" && view !== "transactions";
  const picked = filters.categories.length + filters.merchants.length;
  const chips = picked > 0 || searchChip;
  const dirty =
    picked > 0 ||
    filters.search !== "" ||
    excluding ||
    excludingMerchants ||
    filters.showExcluded;

  return (
    <div className="mb-5 flex flex-wrap items-center gap-2 rounded-[10px] border border-line bg-surface px-3 py-2.5">
      <div className="inline-flex overflow-hidden rounded-md border border-line">
        {(["dashboard", "transactions"] as const).map((v) => (
          <button
            key={v}
            type="button"
            aria-pressed={view === v}
            onClick={() => onView(v)}
            className={`px-3 py-1.5 text-[13px] capitalize ${view === v ? "bg-series-1 text-white" : "bg-page text-ink-soft"}`}
          >
            {v}
          </button>
        ))}
      </div>

      {/* Year, then month within it. One list of every month would grow a row
          per month forever; these two stay twelve long and three long however
          many years pile up. */}
      <select
        className={CONTROL}
        value={year}
        onChange={(e) => changeYear(e.target.value)}
        aria-label="Year"
      >
        {/* Above the group, not in it — all time is not one of the years, and
            it is the only period that is not inside one. */}
        <option value="all">All time</option>
        <optgroup label="Years">
          {years.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </optgroup>
      </select>

      {/* All time is not inside a year, so there is no month to pick. */}
      {kind !== "all" && (
        <select
          className={CONTROL}
          value={kind === "month" ? period : ""}
          onChange={(e) => onPeriod(e.target.value || year)}
          aria-label="Month"
        >
          {/* The empty value is the year itself — the whole of it is what you
              get by not narrowing to a month, not a separate kind of period. */}
          <option value="">-</option>
          {monthsOfYear.map((m) => (
            <option key={m} value={m}>
              {MONTH_NAMES[Number(m.slice(5)) - 1]}
            </option>
          ))}
        </select>
      )}

      <Picker
        title="Categories"
        options={categories}
        picked={filters.categories}
        mode={filters.categoryMode}
        onToggle={toggleCategory}
        onMode={(categoryMode) => onFilters({ ...filters, categoryMode })}
        label={categoryLabel}
      />

      {/* Searchable, and the categories one is not: there are a dozen categories
          and several hundred merchants. */}
      <Picker
        searchable
        title="Merchants"
        options={merchants}
        picked={filters.merchants}
        mode={filters.merchantMode}
        onToggle={toggleMerchant}
        onMode={(merchantMode) => onFilters({ ...filters, merchantMode })}
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
        className={`${CONTROL} ${filters.showExcluded ? "bg-series-1 text-white" : "text-ink-soft"}`}
      >
        Excluded rows
      </button>

      {dirty && (
        <button
          type="button"
          onClick={() => onFilters(NO_FILTERS)}
          className="ml-auto flex items-center gap-1.5 rounded-md border border-line px-2.5 py-1.5 text-xs text-ink-muted"
        >
          <Icon aria-hidden icon={ResetFiltersIcon} size={14} />
          Reset filters
        </button>
      )}

      {chips && (
        <div
          className="flex basis-full flex-wrap gap-1.5"
          role="group"
          aria-label="Active filters"
        >
          {/* The mode is invisible once the menu closes, so the chips carry it. */}
          {filters.categories.map((c) => (
            <Chip
              key={c}
              label={excluding ? `Not ${categoryLabel(c)}` : categoryLabel(c)}
              tone={excluding ? "exclude" : "include"}
              onRemove={() => toggleCategory(c)}
            />
          ))}
          {filters.merchants.map((m) => (
            <Chip
              key={m}
              label={excludingMerchants ? `Not ${m}` : m}
              tone={excludingMerchants ? "exclude" : "include"}
              onRemove={() => toggleMerchant(m)}
            />
          ))}
          {/* On the dashboards there is no search box, so without this a search
              set from a bar click would be a filter with nothing to clear it. */}
          {searchChip && (
            <Chip
              label={`“${filters.search}”`}
              onRemove={() => onFilters({ ...filters, search: "" })}
            />
          )}
        </div>
      )}
    </div>
  );
};
