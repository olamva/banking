/**
 * The page. Two views, dashboard and transactions, over one shared period.
 * State is three things — view, period, filters — and everything else is
 * derived on render from the full transaction list.
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
  distinctCategories,
  distinctMerchants,
  distinctMonths,
  distinctYears,
  inRange,
  matchesFilters,
  merchantOf,
  period,
  type Filters,
  type Mode,
  type Period,
} from "../../core/select.ts";
import type { ExcludedSummary } from "../../core/stats.ts";
import {
  blindSpot,
  byMonth,
  monthStats,
  subsAndRecurring,
  totals,
  yearStats,
} from "../../core/stats.ts";
import type { Categorized } from "../../core/types.ts";
import {
  AMOUNT_SIZE,
  Card,
  DataTable,
  MeterTile,
  PickCell,
  StatTile,
  TransactionsCard,
  deltaInfo,
  useTxnSort,
} from "./Cards.tsx";
import {
  ChartLegend,
  DivergingBars,
  HorizontalBars,
  MonthlyLines,
  visibleDeltas,
} from "./Charts.tsx";
import { FilterBar, type View } from "./FilterBar.tsx";
import {
  THEMES,
  readTheme,
  setTheme,
  useTransactions,
  type Theme,
} from "./data.ts";
import { categoryLabel, fmtNOK } from "./format.ts";
import {
  CategoryIcon,
  ChangesIcon,
  CounterpartyIcon,
  DarkThemeIcon,
  ErrorIcon,
  Icon,
  InfoIcon,
  LightThemeIcon,
  LoadingIcon,
  MonthlyIcon,
  RecurringIcon,
  SystemThemeIcon,
} from "./icons.ts";
import { readUrl, writeUrl } from "./url.ts";

/**
 * Two columns at this page width, and the last card takes the whole row when it
 * would otherwise be the odd one out sitting alone in half of one.
 */
const CARD_GRID =
  "grid grid-cols-[repeat(auto-fit,minmax(460px,1fr))] gap-4 [&>*:last-child:nth-child(odd)]:col-span-full";

/**
 * The year layout: three charts across, and the table under them.
 *
 * Year is the only period with all four cards *and* the month chart above them,
 * which is what makes 2×2 read badly there — the table ends up beside a chart
 * at half the width it wants. Three across is narrower per card but costs less
 * than it looks: `HorizontalBars` reserves a fixed 130px for labels either way,
 * so nothing new truncates; only the bar area shrinks.
 *
 * The last child is always the one that takes the full row, because in this
 * layout it is the transaction table — the card that actually wants the width.
 */
const CARD_GRID_3 =
  "grid grid-cols-[repeat(auto-fit,minmax(300px,1fr))] gap-4 [&>*:last-child]:col-span-full";

const THEME_ICONS = {
  system: SystemThemeIcon,
  light: LightThemeIcon,
  dark: DarkThemeIcon,
};

/** What the card meter says underneath — only when the statement export has not reached every row. */
const cardNote = (rows: Categorized[]): string => {
  const blind = blindSpot(rows);
  return blind.count === 0
    ? ""
    : `${blind.count} rows still have no merchant (${fmtNOK(blind.total)}) — no statement export covers them.`;
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
 * Clicking a bar or a table cell filters to it; clicking the one already
 * filtered to clears it. A plain click always means "show me this", so it drops
 * out of exclude mode — a click that hid the thing just asked for would be a
 * trap.
 *
 * Meta-click means the opposite, and accumulates: showing is naturally one thing
 * at a time, hiding is naturally several, so each meta-click adds to the list
 * rather than replacing it. An include list means something else, so it goes.
 *
 * Categories and merchants are the same gesture over two lists, so they are one
 * function; only the pair of fields it writes back differs.
 */
const pick =
  (onFilters: SetFilters, key: "categories" | "merchants") =>
  (value: string, exclude = false) =>
    onFilters((f) => {
      const [values, mode]: [string[], Mode] =
        key === "categories"
          ? [f.categories, f.categoryMode]
          : [f.merchants, f.merchantMode];

      let next: string[];
      if (exclude) {
        const list = mode === "exclude" ? values : [];
        next = list.includes(value)
          ? list.filter((v) => v !== value)
          : [...list, value];
      } else {
        const only =
          mode === "include" && values.length === 1 && values[0] === value;
        next = only ? [] : [value];
      }

      const to: Mode = exclude ? "exclude" : "include";
      return key === "categories"
        ? { ...f, categories: next, categoryMode: to }
        : { ...f, merchants: next, merchantMode: to };
    });

/**
 * The charts draw whatever string they are handed, so categories go in already
 * readable — which means a click comes back as "Bil og transport" when the
 * filter needs `bil_og_transport`. One map back, built from the rows in view.
 */
const slugsByLabel = (slugs: string[]) =>
  new Map(slugs.map((s) => [categoryLabel(s), s]));

interface DashboardProps {
  txns: Categorized[];
  filters: Filters;
  onFilters: SetFilters;
  period: Period;
}

/**
 * One dashboard for every period. Month and year were never two views — they
 * were the same tiles and the same bars over two window lengths, so what varies
 * here is the window, not the layout.
 *
 * `monthStats` is named for the case it was written for, but it only ever used
 * the month as a label: hand it any two row sets and it compares them. That is
 * what makes "biggest changes" and the counterparty list — both month-only
 * before — work over a year for free.
 */
const Dashboard = ({ txns, filters, onFilters, period: p }: DashboardProps) => {
  const all = txns.filter((t) => inRange(t, p.from, p.to));
  const shown = all.filter((t) => matchesFilters(t, filters));
  const previous = p.prev
    ? txns
        .filter((t) => inRange(t, p.prev!.from, p.prev!.to))
        .filter((t) => matchesFilters(t, filters))
    : [];

  // Nothing precedes all time, so it draws no deltas — a comparison against
  // nothing would read as a 100% rise on every tile.
  const stats = monthStats(p.label, shown, p.prev ? previous : undefined);
  const prev = monthStats("previous", previous);

  // A single month plots as one dot, and its "average month" is the total again.
  const months = byMonth(shown);
  const yearly = months.length > 1 ? yearStats(p.label, months) : null;

  const cats = stats.categories.map((c) => ({
    label: categoryLabel(c.category),
    total: c.total,
  }));
  const cps = stats.topCounterparties.map((c) => ({
    label: c.counterparty,
    total: c.total,
    count: c.count,
  }));
  const subs = subsAndRecurring(stats);
  const { sorted: sortedSubs, head: subsHead } = useTxnSort(subs);
  const deltas = visibleDeltas(stats.categoryDeltas).map((d) => ({
    ...d,
    category: categoryLabel(d.category),
  }));

  const slugOf = slugsByLabel([
    ...stats.categories.map((c) => c.category),
    ...stats.categoryDeltas.map((d) => d.category),
  ]);
  const onCategory = (label: string, meta: boolean) =>
    pick(onFilters, "categories")(slugOf.get(label) ?? label, meta);
  const onMerchant = pick(onFilters, "merchants");

  // A breakdown of one category is a bar chart of itself, so it goes. Excluding
  // one is the opposite: everything else is still in, and still worth breaking down.
  const single =
    filters.categories.length === 1 && filters.categoryMode === "include";

  // Nothing renders a box it has no rows for. Filtered to rent, "income" is a
  // zero and "net" is the spend again with a minus sign; both are noise.
  return (
    <>
      <div className="mb-4 grid grid-cols-[repeat(auto-fit,minmax(160px,1fr))] gap-3">
        {stats.totalOut > 0 && (
          <StatTile
            label="Spent"
            value={fmtNOK(stats.totalOut)}
            sub={yearly ? `${fmtNOK(yearly.averageMonth.totalOut)} / month` : undefined}
            vs={p.prev?.label}
            delta={p.prev ? deltaInfo(stats.totalOut, prev.totalOut, false) : undefined}
          />
        )}
        {stats.totalIn > 0 && (
          <StatTile
            label="Income"
            value={fmtNOK(stats.totalIn)}
            sub={yearly ? `${fmtNOK(yearly.averageMonth.totalIn)} / month` : undefined}
            vs={p.prev?.label}
            delta={p.prev ? deltaInfo(stats.totalIn, prev.totalIn, true) : undefined}
          />
        )}
        {stats.totalIn > 0 && stats.totalOut > 0 && (
          <StatTile
            label="Net"
            value={fmtNOK(stats.net)}
            sub={yearly ? `${fmtNOK(yearly.averageMonth.net)} / month` : undefined}
            vs={p.prev?.label}
            delta={p.prev ? deltaInfo(stats.net, prev.net, true) : undefined}
          />
        )}
        {stats.cardShare > 0 && (
          <MeterTile
            label="Card spend"
            share={stats.cardShare}
            note={cardNote(shown)}
          />
        )}
      </div>

      {/* Outside the grid, not a `col-span-full` inside it. `nth-child` counts
          DOM children, but a full-width card owns a whole row on its own — so
          one sitting in the grid shifts what "odd" means for everything after
          it, and the last card is left alone in half a row exactly when the
          rule below exists to prevent that. */}
      {yearly && (
        <div className="mb-4">
          <Card title="Income & spend by month" icon={MonthlyIcon}>
            <ChartLegend />
            <MonthlyLines series={yearly.months} />
          </Card>
        </div>
      )}

      <div className={p.kind === "year" ? CARD_GRID_3 : CARD_GRID}>
        {!single && cats.length > 0 && (
          <Card title="Spending by category" icon={CategoryIcon}>
            <HorizontalBars items={cats} onPick={onCategory} />
          </Card>
        )}

        {deltas.length > 0 && (
          <Card
            title={`Biggest changes vs ${p.prev?.label}`}
            icon={ChangesIcon}
          >
            <DivergingBars deltas={deltas} onPick={onCategory} />
          </Card>
        )}

        {cps.length > 0 && (
          <Card title="Where the money went" icon={CounterpartyIcon}>
            <HorizontalBars items={cps} onPick={onMerchant} />
          </Card>
        )}

        {subs.length > 0 && (
          <Card title="Subscriptions & recurring" icon={RecurringIcon}>
            <DataTable
              /* Same widths as the full table: everything but the description
                 is content-width, so sorting cannot slide the columns about. */
              columns={[
                subsHead("Date", "date", { min: true }),
                subsHead("Description", "merchant"),
                subsHead("Category", "category", { min: true }),
                subsHead("Amount", "amount", {
                  num: true,
                  min: true,
                  sizer: AMOUNT_SIZE,
                }),
              ]}
              rows={sortedSubs.map((t) => [
                t.date,
                <PickCell label={merchantOf(t)} onPick={onMerchant} />,
                <PickCell
                  label={categoryLabel(t.category)}
                  value={t.category}
                  onPick={pick(onFilters, "categories")}
                />,
                fmtNOK(t.amount),
              ])}
            />
          </Card>
        )}
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
   * A year in view is a couple of thousand rows, and re-rendering all of them
   * takes long enough that doing it between two keystrokes drops the second one.
   * Deferring the *filter* input — not the box's own value — leaves React free
   * to abandon a half-rendered table when the next character arrives, so only
   * the row set you stopped on is ever finished.
   */
  const search = useDeferredValue(filters.search);
  const shown = rows.filter((t) => matchesFilters(t, { ...filters, search }));
  const sums = totals(shown);

  return (
    <>
      {/* All three, always — unlike the dashboards, which hide a tile they have
          no rows for. Here the numbers move on every keystroke, and a tile that
          vanishes at zero takes the rows below it for a ride up the page. */}
      <div className="mb-4 grid grid-cols-[repeat(auto-fit,minmax(160px,1fr))] gap-3">
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
  const [theme, onTheme] = useState<Theme>(readTheme);

  // The raw choice, never the derived one below: null in the URL is what keeps
  // "latest month" meaning latest, rather than freezing today's answer.
  useEffect(
    () => writeUrl({ view, period: chosen, filters }),
    [view, chosen, filters],
  );

  const txns = load.status === "ready" ? load.txns : [];
  const months = useMemo(() => distinctMonths(txns), [txns]);
  const years = useMemo(() => distinctYears(txns), [txns]);

  // Latest month, until something is picked. Derived rather than stored, so the
  // first render after the fetch lands is already on the right month. Anything
  // the picker does not offer falls back to it too, so a hand-edited URL cannot
  // leave the select showing one period while the page renders another.
  const offered = [...months, ...years, "all"];
  const active =
    chosen && offered.includes(chosen)
      ? chosen
      : (months[months.length - 1] ?? "all");
  const p = useMemo(() => period(active), [active]);

  /**
   * A search belongs to the table it was typed on. Carrying it into the
   * dashboard leaves the charts filtered by a string with no box to clear it —
   * the same reason the chip exists there for a search set by clicking a bar.
   */
  const changeView = (next: View) => {
    if (view === "transactions" && next !== "transactions")
      setFilters((f) => ({ ...f, search: "" }));
    setView(next);
  };

  // Chips for the period in view, not for all time — a category last spent in
  // January is not a filter March has any use for. Narrowed by the period only:
  // narrowing by the other filters too would let the search box empty the rail.
  // Whatever is switched on stays listed, or turning it off becomes impossible.
  const inPeriod = useMemo(
    () => txns.filter((t) => inRange(t, p.from, p.to)),
    [txns, p],
  );
  const categories = useMemo(
    () =>
      [
        ...new Set([...distinctCategories(inPeriod), ...filters.categories]),
      ].sort(),
    [inPeriod, filters.categories],
  );
  const merchants = useMemo(
    () =>
      [
        ...new Set([...distinctMerchants(inPeriod), ...filters.merchants]),
      ].sort((a, b) => a.localeCompare(b)),
    [inPeriod, filters.merchants],
  );

  return (
    <div className="mx-auto max-w-295 p-6">
      <header className="mb-4 flex flex-wrap items-baseline justify-between gap-4">
        <h1 className="text-xl font-semibold">Spending dashboard</h1>
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
      </header>

      <FilterBar
        view={view}
        onView={changeView}
        months={months}
        years={years}
        period={active}
        kind={p.kind}
        onPeriod={setChosen}
        categories={categories}
        merchants={merchants}
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
        />
      )}
      {load.status === "ready" && txns.length > 0 && view === "transactions" && (
        <TransactionsView
          rows={inPeriod}
          filters={filters}
          onFilters={setFilters}
        />
      )}
    </div>
  );
};
