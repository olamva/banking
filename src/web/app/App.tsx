/**
 * The page. State is four things — view, month, year, filters — and everything
 * else is derived on render from the full transaction list.
 *
 * No aggregation lives here. `src/core/stats.ts` does all of it and is imported
 * directly, so the browser runs the exact code `node --test` pins; `src/core/
 * select.ts` decides which rows are in view. This file only arranges them.
 */
import { useEffect, useMemo, useState, type Dispatch, type SetStateAction } from 'react';
import type { Categorized } from '../../core/types.ts';
import { blindSpot, byMonth, monthStats, subsAndRecurring, totals, yearStats } from '../../core/stats.ts';
import type { ExcludedSummary } from '../../core/stats.ts';
import {
  daysAgo,
  distinctCategories,
  distinctMonths,
  distinctYears,
  inMonth,
  inRange,
  inYear,
  matchesFilters,
  prevMonth,
  type Filters,
} from '../../core/select.ts';
import { ChartLegend, DivergingBars, HorizontalBars, MonthlyLines, visibleDeltas } from './Charts.tsx';
import { Card, DataTable, MeterTile, StatTile, TransactionsCard, deltaInfo } from './Cards.tsx';
import { FilterBar, type View } from './FilterBar.tsx';
import { THEMES, readTheme, setTheme, useTransactions, type Theme } from './data.ts';
import { readUrl, writeUrl } from './url.ts';
import { categoryLabel, fmtNOK } from './format.ts';
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
} from './icons.ts';

const THEME_ICONS = { system: SystemThemeIcon, light: LightThemeIcon, dark: DarkThemeIcon };

/** What the card meter says underneath — only when the statement export has not reached every row. */
const cardNote = (rows: Categorized[]): string => {
  const blind = blindSpot(rows);
  return blind.count === 0 ? '' : `${blind.count} rows still have no merchant (${fmtNOK(blind.total)}) — no statement export covers them.`;
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
        {excluded.count} transaction(s) totalling {fmtNOK(excluded.total)} excluded {where} (internal transfers, card bill
        payments).
      </span>
    </div>
  );

type SetFilters = Dispatch<SetStateAction<Filters>>;

/** Clicking a bar filters to it; clicking the one already filtered to clears it. */
const pickCategory = (onFilters: SetFilters) => (category: string) =>
  onFilters((f) => ({ ...f, categories: f.categories.length === 1 && f.categories[0] === category ? [] : [category] }));

/**
 * The charts draw whatever string they are handed, so categories go in already
 * readable — which means a click comes back as "Bil og transport" when the
 * filter needs `bil_og_transport`. One map back, built from the rows in view.
 */
const slugsByLabel = (slugs: string[]) => new Map(slugs.map((s) => [categoryLabel(s), s]));

const pickCounterparty = (onFilters: SetFilters) => (counterparty: string) =>
  onFilters((f) => ({ ...f, search: f.search === counterparty ? '' : counterparty }));

interface ViewProps {
  txns: Categorized[];
  filters: Filters;
  onFilters: SetFilters;
  period: string;
}

const MonthView = ({ txns, filters, onFilters, period: month }: ViewProps) => {
  const all = txns.filter((t) => inMonth(t, month));
  const shown = all.filter((t) => matchesFilters(t, filters));
  const previous = txns.filter((t) => inMonth(t, prevMonth(month))).filter((t) => matchesFilters(t, filters));

  const stats = monthStats(month, shown, previous);
  const prev = monthStats(prevMonth(month), previous);
  const cats = stats.categories.map((c) => ({ label: categoryLabel(c.category), total: c.total }));
  const cps = stats.topCounterparties.map((c) => ({ label: c.counterparty, total: c.total, count: c.count }));
  const subs = subsAndRecurring(stats);
  const deltas = visibleDeltas(stats.categoryDeltas).map((d) => ({ ...d, category: categoryLabel(d.category) }));

  const slugOf = slugsByLabel([...stats.categories.map((c) => c.category), ...stats.categoryDeltas.map((d) => d.category)]);
  const onCategory = (label: string) => pickCategory(onFilters)(slugOf.get(label) ?? label);

  // A breakdown of one category is a bar chart of itself. Drop it, and let the
  // rows lead instead — that is what you picked a single category to look at.
  const single = filters.categories.length === 1;

  // Nothing renders a box it has no rows for. Filtered to rent, "income" is a
  // zero and "net" is the spend again with a minus sign; both are noise.
  return (
    <>
      <div className="mb-4 grid grid-cols-[repeat(auto-fit,minmax(160px,1fr))] gap-3">
        {stats.totalOut > 0 && (
          <StatTile label="Spent" value={fmtNOK(stats.totalOut)} delta={deltaInfo(stats.totalOut, prev.totalOut, false)} />
        )}
        {stats.totalIn > 0 && (
          <StatTile label="Income" value={fmtNOK(stats.totalIn)} delta={deltaInfo(stats.totalIn, prev.totalIn, true)} />
        )}
        {stats.totalIn > 0 && stats.totalOut > 0 && (
          <StatTile label="Net" value={fmtNOK(stats.net)} delta={deltaInfo(stats.net, prev.net, true)} />
        )}
        {stats.cardShare > 0 && <MeterTile label="Card spend" share={stats.cardShare} note={cardNote(shown)} />}
      </div>

      <div className="grid grid-cols-[repeat(auto-fit,minmax(360px,1fr))] gap-4">
        {!single && cats.length > 0 && (
          <Card title="Spending by category" icon={CategoryIcon}>
            <HorizontalBars items={cats} onPick={onCategory} />
          </Card>
        )}

        {deltas.length > 0 && (
          <Card title="Biggest changes vs last month" icon={ChangesIcon}>
            <DivergingBars deltas={deltas} onPick={onCategory} />
          </Card>
        )}

        {cps.length > 0 && (
          <Card title="Where the money went" icon={CounterpartyIcon}>
            <HorizontalBars items={cps} onPick={pickCounterparty(onFilters)} />
          </Card>
        )}

        {subs.length > 0 && (
          <Card title="Subscriptions & recurring" icon={RecurringIcon}>
            <DataTable
              columns={[{ label: 'Date' }, { label: 'Description' }, { label: 'Category' }, { label: 'Amount', num: true }]}
              rows={subs.map((t) => [t.date, t.counterparty ?? t.description, categoryLabel(t.category), fmtNOK(t.amount)])}
            />
          </Card>
        )}
      </div>

      <ExcludedNote excluded={totals(all).excluded} where="this month" />
    </>
  );
};

const YearView = ({ txns, filters, onFilters, period: year }: ViewProps) => {
  const all = txns.filter((t) => inYear(t, year));
  const shown = all.filter((t) => matchesFilters(t, filters));

  const stats = yearStats(year, byMonth(shown));
  const avg = stats.averageMonth;
  const cats = stats.categories.map((c) => ({ label: categoryLabel(c.category), total: c.total }));
  const single = filters.categories.length === 1;

  const slugOf = slugsByLabel(stats.categories.map((c) => c.category));
  const onCategory = (label: string) => pickCategory(onFilters)(slugOf.get(label) ?? label);

  return (
    <>
      <div className="mb-4 grid grid-cols-[repeat(auto-fit,minmax(160px,1fr))] gap-3">
        {avg.totalOut > 0 && <StatTile label="Average monthly spend" value={fmtNOK(avg.totalOut)} />}
        {avg.totalIn > 0 && <StatTile label="Average monthly income" value={fmtNOK(avg.totalIn)} />}
        {avg.totalIn > 0 && avg.totalOut > 0 && <StatTile label="Average monthly net" value={fmtNOK(avg.net)} />}
        {stats.cardShare > 0 && <MeterTile label="Card spend" share={stats.cardShare} note={cardNote(shown)} />}
      </div>

      <div className="grid grid-cols-[repeat(auto-fit,minmax(360px,1fr))] gap-4">
        {stats.months.length > 0 && (
          <Card title="Income & spend by month" icon={MonthlyIcon} wide>
            <ChartLegend />
            <MonthlyLines series={stats.months} />
          </Card>
        )}

        {!single && cats.length > 0 && (
          <Card title="Spending by category (year)" icon={CategoryIcon}>
            <HorizontalBars items={cats} onPick={onCategory} />
          </Card>
        )}
      </div>

      <ExcludedNote excluded={totals(all).excluded} where="this year" />
    </>
  );
};

interface TransactionsViewProps {
  /** Already narrowed to the chosen period; the filters are applied in here. */
  rows: Categorized[];
  filters: Filters;
}

/** The rows themselves, with what they add up to. No deltas — a range has no previous range. */
const TransactionsView = ({ rows, filters }: TransactionsViewProps) => {
  const shown = rows.filter((t) => matchesFilters(t, filters));
  const sums = totals(shown);

  return (
    <>
      <div className="mb-4 grid grid-cols-[repeat(auto-fit,minmax(160px,1fr))] gap-3">
        {sums.totalOut > 0 && <StatTile label="Spent" value={fmtNOK(sums.totalOut)} />}
        {sums.totalIn > 0 && <StatTile label="Income" value={fmtNOK(sums.totalIn)} />}
        {sums.totalIn > 0 && sums.totalOut > 0 && <StatTile label="Net" value={fmtNOK(sums.net)} />}
      </div>

      <div className="grid grid-cols-[repeat(auto-fit,minmax(360px,1fr))] gap-4">
        <TransactionsCard txns={shown} />
      </div>

      {/* Over the period, not over `shown` — the note audits the range, not the search box. */}
      <ExcludedNote excluded={totals(rows).excluded} where="in view" />
    </>
  );
};

export const App = () => {
  const load = useTransactions();
  // Read once, not once per state — four reads would parse the same string four times.
  const [initial] = useState(readUrl);
  const [view, setView] = useState<View>(initial.view);
  const [month, setMonth] = useState<string | null>(initial.month);
  const [year, setYear] = useState<string | null>(initial.year);
  const [days, setDays] = useState<number | null>(initial.days);
  const [filters, setFilters] = useState<Filters>(initial.filters);
  const [theme, onTheme] = useState<Theme>(readTheme);

  // The raw month/year, never the derived one below: null in the URL is what
  // keeps "latest period" meaning latest, rather than freezing today's answer.
  useEffect(() => writeUrl({ view, month, year, days, filters }), [view, month, year, days, filters]);

  const txns = load.status === 'ready' ? load.txns : [];
  const months = useMemo(() => distinctMonths(txns), [txns]);
  const years = useMemo(() => distinctYears(txns), [txns]);

  // Latest period, until something is picked. Derived rather than stored, so
  // the first render after the fetch lands is already on the right month.
  const activeMonth = month ?? months[months.length - 1] ?? null;
  const activeYear = year ?? years[years.length - 1] ?? null;

  // Chips for the period in view, not for all time — a category last spent in
  // January is not a filter March has any use for. Narrowed by the period only:
  // narrowing by the other filters too would let the search box empty the rail.
  // Whatever is switched on stays listed, or turning it off becomes impossible.
  // Every preset is open-ended at the top, so only the lower bound is ever set.
  const since = days === null ? null : daysAgo(days);
  const inView = (t: Categorized) =>
    view === 'month' ? inMonth(t, activeMonth ?? '') : view === 'year' ? inYear(t, activeYear ?? '') : inRange(t, since, null);

  const categories = useMemo(
    () => [...new Set([...distinctCategories(txns.filter(inView)), ...filters.categories])].sort(),
    [txns, view, activeMonth, activeYear, since, filters.categories],
  );

  return (
    <div className="mx-auto max-w-[1180px] px-6 pt-5 pb-16">
      <header className="mb-4 flex flex-wrap items-baseline justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">Spending dashboard</h1>
          <div className="text-[13px] text-ink-soft">
            Served locally from your own machine. Never share this page or a screenshot of it.
          </div>
        </div>
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
        onView={setView}
        months={months}
        month={activeMonth}
        onMonth={setMonth}
        years={years}
        year={activeYear}
        onYear={setYear}
        days={days}
        onDays={setDays}
        categories={categories}
        filters={filters}
        onFilters={setFilters}
      />

      {load.status === 'loading' && (
        <div className="flex items-center justify-center gap-2 py-10 text-ink-muted">
          <Icon aria-hidden icon={LoadingIcon} size={16} className="animate-spin" />
          Loading…
        </div>
      )}
      {load.status === 'error' && (
        <div className="flex items-center justify-center gap-2 py-10 text-critical">
          <Icon aria-hidden icon={ErrorIcon} size={16} className="shrink-0" />
          Could not load transactions: {load.message}
        </div>
      )}
      {load.status === 'ready' && txns.length === 0 && (
        <div className="py-10 text-center text-ink-muted">No transactions yet — run `pnpm sb1 rebuild`.</div>
      )}
      {load.status === 'ready' && view === 'month' && activeMonth && <MonthView txns={txns} filters={filters} onFilters={setFilters} period={activeMonth} />}
      {load.status === 'ready' && view === 'year' && activeYear && <YearView txns={txns} filters={filters} onFilters={setFilters} period={activeYear} />}
      {load.status === 'ready' && view === 'transactions' && <TransactionsView rows={txns.filter(inView)} filters={filters} />}
    </div>
  );
};
