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
import type { Axis, Filters, Mode, PeriodKind } from "../../core/select.ts";
import { NO_FILTERS } from "../../core/select.ts";
import { chipLabel, pairLabel, splitPair, treeLabel } from "./format.ts";
import {
  CloseIcon,
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

/**
 * How many chips stay on screen before the rest fold behind a count. One row on
 * a normal window: past that the chips push the whole dashboard down, which is
 * the opposite of what a filter bar is for.
 */
const CHIP_LIMIT = 6;


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
          childrenOf(o).some((c) => hitsQuery(subLabel(c)) || picked.includes(c)),
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
      q === "" ? all : all.filter((c) => hitsQuery(subLabel(c)) || picked.includes(c));
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
        if (expanded.has(row.value) === (e.key === "ArrowLeft")) toggleOpen(row.value);
        return;
      }
    }
    if (step) {
      e.preventDefault();
      // Clamped, not wrapped: running off the end of a long list and landing
      // back at the top is a good way to lose track of where you were.
      // From nothing, either arrow lands on the first row rather than off the end.
      setActive(
        at < 0 ? 0 : Math.max(0, Math.min(at + step, rows.length - 1)),
      );
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
                  <div key={`${row.sub ? "sub:" : ""}${row.value}`} className="flex items-center">
                    {row.sub ? (
                      // Two spacers, so a child lines up under its parent's label
                      // rather than under its triangle.
                      <span className="w-[26px] shrink-0" />
                    ) : kids.length > 1 ? (
                      <button
                        type="button"
                        // Not inside the label: clicking a disclosure must not
                        // also tick the box it sits next to.
                        onClick={() => toggleOpen(row.value)}
                        aria-expanded={openHere}
                        aria-label={`${openHere ? "Hide" : "Show"} ${label(row.value)} subcategories`}
                        className="flex h-6 w-[13px] shrink-0 items-center justify-center text-ink-muted hover:text-ink"
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
                      <span className="w-[13px] shrink-0" />
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
                        {row.sub || row.value.includes("/") ? subLabel(row.value) : label(row.value)}
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

export const FilterBar = ({
  view,
  onView,
  months,
  years,
  period,
  kind,
  onPeriod,
  categories,
  subcategories,
  merchants,
  accounts,
  filters,
  onFilters,
}: FilterBarProps) => {
  /** Whether the chips past `CHIP_LIMIT` are unfolded. Folded again on every reload. */
  const [showAll, setShowAll] = useState(false);
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
    subcategories.filter((pair) => pair.slice(0, pair.indexOf("/")) === category);
  const toggleMerchant = toggle("merchants");
  const toggleAccount = toggle("accounts");

  const excluding = filters.categoryMode === "exclude";
  const excludingMerchants = filters.merchantMode === "exclude";
  const excludingAccounts = filters.accountMode === "exclude";

  // The search box is on the transactions table, in plain sight — a chip for it
  // there would only be a second copy that shoves the page down as you type.
  const searchChip = filters.search !== "" && view !== "transactions";
  const picked =
    filters.categories.length + filters.merchants.length + filters.accounts.length;

  /**
   * The three lists and the search as one array, because the chips are one row
   * that has to be counted and cut as a whole — cutting each list separately
   * would show six categories and then six merchants under them.
   */
  const chips = [
    ...filters.categories.map((c) => {
      const name = chipLabel(c, subsOf(splitPair(c)[0]));
      return {
        key: `category:${c}`,
        label: excluding ? `Not ${name}` : name,
        tone: excluding ? ("exclude" as const) : ("include" as const),
        onRemove: () => toggleCategory(c),
      };
    }),
    ...filters.merchants.map((m) => ({
      key: `merchant:${m}`,
      label: excludingMerchants ? `Not ${m}` : m,
      tone: excludingMerchants ? ("exclude" as const) : ("include" as const),
      onRemove: () => toggleMerchant(m),
    })),
    ...filters.accounts.map((a) => ({
      key: `account:${a}`,
      label: excludingAccounts ? `Not ${a}` : a,
      tone: excludingAccounts ? ("exclude" as const) : ("include" as const),
      onRemove: () => toggleAccount(a),
    })),
    // On the dashboards there is no search box, so without this a search set
    // from a bar click would be a filter with nothing to clear it.
    ...(searchChip
      ? [
          {
            key: "search",
            label: `“${filters.search}”`,
            tone: "include" as const,
            onRemove: () => onFilters({ ...filters, search: "" }),
          },
        ]
      : []),
  ];
  const hidden = chips.length - CHIP_LIMIT;
  const shown = showAll ? chips : chips.slice(0, CHIP_LIMIT);
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

      {chips.length > 0 && (
        <div
          className="flex basis-full flex-wrap items-center gap-1.5"
          role="group"
          aria-label="Active filters"
        >
          {/* The mode is invisible once the menu closes, so the chips carry it. */}
          {shown.map((chip) => (
            <Chip
              key={chip.key}
              label={chip.label}
              tone={chip.tone}
              onRemove={chip.onRemove}
            />
          ))}
          {/* The folded ones are still on, so the count has to say how many —
              a filter you cannot see is a filter you cannot turn off, and this
              is the one click back to seeing it. */}
          {hidden > 0 && (
            <button
              type="button"
              onClick={() => setShowAll(!showAll)}
              className="rounded-full border border-line px-2.5 py-1 text-xs text-ink-muted"
            >
              {showAll ? "Show fewer" : `+${hidden} more`}
            </button>
          )}
        </div>
      )}
    </div>
  );
};
