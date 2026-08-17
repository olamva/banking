/**
 * The page. Two views, dashboard and transactions, over one shared period.
 * State is four things — view, period, chart grain, filters — all of them in
 * the query string, and everything else is derived on render from the full
 * transaction list.
 *
 * No aggregation lives here. `src/core/stats.ts` does all of it and is imported
 * directly, so the browser runs the exact code `node --test` pins; `src/core/
 * select.ts` decides which rows are in view. This file only arranges them.
 */
import {
  useDeferredValue,
  useEffect,
  useMemo,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import {
  AXES,
  NO_FILTERS,
  axisBounds,
  distinctAccounts,
  distinctCountries,
  distinctCategories,
  distinctMerchants,
  distinctMonths,
  distinctSubcategories,
  distinctYears,
  inRange,
  matchesFilters,
  period,
  personMerchants,
  type Axis,
  type Filters,
  type Period,
} from "../../core/select.ts";
import type { ExcludedSummary } from "../../core/stats.ts";
import {
  byMonth,
  cumulative,
  dailySeries,
  monthStats,
  monthlySeries,
  totals,
  yearStats,
} from "../../core/stats.ts";
import type { Categorized } from "../../core/types.ts";
import {
  Card,
  StatTile,
  SubscriptionsCard,
  TransactionsCard,
  deltaInfo,
} from "./Cards.tsx";
import {
  DivergingBars,
  HorizontalBars,
  SpendLines,
  visibleDeltas,
  type BarItem,
  type Bucket,
} from "./Charts.tsx";
import { FilterBar, type View } from "./FilterBar.tsx";
import { ShortcutsDialog, useShortcuts, type Shortcut } from "./Shortcuts.tsx";
import {
  THEMES,
  readTheme,
  setTheme,
  useTransactions,
  type Theme,
} from "./data.ts";
import {
  categoryLabel,
  fmtNOK,
  setCategoryHues,
  setLabels,
  subcategoryLabel,
} from "./format.ts";
import {
  AccountIcon,
  CategoryIcon,
  ChangesIcon,
  CounterpartyIcon,
  DarkThemeIcon,
  ErrorIcon,
  Icon,
  InfoIcon,
  KeyboardIcon,
  LightThemeIcon,
  LoadingIcon,
  MonthlyIcon,
  SystemThemeIcon,
} from "./icons.ts";
import { GRAINS, readUrl, writeUrl, type Grain } from "./url.ts";

/**
 * Two columns, and the last card takes the whole row **only when it would
 * otherwise sit alone in half of one** — either parity happens in practice, so
 * the span must not be unconditional.
 *
 * `min(…, 100%)` makes the 460 a *preference* rather than a floor: a bare pixel
 * minimum never goes narrower, so on a phone the page scrolls sideways under
 * it. `layout.test.ts` refuses the bare form anywhere in here.
 */
const CARD_GRID =
  "grid grid-cols-[repeat(auto-fit,minmax(min(460px,100%),1fr))] gap-4 [&>*:last-child:nth-child(odd)]:col-span-full";

/**
 * All time: three charts across, so each direction is its own row — it is the
 * one period with no changes card, leaving six. The last child always spans,
 * because over all time it is always the subscriptions table.
 */
const CARD_GRID_3 =
  "grid grid-cols-[repeat(auto-fit,minmax(min(300px,100%),1fr))] gap-4 [&>*:last-child]:col-span-full";

const THEME_ICONS = {
  system: SystemThemeIcon,
  light: LightThemeIcon,
  dark: DarkThemeIcon,
};

interface ExcludedNoteProps {
  excluded: ExcludedSummary;
  /** The whole phrase — "this month", "in view" — since not every view has a period to name. */
  where: string;
}

/** An audit line, so it always reports the whole period and ignores the filters. */
const ExcludedNote = ({ excluded, where }: ExcludedNoteProps) =>
  excluded.count === 0 ? null : (
    <div className="mt-3 flex items-start gap-1.5 text-[11px] text-ink-muted">
      <Icon aria-hidden icon={InfoIcon} size={13} className="mt-px shrink-0" />
      <span>
        {excluded.count} transaction(s) totalling {fmtNOK(excluded.total)}{" "}
        excluded {where} (internal transfers, card bill payments).
      </span>
    </div>
  );

type SetFilters = Dispatch<SetStateAction<Filters>>;

/**
 * A plain click means "show me this" and replaces what was shown, since showing
 * is naturally one thing at a time. Meta-click means "not this" and
 * accumulates, since hiding is naturally several.
 *
 * A value ends up on one list at a time, each gesture taking it off the other:
 * the exclusion would win anyway, and a tick that decides nothing reads as a
 * filter that is on and does nothing.
 */
const pick =
  (onFilters: SetFilters, key: Axis) =>
  (value: string, exclude = false) =>
    onFilters((f) => {
      const outKey = AXES[key];
      const values: string[] = f[key];
      const out: string[] = f[outKey];
      const without = (list: string[]) => list.filter((v) => v !== value);

      if (exclude)
        return {
          ...f,
          [key]: without(values),
          [outKey]: out.includes(value) ? without(out) : [...out, value],
        };
      const only = values.length === 1 && values[0] === value;
      return { ...f, [key]: only ? [] : [value], [outKey]: without(out) };
    });

/**
 * The charts draw whatever string they are handed, so categories go in already
 * readable — which means a click comes back as "Bil og transport" when the
 * filter needs `bil_og_transport`. One map back, built from the rows in view.
 */
const slugsByLabel = (slugs: string[]) =>
  new Map(slugs.map((s) => [categoryLabel(s), s]));

const GRAIN_LABEL: Record<Grain, string> = {
  running: "Running total",
  day: "Per day",
  month: "Per month",
};

interface GrainToggleProps {
  grain: Grain;
  offered: Grain[];
  onGrain: (grain: Grain) => void;
}

/**
 * On the chart it belongs to rather than in the filter bar: it changes what one
 * card draws and nothing else on the page.
 */
const GrainToggle = ({ grain, offered, onGrain }: GrainToggleProps) =>
  offered.length < 2 ? null : (
    <span className="inline-flex overflow-hidden rounded-md border border-line">
      {offered.map((g) => (
        <button
          key={g}
          type="button"
          aria-pressed={grain === g}
          onClick={() => onGrain(g)}
          className={`px-2 py-1 text-[11px] ${grain === g ? "bg-series-1 text-white" : "bg-page text-ink-soft"}`}
        >
          {GRAIN_LABEL[g]}
        </button>
      ))}
    </span>
  );

interface DashboardProps {
  txns: Categorized[];
  filters: Filters;
  onFilters: SetFilters;
  period: Period;
  /** Already narrowed to something this window offers — see `GRAINS`. */
  grain: Grain;
  offered: Grain[];
  onGrain: (grain: Grain) => void;
}

/**
 * One dashboard for every period: the same tiles and bars over two window
 * lengths, so what varies is the window and not the layout. `monthStats` uses
 * its month as a label only — hand it any two row sets and it compares them.
 */
const Dashboard = ({
  txns,
  filters,
  onFilters,
  period: p,
  grain,
  offered,
  onGrain,
}: DashboardProps) => {
  const all = txns.filter((t) => inRange(t, p.from, p.to));
  const shown = all.filter((t) => matchesFilters(t, filters));

  /**
   * The window compared against, where there is one: a comparison against a
   * window with no rows reads as a 100% rise against a zero that is an absence.
   * Measured before the filters, since a filter that empties the previous
   * window is a real zero worth keeping.
   */
  const vs =
    p.prev && txns.some((t) => inRange(t, p.prev!.from, p.prev!.to))
      ? p.prev
      : null;

  const previous = vs
    ? txns
        .filter((t) => inRange(t, vs.from, vs.to))
        .filter((t) => matchesFilters(t, filters))
    : [];

  const stats = monthStats(p.label, shown, vs ? previous : undefined);
  const prev = monthStats("previous", previous);

  // A single month has no "average month" — that is the total again.
  const months = byMonth(shown);
  const yearly = months.length > 1 ? yearStats(p.label, months) : null;

  const running = grain === "running";
  const bucket: Bucket = grain === "month" ? "month" : "day";

  // From the whole period, never from `shown` — a filter thins the line, it
  // does not shorten the axis. See `axisBounds`.
  const { from, to } = axisBounds(all, p);

  const build = (rows: Categorized[], a: string, b: string) => {
    const raw =
      bucket === "day" ? dailySeries(rows, a, b) : monthlySeries(rows);
    return running ? cumulative(raw) : raw;
  };

  const series = build(shown, from, to);
  // The same filters as `shown`, so the faint line behind the chart and the
  // deltas beside it are measuring the same thing.
  const compare = vs ? build(previous, vs.from, vs.to) : [];

  // Nothing about drawing a bar cares which direction the money went, so the
  // two sides are the same two mappers called twice.
  const catBars = (
    categories: typeof stats.categories,
    subcategories: typeof stats.subcategories,
  ) =>
    categories.map((c) => {
      const subs = subcategories
        .filter((sub) => sub.category === c.category)
        .map((sub) => ({
          key: `${sub.category}/${sub.subcategory ?? ""}`,
          label: subcategoryLabel(sub.category, sub.subcategory),
          total: sub.total,
        }));
      // A category with one named child reads as that child, and filters as it —
      // the same rows either way, under the more useful of the two names.
      const lone =
        subs.length === 1 && subs[0]!.key.split("/")[1] !== ""
          ? subs[0]!
          : null;
      return {
        // The slug rides along so a click needs no reverse lookup: two slugs
        // can tidy to the same display name.
        key: lone?.key ?? c.category,
        label: lone?.label ?? categoryLabel(c.category),
        total: c.total,
        subs,
      };
    });
  const cpBars = (list: typeof stats.topCounterparties) =>
    list.map((c) => ({
      label: c.counterparty,
      total: c.total,
      count: c.count,
    }));

  const cats = catBars(stats.categories, stats.subcategories);
  const cps = cpBars(stats.topCounterparties);
  const inCats = catBars(stats.incomeCategories, stats.incomeSubcategories);
  const inCps = cpBars(stats.topIncomeCounterparties);
  const deltas = visibleDeltas(stats.categoryDeltas).map((d) => ({
    ...d,
    category: categoryLabel(d.category),
  }));

  const slugOf = slugsByLabel([
    ...stats.categories.map((c) => c.category),
    ...stats.categoryDeltas.map((d) => d.category),
  ]);
  // `HorizontalBars` reports the slug it was given; `DivergingBars` still draws
  // and reports display names, so the map back stays for that one.
  const onCategory = (slugOrLabel: string, meta: boolean) =>
    pick(onFilters, "categories")(slugOf.get(slugOrLabel) ?? slugOrLabel, meta);
  // One axis: a subcategory is a value in the same list as its category.
  const onSubcategory = pick(onFilters, "categories");
  const onMerchant = pick(onFilters, "merchants");
  const onAccount = pick(onFilters, "accounts");

  // One account is not a breakdown, it is the total again with a bar under it.
  const acctBars = (list: typeof stats.accounts): BarItem[] =>
    list.map((a) => ({ label: a.account, total: a.total }));
  const accounts = acctBars(stats.accounts);
  const inAccounts = acctBars(stats.incomeAccounts);

  // A breakdown of one category is a bar chart of itself. Exclusions do not
  // count: excluding a category leaves everything else in and worth breaking
  // down.
  const single = filters.categories.length === 1;

  // A line along the axis is not a finding, so a side with nothing in it is
  // dropped and the title follows.
  const anyIncome = series.some((s) => s.totalIn > 0);
  const anySpend = series.some((s) => s.totalOut > 0);

  // The shading reads the vertical gap as a surplus, which is only true of a
  // whole window: income lands on about a third of days, so day by day it would
  // call almost every one an overspend. It needs the grain, not either line.
  const band = running || bucket === "month";

  // Nothing renders a box it has no rows for. Filtered to rent, "income" is a
  // zero and "net" is the spend again with a minus sign; both are noise.
  return (
    <>
      <div className="mb-4 grid grid-cols-[repeat(auto-fit,minmax(min(160px,100%),1fr))] gap-3">
        {stats.totalOut > 0 && (
          <StatTile
            label="Spent"
            value={fmtNOK(stats.totalOut)}
            sub={
              yearly
                ? `${fmtNOK(yearly.averageMonth.totalOut)} / month`
                : undefined
            }
            vs={vs?.label}
            delta={
              vs ? deltaInfo(stats.totalOut, prev.totalOut, false) : undefined
            }
          />
        )}
        {stats.totalIn > 0 && (
          <StatTile
            label="Income"
            value={fmtNOK(stats.totalIn)}
            sub={
              yearly
                ? `${fmtNOK(yearly.averageMonth.totalIn)} / month`
                : undefined
            }
            vs={vs?.label}
            delta={
              vs ? deltaInfo(stats.totalIn, prev.totalIn, true) : undefined
            }
          />
        )}
        {stats.totalIn > 0 && stats.totalOut > 0 && (
          <StatTile
            label="Net"
            value={fmtNOK(stats.net)}
            sub={
              yearly ? `${fmtNOK(yearly.averageMonth.net)} / month` : undefined
            }
            vs={vs?.label}
            delta={vs ? deltaInfo(stats.net, prev.net, true) : undefined}
          />
        )}
      </div>

      {/* Outside the grid, not a `col-span-full` inside it. `nth-child` counts
          DOM children, but a full-width card owns a whole row on its own — so
          one sitting in the grid shifts what "odd" means for everything after
          it, and the last card is left alone in half a row exactly when the
          rule below exists to prevent that. */}
      {series.length > 1 && (
        <div className="mb-4">
          <Card
            title={`${anyIncome ? (anySpend ? "Income & spend" : "Income") : "Spending"}${
              running
                ? ", running total"
                : grain === "day"
                  ? " by day"
                  : " by month"
            }`}
            icon={MonthlyIcon}
            action={
              <GrainToggle grain={grain} offered={offered} onGrain={onGrain} />
            }
          >
            <SpendLines
              series={series}
              bucket={bucket}
              income={anyIncome}
              spend={anySpend}
              band={band}
              // A line fitted to a running total is a straight line drawn over
              // one, reporting an average the tile above already gives. It is
              // fitted through spending, so it goes where the red line goes.
              trend={!running && anySpend}
              compare={compare}
              compareLabel={vs?.label}
            />
          </Card>
        </div>
      )}

      <div className={p.kind === "all" ? CARD_GRID_3 : CARD_GRID}>
        {/* Three breakdowns per direction, named the same way on both sides:
            "<direction> by <axis>". The income half hides itself period by
            period, on exactly the same emptiness rules as the spending half. */}
        {!single && cats.length > 0 && (
          <Card title="Spending by category" icon={CategoryIcon}>
            <HorizontalBars
              items={cats}
              onPick={onCategory}
              onPickSub={onSubcategory}
              tone="spend"
            />
          </Card>
        )}

        {!single && deltas.length > 0 && (
          <Card title={`Biggest changes vs ${vs?.label}`} icon={ChangesIcon}>
            <DivergingBars deltas={deltas} onPick={onCategory} />
          </Card>
        )}

        {cps.length > 0 && (
          <Card title="Spending by merchant" icon={CounterpartyIcon}>
            <HorizontalBars items={cps} onPick={onMerchant} tone="spend" />
          </Card>
        )}

        {accounts.length > 1 && (
          <Card title="Spending by account" icon={AccountIcon}>
            <HorizontalBars items={accounts} onPick={onAccount} tone="spend" />
          </Card>
        )}

        {!single && inCats.length > 0 && (
          <Card title="Income by category" icon={CategoryIcon}>
            <HorizontalBars
              items={inCats}
              onPick={onCategory}
              onPickSub={onSubcategory}
              tone="income"
            />
          </Card>
        )}

        {inCps.length > 0 && (
          <Card title="Income by merchant" icon={CounterpartyIcon}>
            <HorizontalBars items={inCps} onPick={onMerchant} tone="income" />
          </Card>
        )}

        {inAccounts.length > 1 && (
          <Card title="Income by account" icon={AccountIcon}>
            <HorizontalBars
              items={inAccounts}
              onPick={onAccount}
              tone="income"
            />
          </Card>
        )}

        {/* Hides itself when the period has nothing recurring in it. */}
        <SubscriptionsCard
          txns={shown}
          onMerchant={onMerchant}
          onCategory={pick(onFilters, "categories")}
        />
      </div>

      <ExcludedNote excluded={totals(all).excluded} where="in this period" />
    </>
  );
};

interface TransactionsViewProps {
  /** Already narrowed to the chosen period; the filters are applied in here. */
  rows: Categorized[];
  filters: Filters;
  onFilters: SetFilters;
}

/** The rows themselves, with what they add up to. No deltas — a range has no previous range. */
const TransactionsView = ({
  rows,
  filters,
  onFilters,
}: TransactionsViewProps) => {
  /**
   * The box keeps up with the typing; the table is allowed to lag behind it.
   *
   * A year is a couple of thousand rows, and re-rendering them between two
   * keystrokes drops the second. Deferring the *filter* input — not the box's
   * own value — lets React abandon a half-rendered table.
   */
  const search = useDeferredValue(filters.search);
  const shown = rows.filter((t) => matchesFilters(t, { ...filters, search }));
  const sums = totals(shown);

  return (
    <>
      {/* All three, always — unlike the dashboards, which hide a tile they have
          no rows for. Here the numbers move on every keystroke, and a tile that
          vanishes at zero takes the rows below it for a ride up the page. */}
      <div className="mb-4 grid grid-cols-[repeat(auto-fit,minmax(min(160px,100%),1fr))] gap-3">
        <StatTile label="Spent" value={fmtNOK(sums.totalOut)} />
        <StatTile label="Income" value={fmtNOK(sums.totalIn)} />
        <StatTile label="Net" value={fmtNOK(sums.net)} />
      </div>

      <div className={CARD_GRID}>
        <TransactionsCard
          txns={shown}
          search={filters.search}
          onSearch={(search) => onFilters((f) => ({ ...f, search }))}
          onMerchant={pick(onFilters, "merchants")}
          onCategory={pick(onFilters, "categories")}
          onAccount={pick(onFilters, "accounts")}
        />
      </div>

      {/* Over the period, not over `shown` — the note audits the range, not the search box. */}
      <ExcludedNote excluded={totals(rows).excluded} where="in view" />
    </>
  );
};

export const App = () => {
  const load = useTransactions();
  // Read once, not once per state — three reads would parse the same string three times.
  const [initial] = useState(readUrl);
  const [view, setView] = useState<View>(initial.view);
  const [chosen, setChosen] = useState<string | null>(initial.period);
  const [filters, setFilters] = useState<Filters>(initial.filters);
  const [chosenGrain, setChosenGrain] = useState<Grain>(initial.grain);
  const [theme, onTheme] = useState<Theme>(readTheme);
  const [help, setHelp] = useState(false);

  // Before anything renders a slug: `categoryLabel` has no other way to reach
  // the names. Hues off every row rather than the filtered view.
  if (load.status === "ready") {
    setLabels(load.labels);
    setCategoryHues(distinctCategories(load.txns));
  }

  const txns = load.status === "ready" ? load.txns : [];
  const months = useMemo(() => distinctMonths(txns), [txns]);
  const years = useMemo(() => distinctYears(txns), [txns]);

  /**
   * The edges of the record, as far as the date boxes go: a range starting in
   * 1998 draws an empty page and says nothing about why. `axisBounds` over all
   * time answers exactly this, so the far end moves with the archive.
   */
  const record = useMemo(() => axisBounds(txns, period("all")), [txns]);

  // Latest month until something is picked, and derived rather than stored so
  // the first render after the fetch is already on it. Anything the picker does
  // not offer falls back too, so a hand-edited URL cannot leave the select
  // showing one period while the page renders another. A range has no list to
  // be in, so it is checked by shape.
  const offered = [...months, ...years, "all"];
  const active =
    chosen && (offered.includes(chosen) || period(chosen).kind === "custom")
      ? chosen
      : (months[months.length - 1] ?? "all");
  const p = useMemo(() => period(active), [active]);

  /**
   * The same narrowing, for the same reason: a window draws only the grains it
   * can carry. Derived rather than stored, so the choice survives a trip
   * through a window that cannot show it.
   */
  const grains = GRAINS[p.kind];
  const grain = grains.includes(chosenGrain) ? chosenGrain : grains[0]!;

  /**
   * The period goes in raw and the grain derived, which is not the
   * inconsistency it looks: a null period means "the latest month", so storing
   * the answer would freeze today's into the URL, while a grain has no such
   * placeholder and a raw one would claim a mode the window does not draw.
   */
  useEffect(
    () => writeUrl({ view, period: chosen, grain, filters }),
    [view, chosen, grain, filters],
  );

  /**
   * A search belongs to the table it was typed on: carried into the dashboard
   * it leaves the charts filtered by a string with no box to clear it.
   */
  const changeView = (next: View) => {
    if (view === "transactions" && next !== "transactions")
      setFilters((f) => ({ ...f, search: "" }));
    setView(next);
  };

  /**
   * The arrows step within the kind of period in view, because a month and the
   * year holding it are two lengths of window rather than two neighbours in one
   * list. Clamped at both ends: the archive stops.
   */
  const steps = p.kind === "month" ? months : p.kind === "year" ? years : [];
  const step = (by: number) => {
    const next = steps[steps.indexOf(active) + by];
    if (next) setChosen(next);
  };

  /**
   * The other axis: `A`, `Y` and `M` change how long the window is, where the
   * arrows move it. Without them all time is a dead end, holding no year to
   * step through. The year is the one in view, or the latest on record.
   */
  const inView = active.slice(0, 4);
  const year = years.includes(inView) ? inView : years[years.length - 1];
  const lastMonthOf = (y: string) =>
    months.filter((m) => m.startsWith(`${y}-`)).at(-1);

  /**
   * What the keys do, and what the dialog prints — one list for both, so a key
   * that works is a key that is listed. `/` and ⌘F are listed here and bound on
   * the search box, which is the only thing that can reach it.
   */
  const shortcuts: Shortcut[] = [
    {
      keys: ["d"],
      cap: "D",
      what: "Dashboard",
      run: () => changeView("dashboard"),
    },
    {
      keys: ["t"],
      cap: "T",
      what: "Transactions",
      run: () => changeView("transactions"),
    },
    {
      keys: ["ArrowLeft"],
      cap: "←",
      what: "The month or year before",
      run: () => step(-1),
    },
    {
      keys: ["ArrowRight"],
      cap: "→",
      what: "The month or year after",
      run: () => step(1),
    },
    { keys: ["a"], cap: "A", what: "All time", run: () => setChosen("all") },
    {
      keys: ["y"],
      cap: "Y",
      what: "The whole year — the latest, from all time",
      run: () => year && setChosen(year),
    },
    {
      keys: ["m"],
      cap: "M",
      what: "The last month of that year",
      run: () => {
        const m = year && lastMonthOf(year);
        if (m) setChosen(m);
      },
    },
    {
      keys: ["g"],
      cap: "G",
      what: "Next grain on the spending chart",
      run: () =>
        setChosenGrain(grains[(grains.indexOf(grain) + 1) % grains.length]!),
    },
    {
      keys: ["e"],
      cap: "E",
      what: "Show or hide excluded rows",
      run: () => setFilters((f) => ({ ...f, showExcluded: !f.showExcluded })),
    },
    {
      keys: ["r"],
      cap: "R",
      what: "Reset every filter",
      run: () => setFilters(NO_FILTERS),
    },
    {
      keys: ["c"],
      cap: "C",
      what: "Next theme",
      run: () => {
        const next = THEMES[(THEMES.indexOf(theme) + 1) % THEMES.length]!;
        onTheme(next);
        setTheme(next);
      },
    },
    { cap: "/ ⌘F", what: "Search the transactions table" },
    {
      keys: ["?"],
      cap: "?",
      what: "This list",
      run: () => setHelp(true),
    },
  ];
  useShortcuts(shortcuts);

  // Chips for the period in view, not for all time — a category last spent in
  // January is not a filter March has any use for. Narrowed by the period only:
  // narrowing by the other filters too would let the search box empty the rail.
  // Whatever is switched on stays listed, or turning it off becomes impossible.
  const inPeriod = useMemo(
    () => txns.filter((t) => inRange(t, p.from, p.to)),
    [txns, p],
  );
  // Only bare categories are options; a picked *pair* contributes its parent,
  // or the lone-child rule lists the same row twice under one name.
  const categories = useMemo(
    () =>
      [
        ...new Set([
          ...distinctCategories(inPeriod),
          ...filters.categories.map((c) =>
            c.includes("/") ? c.slice(0, c.indexOf("/")) : c,
          ),
        ]),
      ].sort(),
    [inPeriod, filters.categories],
  );
  // By display name, not by slug: the picker draws them under their category,
  // and the slug's alphabet is not the one on screen.
  const subcategories = useMemo(
    () =>
      [
        ...new Set([
          ...distinctSubcategories(inPeriod),
          ...filters.categories.filter((c) => c.includes("/")),
        ]),
      ].sort(
        (a, b) =>
          a
            .slice(0, a.indexOf("/"))
            .localeCompare(b.slice(0, b.indexOf("/"))) ||
          subcategoryLabel(
            a.slice(0, a.indexOf("/")),
            a.slice(a.indexOf("/") + 1) || null,
          ).localeCompare(
            subcategoryLabel(
              b.slice(0, b.indexOf("/")),
              b.slice(b.indexOf("/") + 1) || null,
            ),
          ),
      ),
    [inPeriod, filters.categories],
  );
  const merchants = useMemo(
    () =>
      [...new Set([...distinctMerchants(inPeriod), ...filters.merchants])].sort(
        (a, b) => a.localeCompare(b),
      ),
    [inPeriod, filters.merchants],
  );
  // Off the whole period, not the filtered rows: a name would otherwise stop
  // being a person as soon as you filtered its peer rows away.
  const people = useMemo(() => personMerchants(inPeriod), [inPeriod]);
  const accounts = useMemo(
    () =>
      [...new Set([...distinctAccounts(inPeriod), ...filters.accounts])].sort(
        (a, b) => a.localeCompare(b),
      ),
    [inPeriod, filters.accounts],
  );
  // Not re-sorted: `distinctCountries` already puts the no-country dash last,
  // and sorting again would pull it to the front under its punctuation.
  const countries = useMemo(() => {
    const inView = distinctCountries(inPeriod);
    // A picked value stays listed even where the period has none of it, or
    // narrowing the period drops the chip and leaves nothing to click off.
    return inView.concat(filters.countries.filter((c) => !inView.includes(c)));
  }, [inPeriod, filters.countries]);

  return (
    <div className="mx-auto max-w-295 p-3 sm:p-6">
      <header className="mb-4 flex flex-wrap items-baseline justify-between gap-4">
        <h1 className="text-xl font-semibold">Spending dashboard</h1>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setHelp(true)}
            aria-label="Keyboard shortcuts"
            className="flex items-center gap-1.5 rounded-md border border-line bg-surface px-2.5 py-1.5 text-xs text-ink-soft"
          >
            <Icon aria-hidden icon={KeyboardIcon} size={14} />
            Shortcuts
          </button>
          {/* Three named options rather than a cycling button: a toggle whose next
            state you cannot see is a toggle you press twice. The icon names the
            option picked — "system" is the machine, not the way it resolved. */}
          <div className="relative">
            <Icon
              aria-hidden
              icon={THEME_ICONS[theme]}
              size={14}
              className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-ink-soft"
            />
            <select
              className="w-full appearance-none rounded-md border border-line bg-surface py-1.5 pr-3 pl-8 text-xs text-ink-soft"
              value={theme}
              onChange={(e) => {
                const next = e.target.value as Theme;
                onTheme(next);
                setTheme(next);
              }}
              aria-label="Theme"
            >
              {/* Capitalised here, not in CSS — a native select menu ignores text-transform. */}
              {THEMES.map((t) => (
                <option key={t} value={t}>
                  {t[0]!.toUpperCase() + t.slice(1)}
                </option>
              ))}
            </select>
          </div>
        </div>
      </header>

      <ShortcutsDialog
        shortcuts={shortcuts}
        open={help}
        onClose={() => setHelp(false)}
      />

      <FilterBar
        view={view}
        onView={changeView}
        months={months}
        years={years}
        period={active}
        kind={p.kind}
        from={p.from}
        to={p.to}
        earliest={record.from}
        latest={record.to}
        onPeriod={setChosen}
        categories={categories}
        subcategories={subcategories}
        merchants={merchants}
        people={people}
        accounts={accounts}
        countries={countries}
        filters={filters}
        onFilters={setFilters}
      />

      {load.status === "loading" && (
        <div className="flex items-center justify-center gap-2 py-10 text-ink-muted">
          <Icon
            aria-hidden
            icon={LoadingIcon}
            size={16}
            className="animate-spin"
          />
          Loading…
        </div>
      )}
      {load.status === "error" && (
        <div className="flex items-center justify-center gap-2 py-10 text-critical">
          <Icon aria-hidden icon={ErrorIcon} size={16} className="shrink-0" />
          Could not load transactions: {load.message}
        </div>
      )}
      {load.status === "ready" && txns.length === 0 && (
        <div className="py-10 text-center text-ink-muted">
          No transactions yet — run `pnpm sb1 rebuild`.
        </div>
      )}
      {load.status === "ready" && txns.length > 0 && view === "dashboard" && (
        <Dashboard
          txns={txns}
          filters={filters}
          onFilters={setFilters}
          period={p}
          grain={grain}
          offered={grains}
          onGrain={setChosenGrain}
        />
      )}
      {load.status === "ready" &&
        txns.length > 0 &&
        view === "transactions" && (
          <TransactionsView
            rows={inPeriod}
            filters={filters}
            onFilters={setFilters}
          />
        )}
    </div>
  );
};
