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
  title: string;
  options: string[];
  picked: string[];
  excluded: string[];
  onToggle: (value: string, exclude: boolean) => void;
  label?: (value: string) => string;
  subs?: (option: string) => string[];
  subLabel?: (value: string) => string;
  people?: ReadonlySet<string>;
  right?: boolean;
}

type Kind = "all" | "people" | "business";

// A plain tick includes. A meta-tick excludes. A phone cannot create an
// exclusion. The account holder accepts this. A tap still clears one.

// The panel shows about ten rows. Merchants offers 816, so it renders a page at
// a time and grows on scroll. Do not raise this to cover the list: the cost is
// the React element, not the pixel.
const PAGE = 80;

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
  right = false,
}: PickerProps) => {
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<Kind>("all");
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  const [active, setActive] = useState<number | null>(null);
  const [limit, setLimit] = useState(PAGE);
  const on = (v: string) => picked.includes(v) || excluded.includes(v);

  const menu = useRef<HTMLDetailsElement>(null);
  const reset = useRef<ReturnType<typeof setTimeout>>(undefined);
  const [open, setOpen] = useState(false);
  const [pinned, setPinned] = useState<readonly string[]>([]);
  useDismiss(menu);
  useEffect(() => () => clearTimeout(reset.current), []);

  const q = query.trim().toLowerCase();
  const listed =
    !people || kind === "all"
      ? options
      : options.filter((o) => people.has(o) === (kind === "people") || on(o));
  const childrenOf = (o: string) => subs?.(o) ?? [];
  const hitsQuery = (name: string) => name.toLowerCase().includes(q);

  const shown = q
    ? listed.filter(
        (o) =>
          hitsQuery(label(o)) ||
          on(o) ||
          childrenOf(o).some((c) => hitsQuery(subLabel(c)) || on(c)),
      )
    : listed;

  const isPinned = (o: string) =>
    pinned.includes(o) || childrenOf(o).some((c) => pinned.includes(c));

  const rowsOf = (o: string) => {
    const all = childrenOf(o);
    const kids =
      q === "" ? all : all.filter((c) => hitsQuery(subLabel(c)) || on(c));
    const openByDefault =
      kids.length < all.length ||
      (all.length > 1 && kids.some((c) => pinned.includes(c)));
    const openHere = openByDefault !== expanded.has(o);
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
  const isOpenAt = (i: number) => rows[i + 1]?.sub === true;

  const divideAt =
    pinnedRows.length > 0 && rows.length > pinnedRows.length
      ? pinnedRows.length
      : -1;

  const at = active === null ? -1 : Math.min(active, rows.length - 1);

  const toggleOpen = (o: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (!next.delete(o)) next.add(o);
      return next;
    });

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
      setExpanded(new Set());
      setLimit(PAGE);
    }, 3000);
  };

  // Space toggles. An arrow acts only in the direction that it names.
  const expand = (e: React.KeyboardEvent) => {
    const row = at < 0 ? undefined : rows[at];
    if (!row || row.sub || childrenOf(row.value).length < 2) return false;
    const openHere = isOpenAt(at);
    const want =
      e.key === " "
        ? !openHere
        : e.key === "ArrowRight"
          ? true
          : e.key === "ArrowLeft"
            ? false
            : null;
    if (want === null) return false;
    e.preventDefault();
    if (want !== openHere) toggleOpen(row.value);
    return true;
  };

  const navigate = (e: React.KeyboardEvent) => {
    if (expand(e)) return;
    const step = e.key === "ArrowDown" ? 1 : e.key === "ArrowUp" ? -1 : 0;
    if (step) {
      e.preventDefault();
      const next =
        at < 0 ? 0 : Math.max(0, Math.min(at + step, rows.length - 1));
      setActive(next);
      // The arrow keys reach past the rendered page. Render up to the row that
      // is now active, or it cannot be scrolled to.
      if (next >= limit) setLimit(next + PAGE);
    } else if (e.key === "Enter") {
      if (e.target instanceof HTMLButtonElement) return;
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
      className="group relative select-none"
      onToggle={toggled}
    >
      {/* The caret is the only thing saying this opens rather than toggles. */}
      <summary
        className={`${CONTROL} flex list-none items-center gap-1.5 whitespace-nowrap marker:content-none`}
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
          /* Do not add `max-w-full`. The containing block is the `details`, which is
             only as wide as its summary, so `max-w-full` would clamp a 256px panel to
             a 130px button. The right-hand picker of a pair hangs from its right edge
             instead, because 256px from its left edge is past the screen. */
          className={`absolute ${right ? "right-0" : "left-0"} z-20 mt-1 flex max-h-72 w-64 flex-col rounded-md border border-line bg-surface p-1.5 shadow-lg`}
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
                    setActive(null);
                    setLimit(PAGE);
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
              autoFocus
              type="search"
              className="w-full rounded-md border border-line bg-page py-1 pr-2 pl-7 text-xs text-ink"
              placeholder={`Search ${title.toLowerCase()}…`}
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setActive(null);
                setLimit(PAGE);
              }}
              aria-label={`Search ${title.toLowerCase()}`}
            />
          </div>
          {/* Only the list scrolls: the mode toggle and the search box stay put
            rather than sliding away as you scroll past them. */}
          <div
            className="min-h-0 overflow-y-auto"
            onScroll={(e) => {
              const el = e.currentTarget;
              if (el.scrollHeight - el.scrollTop - el.clientHeight < 120)
                setLimit((n) => n + PAGE);
            }}
          >
            {rows.length === 0 ? (
              <div className="px-1.5 py-1 text-xs text-ink-muted">
                {options.length === 0 ? "Nothing in this period." : "No match."}
              </div>
            ) : (
              rows.slice(0, limit).map((row, i) => {
                const kids = row.sub ? [] : childrenOf(row.value);
                const openHere = isOpenAt(i);
                return (
                  <div
                    key={`${row.sub ? "sub:" : ""}${row.value}`}
                    className={`flex items-center ${i === divideAt ? "mt-1 border-t border-line pt-1" : ""}`}
                  >
                    {row.sub ? (
                      <span className="w-6.5 shrink-0" />
                    ) : kids.length > 1 ? (
                      <button
                        type="button"
                        onClick={() => toggleOpen(row.value)}
                        aria-expanded={openHere}
                        aria-label={`${openHere ? "Hide" : "Show"} ${label(row.value)} subcategories`}
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
                      <span className="w-3.25 shrink-0" />
                    )}
                    <label
                      ref={
                        i === at
                          ? (el) => el?.scrollIntoView({ block: "nearest" })
                          : undefined
                      }
                      className={`flex min-w-0 flex-1 cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-[13px] hover:bg-hover ${i === at ? "bg-hover" : ""} ${row.sub ? "text-ink-soft" : ""}`}
                    >
                      <input
                        type="checkbox"
                        className={`shrink-0 ${excluded.includes(row.value) ? "accent-critical-strong" : ""}`}
                        checked={on(row.value)}
                        onChange={() => {}}
                        onClick={(e) =>
                          onToggle(row.value, e.metaKey || e.ctrlKey)
                        }
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
  labelOf: (axis: Axis, value: string) => string;
  active: number;
}

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
      // The panel is positioned against this element. Below `sm` it must fill the
      // width of the bar, or it goes past the right edge.
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

  return (
    <div className="flex flex-wrap items-center gap-2">
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
      <div className={GROUP}>
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

        {/* Only card rows carry a country, so the list is short and the dash at
            the end of it is every other row — see `NO_COUNTRY`. */}
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
          Excluded rows
        </button>
      </div>

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
