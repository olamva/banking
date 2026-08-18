/**
 * The one control surface: what period you are looking at, and which values are
 * in play on each axis.
 *
 * Checkboxes in a dropdown rather than a `<select multiple>`, since
 * ctrl-clicking one is not something anyone should have to do. What is on is a
 * count rather than a row of chips — ten of those wrap onto three lines and
 * push the dashboard down the page — and the count opens into `FilterSummary`,
 * which is also the only place Reset lives.
 */
import { useEffect, useRef, useState } from "react";
import type { Axis, Filters, PeriodKind } from "../../core/select.ts";
import { AXES, NO_COUNTRY, NO_FILTERS } from "../../core/select.ts";
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
  /** The edges of the record: as far as the date boxes go, either way. */
  earliest: string;
  latest: string;
  onPeriod: (period: string) => void;
  /** Every value the two dropdowns offer, already narrowed to the period. */
  categories: string[];
  /** `category/sub` pairs, which the categories dropdown opens into. */
  subcategories: string[];
  merchants: string[];
  /** Which of `merchants` are people — see `personMerchants`. */
  people: ReadonlySet<string>;
  accounts: string[];
  countries: string[];
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
 * Escape, and a click outside, close a `details` menu — neither of which its
 * own behaviour covers. Open state stays in the DOM rather than in React.
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
  /** The rows to show, and the rows to hide out of them — one axis, two lists. */
  picked: string[];
  excluded: string[];
  /** `exclude` says which of the two lists the tick lands in. */
  onToggle: (value: string, exclude: boolean) => void;
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
  /**
   * Which options are people. Passing it is what draws the People/Businesses
   * switch, because a list of eight hundred names is two lists in practice. It
   * narrows what is *listed*, never which rows are counted.
   */
  people?: ReadonlySet<string>;
}

/** All, or one side of the People/Businesses split. */
type Kind = "all" | "people" | "business";

/**
 * Two lists, picked from the same checkboxes: what to show, and what to hide
 * out of it. **A plain tick includes; a meta-tick excludes** — ⌘/ctrl-click, or
 * ⌘/ctrl-Enter on the arrowed-to row — so "only `innskudd`, but not
 * `innskudd/familie`" is two ticks and a held key.
 *
 * That is the same gesture the charts and the table already use, which is the
 * point of it: excluding is one thing you learn once, not a modifier here and a
 * mode switch there. It replaced an Include/Exclude pen at the top of the panel,
 * which was a second way to say the same thing and had to be set *before* the
 * click it governed.
 *
 * A hidden option is ticked too, in red — it is a filter that is on, and the one
 * thing a picker must always be able to do is turn a filter back off. Unticking
 * clears it whichever list it was on, modifier or not.
 *
 * **A phone cannot reach the exclude half.** There is no meta key on a
 * touchscreen and no plain control left that does it, so exclusions are
 * desktop-only to *create* — they still show, and still clear, with a tap. This
 * is a deliberate exception to the modifier-needs-a-twin rule in CLAUDE.md,
 * taken on the account holder's instruction; the cheap twin, if it is ever
 * wanted, is making a plain tap cycle off -> only -> except.
 *
 * ponytail: renders every option, so all-time merchants is a few hundred
 * `<label>` in a scroller. Virtualise only if opening it ever feels slow.
 */
const Picker = ({
  title,
  options,
  picked,
  excluded,
  onToggle,
  label = (v) => v,
  subs,
  subLabel = (v) => v,
  people,
}: PickerProps) => {
  const [query, setQuery] = useState("");
  /**
   * Which side of the split is listed. Not in the URL and not in `Filters`,
   * because it changes what this open menu shows and nothing about the page.
   */
  const [kind, setKind] = useState<Kind>("all");
  /** Which options are opened into their children. Nothing is open to begin with. */
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  /**
   * Which option the arrow keys are on, as an index into `shown`. Null until
   * something puts it somewhere — an untouched list should not open with a row
   * already lit, as if it were hovered.
   */
  const [active, setActive] = useState<number | null>(null);
  /** Ticked either way: on one list or the other. */
  const on = (v: string) => picked.includes(v) || excluded.includes(v);

  const menu = useRef<HTMLDetailsElement>(null);
  const reset = useRef<ReturnType<typeof setTimeout>>(undefined);
  /**
   * A mirror of the DOM's open flag, kept only so a closed menu renders nothing
   * at all: 668 merchants is 1300-odd elements for React to walk on every
   * keystroke anywhere on the page.
   */
  const [open, setOpen] = useState(false);
  /**
   * What was already checked when the menu was opened — the rows that float to
   * the top of it, decided once so the order cannot change while it is open.
   */
  const [pinned, setPinned] = useState<readonly string[]>([]);
  useDismiss(menu);
  // The search box's own delayed reset, which outlives an unmount otherwise.
  useEffect(() => () => clearTimeout(reset.current), []);

  const q = query.trim().toLowerCase();
  /**
   * The split runs before the search, so searching inside People searches
   * people. Anything checked survives it: a filter you cannot see is one you
   * cannot turn off.
   */
  const listed =
    !people || kind === "all"
      ? options
      : options.filter((o) => people.has(o) === (kind === "people") || on(o));
  const childrenOf = (o: string) => subs?.(o) ?? [];
  const hitsQuery = (name: string) => name.toLowerCase().includes(q);

  // Whatever is checked stays listed, or turning a filter off means retyping
  // its name first. A parent whose *child* matches stays too.
  const shown = q
    ? listed.filter(
        (o) =>
          hitsQuery(label(o)) ||
          on(o) ||
          childrenOf(o).some((c) => hitsQuery(subLabel(c)) || on(c)),
      )
    : listed;

  // Whatever is on floats to the top, so a filter is never scrolled away from
  // in a list of hundreds. Against the snapshot rather than `picked`, or
  // ticking a box flings that row to the top from under the pointer — taking
  // the arrow keys' highlight, an index into this order, with it.
  const isPinned = (o: string) =>
    pinned.includes(o) || childrenOf(o).some((c) => pinned.includes(c));

  /**
   * The flat list the arrow keys actually walk: every shown option, with the
   * children of the opened ones spliced in beneath their parent.
   *
   * Flat on purpose — the keyboard, the highlight and Enter all index into one
   * array, so opening a category needs no second notion of "where am I".
   */
  const rowsOf = (o: string) => {
    const all = childrenOf(o);
    // A search narrows the children too, or one match lists every sibling.
    const kids =
      q === "" ? all : all.filter((c) => hitsQuery(subLabel(c)) || on(c));
    // A search or a tick that reached a child opens its parent: the row should
    // be on screen, not one click behind a triangle. A parent matching on its
    // *own* name keeps its children folded. Never a lone child, which is drawn
    // as the parent row and would otherwise be listed under both names.
    const openByDefault =
      kids.length < all.length ||
      (all.length > 1 && kids.some((c) => pinned.includes(c)));
    // `expanded` holds the rows flipped *out of* that default: a set of open
    // rows cannot express closing one that opened itself.
    const openHere = openByDefault !== expanded.has(o);
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
  };

  const pinnedRows = shown.filter(isPinned).flatMap(rowsOf);
  const rows = [
    ...pinnedRows,
    ...shown.filter((o) => !isPinned(o)).flatMap(rowsOf),
  ];
  /**
   * Read off the list that was built rather than out of `expanded`, which holds
   * only the flips away from each row's default.
   */
  const isOpenAt = (i: number) => rows[i + 1]?.sub === true;

  // A rule between the two halves, drawn as a border on the first row below it —
  // a row of its own would be one the arrow keys could land on and Enter could
  // toggle. -1 when either half is empty, since a rule needs two sides.
  const divideAt =
    pinnedRows.length > 0 && rows.length > pinnedRows.length
      ? pinnedRows.length
      : -1;

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
   * A closed menu forgets what was typed in it a few seconds later: long enough
   * that closing it by accident keeps your place, short enough that coming back
   * starts clean. Clearing on the spot empties the box in plain sight.
   */
  const toggled = (e: React.SyntheticEvent<HTMLDetailsElement>) => {
    clearTimeout(reset.current);
    setOpen(e.currentTarget.open);
    if (e.currentTarget.open) {
      setPinned([...picked, ...excluded]);
      return;
    }
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
    // Only once something is arrowed to: focus lives in the search box, so
    // before that a space is someone typing a name with one in it.
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
        if (isOpenAt(at) === (e.key === "ArrowLeft")) toggleOpen(row.value);
        return;
      }
    }
    if (step) {
      e.preventDefault();
      // Clamped, not wrapped: running off the end of a long list and landing
      // back at the top loses your place.
      setActive(at < 0 ? 0 : Math.max(0, Math.min(at + step, rows.length - 1)));
    } else if (e.key === "Enter") {
      // Buttons live in here too — the People/Businesses switch, the disclosure
      // triangles — and Enter on a button means that button.
      if (e.target instanceof HTMLButtonElement) return;
      // Enter means the match you typed for, without arrowing onto it first.
      // Meta-Enter is the keyboard's half of meta-click.
      const i = at < 0 ? 0 : at;
      const row = rows[i];
      if (!row) return;
      e.preventDefault();
      setActive(i);
      onToggle(row.value, e.metaKey || e.ctrlKey);
    }
  };

  return (
    <details
      ref={menu}
      /*
       * Full width below `sm`, which is about the *panel*: it is positioned
       * against this element, so wherever the summary wraps to is where 256px
       * of menu starts — off the right edge, and the page scrolls sideways.
       */
      className="group relative max-sm:w-full select-none"
      // The panel mounts and unmounts with the menu, so this is what tells React
      // it has opened at all.
      onToggle={toggled}
    >
      {/* The caret is the only thing saying this opens rather than toggles. */}
      <summary
        className={`${CONTROL} flex list-none items-center gap-1.5 marker:content-none`}
      >
        {title}
        {/* Both lists in one count: two ticks is two filters, whichever way
            round they read. */}
        {picked.length + excluded.length > 0 &&
          ` (${picked.length + excluded.length})`}
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
          /* No `max-w-full`: the containing block is the `details`, only as
             wide as its summary above `sm`, so it would clamp a 256px panel to
             a 130px button. Below `sm` the `details` is already full width. */
          className="absolute left-0 z-20 mt-1 flex max-h-72 w-64 flex-col rounded-md border border-line bg-surface p-1.5 shadow-lg"
        >
          {/* Only where the caller says the list splits, which is merchants
              alone. Three plain buttons rather than a select: the whole control
              is one tap on a phone, and no option is hidden behind opening it. */}
          {people && (
            <div className="mb-1.5 flex w-full shrink-0 overflow-hidden rounded-md border border-line text-xs">
              {(
                [
                  ["all", "All"],
                  ["people", "People"],
                  ["business", "Businesses"],
                ] as const
              ).map(([value, text]) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={kind === value}
                  onClick={() => {
                    setKind(value);
                    // The list under the highlight is a different list now.
                    setActive(null);
                  }}
                  className={`flex-1 px-2 py-1 ${kind === value ? "bg-series-1 text-white" : "bg-page text-ink-soft"}`}
                >
                  {text}
                </button>
              ))}
            </div>
          )}
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
                const openHere = isOpenAt(i);
                return (
                  <div
                    key={`${row.sub ? "sub:" : ""}${row.value}`}
                    className={`flex items-center ${i === divideAt ? "mt-1 border-t border-line pt-1" : ""}`}
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
                        /* Red when this one is hidden rather than shown. The box
                           is ticked either way — it is a filter that is on — so
                           the colour is the only thing saying which list it is
                           on, and it is the red the bars already spend in. */
                        className={`shrink-0 ${excluded.includes(row.value) ? "accent-critical-strong" : ""}`}
                        checked={on(row.value)}
                        /* `onClick` rather than `onChange`, because only the
                           mouse event carries the modifier — meta-click is what
                           makes a tick an exclusion, the same gesture that
                           excludes from a bar or a table cell. A keyboard space
                           fires click too, with no modifier, so plain ticking is
                           unchanged. `onChange` stays as a no-op only to keep
                           React from calling the box uncontrolled. */
                        onChange={() => {}}
                        onClick={(e) =>
                          onToggle(row.value, e.metaKey || e.ctrlKey)
                        }
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

interface FilterSummaryProps {
  filters: Filters;
  onFilters: (filters: Filters) => void;
  /** How one value reads on its own axis — categories are slugs, the rest are already names. */
  labelOf: (axis: Axis, value: string) => string;
  /**
   * The number on the trigger. May be 0 while something is still on: the count
   * deliberately skips the search where the transactions table already shows the
   * box, and `showExcluded` is a widening rather than a filter.
   */
  active: number;
}

/** One axis's half, as a word and a list — never as a colour alone. */
const SummaryRow = ({ label, values }: { label: string; values: string[] }) =>
  values.length === 0 ? null : (
    <div className="flex gap-1.5 text-[12px]">
      <span
        className={`w-11 shrink-0 ${label === "Except" ? "text-critical-strong" : "text-ink-muted"}`}
      >
        {label}
      </span>
      <span className="min-w-0 flex-1 text-ink">{values.join(", ")}</span>
    </div>
  );

/**
 * What is on, and where — the number opened into the list behind it. With four
 * axes, two lists each, a search and a toggle, "6 filters" is a number you
 * would otherwise hunt through four menus to explain.
 *
 * **Reset lives here and nowhere else**, so it is read first and pressed
 * second, with the thing it clears on screen. The trigger therefore appears
 * whenever anything is resettable, not whenever the count is non-zero — or
 * "excluded rows shown" alone would have no way back to a clean page.
 */
const FilterSummary = ({
  filters,
  onFilters,
  labelOf,
  active,
}: FilterSummaryProps) => {
  const menu = useRef<HTMLDetailsElement>(null);
  useDismiss(menu);

  const axes = (Object.entries(AXES) as [Axis, (typeof AXES)[Axis]][])
    .map(([key, outKey]) => ({
      key,
      // The axis names itself: the four keys are the four titles, capitalised,
      // so the picker above and the row here cannot drift apart.
      title: key[0]!.toUpperCase() + key.slice(1),
      on: filters[key],
      out: filters[outKey],
    }))
    .filter(({ on, out }) => on.length > 0 || out.length > 0);

  return (
    <details ref={menu} className="group relative max-sm:w-full">
      <summary
        className={`${CONTROL} flex list-none items-center select-none gap-1.5 marker:content-none`}
      >
        {active > 0 ? `${active} filter${active === 1 ? "" : "s"}` : "Filters"}
        <Icon
          aria-hidden
          icon={DropdownIcon}
          size={14}
          className="shrink-0 text-ink-muted transition-transform group-open:rotate-180"
        />
      </summary>
      {/* **`right-0`, not the default left.** This is the one control on the bar
          that sits at the *right* end (`ml-auto`), so a panel growing rightward
          from the trigger's left edge starts 256px of menu at the last ~110px of
          the page and runs straight off it — which is what shipped. Anchoring the
          panel's right edge to the trigger's makes it grow back across the bar,
          where there is always room: 256px of panel against a bar that is the
          page's own width, never narrower than the 375px the phone rule sets.

          The pickers get away with the default because they sit at the *left*.
          The rule is the same one CLAUDE.md already states — a panel is anchored
          wherever its trigger is, so the trigger's position decides the anchor. */}
      <div className="absolute right-0 z-20 mt-1 flex max-h-72 w-64 flex-col rounded-md border border-line bg-surface p-1.5 shadow-lg">
        <div className="min-h-0 space-y-2 overflow-y-auto px-0.5 py-0.5">
          {axes.map(({ key, title, on, out }) => (
            <div key={key}>
              <div className="text-[11px] tracking-wide text-ink-muted uppercase">
                {title}
              </div>
              <SummaryRow
                label="Only"
                values={on.map((v) => labelOf(key, v))}
              />
              <SummaryRow
                label="Except"
                values={out.map((v) => labelOf(key, v))}
              />
            </div>
          ))}
          {/* Listed even where the box is on screen: this is the list of what
              Reset is about to clear, not a second copy of the control. */}
          {filters.search !== "" && (
            <div>
              <div className="text-[11px] tracking-wide text-ink-muted uppercase">
                Search
              </div>
              <SummaryRow label="Text" values={[filters.search]} />
            </div>
          )}
          {filters.showExcluded && (
            <div>
              <div className="text-[11px] tracking-wide text-ink-muted uppercase">
                Excluded rows
              </div>
              <SummaryRow label="Shown" values={["transfers, card bills"]} />
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={() => {
            onFilters(NO_FILTERS);
            if (menu.current) menu.current.open = false;
          }}
          className="mt-1.5 flex shrink-0 items-center justify-center gap-1.5 rounded-md border border-line px-2.5 py-1.5 text-xs text-ink-muted"
        >
          <Icon aria-hidden icon={ResetFiltersIcon} size={14} />
          Reset filters
        </button>
      </div>
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
 * The period as one menu: years down the left, the months of one of them across
 * the right, both on screen at once — so the year points at the month grid
 * rather than being a choice to make first.
 *
 * **A year opens on hover and also on tap**, which is what makes this work on a
 * phone: a tap fills the grid and selects nothing, so the second tap decides.
 * `Whole year` is how a year is still a period of its own.
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
   * Which year's months are on show. Null is "the one in view", so pointing at
   * another year is a look rather than a change — cleared when the menu shuts,
   * not when something is picked.
   */
  const [looking, setLooking] = useState<string | null>(null);

  // All time and a range sit in no year, so there is none in view to open on,
  // and an empty grid beside a list of years is a menu that looks broken.
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
      <div className="absolute left-0 z-20 mt-1 w-72 rounded-md border border-line bg-surface p-1.5 shadow-lg max-sm:w-full">
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
  /**
   * Ticking a box in any of the four menus is the same edit over a different
   * pair of fields — the axis and its exclusions, which `AXES` pairs up.
   *
   * **Unticking always clears, whichever list the value is on**, because a
   * ticked box is a filter that is on and a click means off. A value therefore
   * never sits on both lists, which `matchesFilters` would have to break a tie
   * in.
   */
  const toggle = (key: Axis) => (value: string, exclude: boolean) => {
    const outKey = AXES[key];
    const gone = {
      [key]: filters[key].filter((x) => x !== value),
      [outKey]: filters[outKey].filter((x) => x !== value),
    };
    const target = exclude ? outKey : key;
    const wasOn =
      filters[key].includes(value) || filters[outKey].includes(value);
    onFilters({
      ...filters,
      ...gone,
      ...(wasOn ? {} : { [target]: [...filters[target], value] }),
    });
  };
  const toggleCategory = toggle("categories");

  // A pair is `category/sub`, so its own category is its prefix — no second
  // grouping to keep in step with the list the picker was handed.
  const subsOf = (category: string) =>
    subcategories.filter(
      (pair) => pair.slice(0, pair.indexOf("/")) === category,
    );
  const toggleMerchant = toggle("merchants");
  const toggleAccount = toggle("accounts");
  const toggleCountry = toggle("countries");

  /**
   * How one value reads in the summary. Categories are slugs carrying two
   * levels, so a pair reads as its subcategory and a bare slug as its category —
   * the same two names the picker's own rows already choose between. The other
   * three axes are names as they stand, `NO_COUNTRY`'s dash excepted.
   */
  const labelOf = (axis: Axis, value: string) =>
    axis === "categories"
      ? value.includes("/")
        ? pairLabel(value)
        : treeLabel(value, subsOf(value))
      : axis === "countries" && value === NO_COUNTRY
        ? "No country"
        : value;

  // Both halves of all four axes: an exclusion is a filter like any other, so a
  // page filtered only by exclusions still says so and still offers Reset.
  const picked = (Object.entries(AXES) as [Axis, (typeof AXES)[Axis]][]).reduce(
    (n, [key, outKey]) => n + filters[key].length + filters[outKey].length,
    0,
  );

  /**
   * The four lists and the search as one number, the per-list counts being on
   * the pickers themselves. The search counts only where it is not already on
   * screen: the transactions table has the box in plain sight.
   */
  const active =
    picked + (filters.search !== "" && view !== "transactions" ? 1 : 0);
  const dirty = picked > 0 || filters.search !== "" || filters.showExcluded;

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

      {/* Native date boxes — no picker component, no date library. An empty box
          is the open end `inRange` already means by null. Bounded twice, by the
          record and by the other box, so the calendar greys out what cannot be
          picked; `min`/`max` are only advisory against a typed date. */}
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

      {/* A tree: each category opens into the subcategories the bank names under
          it, and both levels go into one list — see `Filters.categories`. */}
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
      />

      {/* A handful of accounts, so it needs no search box either. */}
      <Picker
        title="Accounts"
        options={accounts}
        picked={filters.accounts}
        excluded={filters.accountsOut}
        onToggle={toggleAccount}
      />

      {/* Only card rows carry a country, so the list is short and the dash at
          the end of it is every other row — see `NO_COUNTRY`. */}
      <Picker
        title="Countries"
        options={countries}
        picked={filters.countries}
        excluded={filters.countriesOut}
        onToggle={toggleCountry}
        label={(c) => (c === NO_COUNTRY ? "No country" : c)}
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

      {/* What is on, opened into which — and the only Reset there is. `ml-auto`
          keeps it where the Reset button used to sit, at the end of the bar. */}
      {dirty && (
        <div className="ml-auto max-sm:w-full">
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
