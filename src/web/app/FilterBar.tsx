/**
 * The one control surface: what period you are looking at, and which categories
 * and merchants are in play.
 *
 * Both lists are picked from a dropdown, which holds checkboxes rather than
 * being a `<select multiple>` — ctrl-clicking a multi-select is not something
 * anyone should have to do.
 *
 * What is on is a count, not a row of chips: ten active filters wrapped onto
 * three lines and pushed the dashboard down the page, which is the opposite of
 * what a filter bar is for. The count says how many; the pickers say which, and
 * are where one is turned off again.
 */
import { useEffect, useRef, useState } from "react";
import type { Axis, Filters, Mode, PeriodKind } from "../../core/select.ts";
import { NO_FILTERS } from "../../core/select.ts";
import { pairLabel, treeLabel } from "./format.ts";
import {
  DropdownIcon,
  ExpandIcon,
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
  /** Its bounds, already parsed too — what the date boxes show, and what a range switched into starts as. */
  from: string | null;
  to: string | null;
  onPeriod: (period: string) => void;
  /** Every value the two dropdowns offer, already narrowed to the period. */
  categories: string[];
  /** `category/sub` pairs, which the categories dropdown opens into. */
  subcategories: string[];
  merchants: string[];
  accounts: string[];
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

/**
 * A real date, for the date boxes. A month's upper bound is `YYYY-MM-31`
 * whatever the month has in it — deliberate, since it is only ever compared as
 * a string — and `<input type="date">` shows nothing at all for one that never
 * existed, so switching June into a range would open with an empty end.
 */
const realDate = (d: string): string => {
  const [y, m, day] = d.split("-").map(Number) as [number, number, number];
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return day > last ? `${d.slice(0, 8)}${last}` : d;
};

/**
 * Escape, and a click anywhere outside, close a `details` menu. Its own
 * behaviour covers the summary and nothing else, and both menus on this bar
 * want the same two — so it is one hook rather than the same effect twice.
 *
 * Open state stays in the DOM rather than in React: this reads the flag and
 * sets it back.
 */
const useDismiss = (menu: React.RefObject<HTMLDetailsElement | null>) => {
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
    };
  }, [menu]);
};

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
  /**
   * The level below an option, making this a tree rather than a list.
   *
   * Children go into the **same** `picked` list as their parents and through
   * the same `onToggle` — one axis, so ticking a category and a subcategory of
   * some other category is a union rather than an intersection of nothing.
   *
   * A row with two or more children opens; a row with one is that child under
   * another name, so it stays a single row and `label` is what renames it.
   */
  subs?: (option: string) => string[];
  subLabel?: (value: string) => string;
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
  subs,
  subLabel = (v) => v,
}: PickerProps) => {
  const [query, setQuery] = useState("");
  /** Which options are opened into their children. Nothing is open to begin with. */
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  /**
   * Which option the arrow keys are on, as an index into `shown`. Null until
   * something puts it somewhere — an untouched list should not open with a row
   * already lit, as if it were hovered.
   */
  const [active, setActive] = useState<number | null>(null);
  const excluding = mode === "exclude";

  const menu = useRef<HTMLDetailsElement>(null);
  const reset = useRef<ReturnType<typeof setTimeout>>(undefined);
  /**
   * A mirror of the DOM's own open flag, kept only so a closed menu can render
   * nothing at all. 668 merchants is 1300-odd elements for React to walk on
   * every keystroke anywhere on the page, and a shut dropdown has no business
   * costing that.
   */
  const [open, setOpen] = useState(false);
  useDismiss(menu);
  // The search box's own delayed reset, which outlives an unmount otherwise.
  useEffect(() => () => clearTimeout(reset.current), []);

  const q = query.trim().toLowerCase();
  const childrenOf = (o: string) => subs?.(o) ?? [];
  const hitsQuery = (name: string) => name.toLowerCase().includes(q);

  // Whatever is checked stays listed however the search box is filtered, or
  // turning a filter off becomes a matter of retyping its name first. A parent
  // whose *child* matches stays too — searching for a subcategory that finds
  // nothing because its category is spelled differently is not a search.
  const shown = q
    ? options.filter(
        (o) =>
          hitsQuery(label(o)) ||
          picked.includes(o) ||
          childrenOf(o).some(
            (c) => hitsQuery(subLabel(c)) || picked.includes(c),
          ),
      )
    : options;

  /**
   * The flat list the arrow keys actually walk: every shown option, with the
   * children of the opened ones spliced in beneath their parent.
   *
   * Flat on purpose — the keyboard, the highlight and Enter all index into one
   * array, so opening a category needs no second notion of "where am I".
   */
  const rows = shown.flatMap((o) => {
    const all = childrenOf(o);
    // A search narrows the children too. Listing all of them because *one*
    // matched is what made searching "vennebetaling" show every child of
    // `diverse` — the row you asked for, buried among seven you did not.
    // Whatever is checked stays, for the same reason it does at the top level.
    const kids =
      q === ""
        ? all
        : all.filter((c) => hitsQuery(subLabel(c)) || picked.includes(c));
    // A search that matched a child opens its parent: the row you were looking
    // for should be on screen, not one click behind a triangle. A parent that
    // matched on its *own* name keeps its children folded away.
    const openHere = expanded.has(o) || kids.length < all.length;
    // One *named* child is the same rows under a better name, so the row becomes
    // that child rather than opening onto it. A lone unnamed child is not a
    // better name — `vipps` would read as "Annet" — so those keep the parent.
    const lone = all.length === 1 && !all[0]!.endsWith("/") ? all[0]! : null;
    const parent = { value: lone ?? o, sub: false };
    return kids.length > 1 && openHere
      ? [parent, ...kids.map((c) => ({ value: c, sub: true }))]
      : kids.length === 1 && openHere
        ? [parent, { value: kids[0]!, sub: true }]
        : [parent];
  });

  // Clamped on read rather than reset on every change: typing shortens the list
  // under the cursor, and the row it was on is not always still there. `-1`
  // matches no row, which is what "nothing is arrowed to" looks like.
  const at = active === null ? -1 : Math.min(active, rows.length - 1);

  const toggleOpen = (o: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (!next.delete(o)) next.add(o);
      return next;
    });

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
    // Space opens and closes the row the arrows are on. Only once something is
    // arrowed to: focus lives in the search box, so before that a space is
    // someone typing "kafe og restaurant" and must stay one. Typing clears the
    // highlight, so the two never fight over the same keystroke.
    if (e.key === " " && at >= 0) {
      const row = rows[at];
      if (row && !row.sub && childrenOf(row.value).length > 1) {
        e.preventDefault();
        toggleOpen(row.value);
        return;
      }
    }
    // Left and right do it too, which is what a tree does everywhere else.
    if ((e.key === "ArrowRight" || e.key === "ArrowLeft") && at >= 0) {
      const row = rows[at];
      if (row && !row.sub && childrenOf(row.value).length > 1) {
        e.preventDefault();
        if (expanded.has(row.value) === (e.key === "ArrowLeft"))
          toggleOpen(row.value);
        return;
      }
    }
    if (step) {
      e.preventDefault();
      // Clamped, not wrapped: running off the end of a long list and landing
      // back at the top is a good way to lose track of where you were.
      // From nothing, either arrow lands on the first row rather than off the end.
      setActive(at < 0 ? 0 : Math.max(0, Math.min(at + step, rows.length - 1)));
    } else if (e.key === "Enter") {
      // The mode toggle is in here too, and Enter on a button means that button.
      if (e.target instanceof HTMLButtonElement) return;
      // Typing a name and pressing Enter means the one match you typed it for,
      // without arrowing onto it first.
      const i = at < 0 ? 0 : at;
      const row = rows[i];
      if (!row) return;
      e.preventDefault();
      setActive(i);
      onToggle(row.value);
    }
  };

  return (
    <details
      ref={menu}
      /*
       * Full width below `sm`, which is about the *panel* rather than the
       * summary. The panel is absolutely positioned against this element, so
       * wherever the summary happens to wrap to is where 256px of menu starts —
       * a picker that landed halfway along the row hung its panel off the right
       * edge and gave the whole page a sideways scroll. Full width anchors it to
       * the left of the bar, where it always fits.
       */
      className="group relative max-sm:w-full"
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
          /* No `max-w-full`: the containing block is the `details`, which is
             only as wide as its own summary above `sm` — so it clamped a 256px
             panel down to a 130px button and truncated every row in it. Below
             `sm` the `details` is full width, which is what already keeps this
             on the page; there is nothing left for a max-width to save. */
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
          {/* Always, not just for the long lists. It is also what gives the
              panel focus on open, and the arrow keys only reach the list from
              inside the panel — without it the categories menu opened with focus
              still on the summary and the arrows scrolled the page instead. */}
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
              onChange={(e) => {
                setQuery(e.target.value);
                // The list changes under the cursor, so the row it was on is
                // no longer the row you meant — and it hands space back to the
                // box you are typing in.
                setActive(null);
              }}
              aria-label={`Search ${title.toLowerCase()}`}
            />
          </div>
          {/* Only the list scrolls: the mode toggle and the search box stay put
            rather than sliding away as you scroll past them. */}
          <div className="min-h-0 overflow-y-auto">
            {rows.length === 0 ? (
              <div className="px-1.5 py-1 text-xs text-ink-muted">
                {options.length === 0 ? "Nothing in this period." : "No match."}
              </div>
            ) : (
              rows.map((row, i) => {
                const kids = row.sub ? [] : childrenOf(row.value);
                const openHere = expanded.has(row.value);
                return (
                  <div
                    key={`${row.sub ? "sub:" : ""}${row.value}`}
                    className="flex items-center"
                  >
                    {row.sub ? (
                      // Two spacers, so a child lines up under its parent's label
                      // rather than under its triangle.
                      <span className="w-6.5 shrink-0" />
                    ) : kids.length > 1 ? (
                      <button
                        type="button"
                        // Not inside the label: clicking a disclosure must not
                        // also tick the box it sits next to.
                        onClick={() => toggleOpen(row.value)}
                        aria-expanded={openHere}
                        aria-label={`${openHere ? "Hide" : "Show"} ${label(row.value)} subcategories`}
                        /* 13px wide is a column, not a target. The pseudo-element
                           widens what a finger has to hit to ~29x40 without
                           moving the triangle or the label lined up beside it. */
                        className="relative flex h-6 w-3.25 shrink-0 items-center justify-center text-ink-muted before:absolute before:-inset-2 before:content-[''] hover:text-ink"
                      >
                        <Icon
                          aria-hidden
                          icon={ExpandIcon}
                          size={12}
                          className={`transition-transform ${openHere ? "rotate-90" : ""}`}
                        />
                      </button>
                    ) : (
                      // Holds the column so every label starts at the same x.
                      <span className="w-3.25 shrink-0" />
                    )}
                    <label
                      // Keeps the arrowed-to row in the scroller. `nearest` so it only
                      // moves when the row is actually out of sight.
                      ref={
                        i === at
                          ? (el) => el?.scrollIntoView({ block: "nearest" })
                          : undefined
                      }
                      className={`flex min-w-0 flex-1 cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-[13px] hover:bg-hover ${i === at ? "bg-hover" : ""} ${row.sub ? "text-ink-soft" : ""}`}
                    >
                      <input
                        type="checkbox"
                        className="shrink-0"
                        checked={picked.includes(row.value)}
                        onChange={() => onToggle(row.value)}
                        // The arrows own the highlight, so a row reached by tabbing
                        // moves it rather than leaving two rows looking active.
                        onFocus={() => setActive(i)}
                      />
                      <span className="truncate">
                        {row.sub || row.value.includes("/")
                          ? subLabel(row.value)
                          : label(row.value)}
                      </span>
                    </label>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </details>
  );
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

/**
 * The period, as one menu rather than two selects: years down the left, the
 * months of one of them across the right.
 *
 * Two selects meant picking a year to see its months, and the record now
 * reaches back to 2003 — 24 years against 12 months is a lopsided pair of
 * lists, and the second one always told you less than it had room for. Here
 * both are on screen at once and the year is a pointer at the month grid rather
 * than a separate choice to make first.
 *
 * **A year is opened by hovering it and also by tapping it**, which is the
 * whole of what makes this work on a phone: a tap on a year fills the grid
 * beside it and selects nothing, so the second tap is always the one that
 * decides. `Whole year` at the top of the grid is how a year is still a period
 * of its own — the empty option in the old month select, given a name.
 */
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
  /**
   * Which year's months are on show. Null is "the one in view", so the menu
   * always opens on the period you are already looking at, and pointing at
   * another year is a look rather than a change — it is cleared when the menu
   * shuts, not when something is picked.
   */
  const [looking, setLooking] = useState<string | null>(null);

  // All time and a hand-picked range sit in no year, so there is none in view to
  // open on — the latest on record is where the page itself opens, and an empty
  // grid beside a list of years is a menu that looks broken.
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

  /** One row of the menu, whichever column it is in. */
  const ROW =
    "rounded px-2 py-1 text-left text-[13px] hover:bg-hover disabled:cursor-default disabled:opacity-35 disabled:hover:bg-transparent";
  const ON = "bg-series-1 text-white hover:bg-series-1";

  return (
    <details
      ref={menu}
      // Same anchoring as the pickers: the panel is positioned against this, so
      // below `sm` it has to be the full width of the bar or it hangs off the
      // right edge from wherever the summary wrapped to.
      className="group relative max-sm:w-full"
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
      <div className="absolute z-20 mt-1 w-72 rounded-md border border-line bg-surface p-1.5 shadow-lg max-sm:w-full">
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
            // Opens on the window already in view, so narrowing a month to a
            // few days of it is two edits and not four.
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
                // Hover is the shortcut and the tap is the route: both only
                // point the grid at a year, so neither can pick one by accident.
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
  months,
  years,
  period,
  kind,
  from,
  to,
  onPeriod,
  categories,
  subcategories,
  merchants,
  accounts,
  filters,
  onFilters,
}: FilterBarProps) => {
  /** Ticking a box in any of the three menus is the same edit over a different pair of fields. */
  const toggle = (key: Axis) => (value: string) =>
    onFilters({
      ...filters,
      [key]: filters[key].includes(value)
        ? filters[key].filter((x) => x !== value)
        : [...filters[key], value],
    });
  const toggleCategory = toggle("categories");

  // A pair is `category/sub`, so its own category is its prefix — no second
  // grouping to keep in step with the list the picker was handed.
  const subsOf = (category: string) =>
    subcategories.filter(
      (pair) => pair.slice(0, pair.indexOf("/")) === category,
    );
  const toggleMerchant = toggle("merchants");
  const toggleAccount = toggle("accounts");

  const excluding = filters.categoryMode === "exclude";
  const excludingMerchants = filters.merchantMode === "exclude";
  const excludingAccounts = filters.accountMode === "exclude";

  const picked =
    filters.categories.length +
    filters.merchants.length +
    filters.accounts.length;

  /**
   * The three lists and the search as one number, so what is on reads as a whole
   * rather than three counts to add up. The per-list counts are still on the
   * pickers themselves, which is where one is turned off again.
   *
   * The search counts only where it is not already on screen: the transactions
   * table has the box in plain sight, and a number saying the same thing is a
   * second copy of it.
   */
  const active =
    picked + (filters.search !== "" && view !== "transactions" ? 1 : 0);
  const dirty =
    picked > 0 ||
    filters.search !== "" ||
    excluding ||
    excludingMerchants ||
    excludingAccounts ||
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

      {/* One menu: the years, and the months of whichever one is pointed at. */}
      <PeriodMenu
        months={months}
        years={years}
        period={period}
        kind={kind}
        from={from}
        to={to}
        onPeriod={onPeriod}
      />

      {/* Two native date boxes — no picker component, and no date library. An
          empty box is an open end, which `inRange` already means by null, so
          clearing one is "everything up to here" rather than nothing. */}
      {kind === "custom" && (
        <>
          <input
            type="date"
            className={CONTROL}
            value={from ?? ""}
            max={to ?? undefined}
            onChange={(e) => onPeriod(`${e.target.value}..${to ?? ""}`)}
            aria-label="From"
          />
          <input
            type="date"
            className={CONTROL}
            value={to ?? ""}
            min={from ?? undefined}
            onChange={(e) => onPeriod(`${from ?? ""}..${e.target.value}`)}
            aria-label="To"
          />
        </>
      )}

      {/* A tree: each category opens into the subcategories the bank names under
          it, and both levels go into one list — see `Filters.categories`. */}
      <Picker
        title="Categories"
        options={categories}
        picked={filters.categories}
        mode={filters.categoryMode}
        onToggle={toggleCategory}
        onMode={(categoryMode) => onFilters({ ...filters, categoryMode })}
        label={(c) => treeLabel(c, subsOf(c))}
        subs={subsOf}
        subLabel={pairLabel}
      />

      <Picker
        title="Merchants"
        options={merchants}
        picked={filters.merchants}
        mode={filters.merchantMode}
        onToggle={toggleMerchant}
        onMode={(merchantMode) => onFilters({ ...filters, merchantMode })}
      />

      {/* A handful of accounts, so it needs no search box either. */}
      <Picker
        title="Accounts"
        options={accounts}
        picked={filters.accounts}
        mode={filters.accountMode}
        onToggle={toggleAccount}
        onMode={(accountMode) => onFilters({ ...filters, accountMode })}
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

      {/* What is on, as a number and nothing more. Not a control: it opens
          nothing and clears nothing, so it is text — the pickers turn one
          filter off and Reset turns them all off. */}
      {active > 0 && (
        <span className="px-1 text-[13px] text-ink-soft">
          {`${active} filter${active === 1 ? "" : "s"}`}
        </span>
      )}

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
    </div>
  );
};
