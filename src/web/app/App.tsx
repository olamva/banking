/**
 * The page. State is four things — view, month, year, filters — and everything
 * else is derived on render from the full transaction list.
 *
 * No aggregation lives here. `src/core/stats.ts` does all of it and is imported
 * directly, so the browser runs the exact code `node --test` pins; `src/core/
 * select.ts` decides which rows are in view. This file only arranges them.
 */
import { useMemo, useState, type Dispatch, type SetStateAction } from 'react';
import type { Categorized } from '../../core/types.ts';
import { blindSpot, byMonth, monthStats, subsAndRecurring, yearStats } from '../../core/stats.ts';
import type { ExcludedSummary } from '../../core/stats.ts';
import {
  NO_FILTERS,
  distinctCategories,
  distinctMonths,
  distinctYears,
  inMonth,
  inYear,
  matchesFilters,
  prevMonth,
  type Filters,
} from '../../core/select.ts';
import { ChartLegend, DivergingBars, HorizontalBars, MonthlyGroupedBars, visibleDeltas } from './Charts.tsx';
import { Card, DataTable, MeterTile, StatTile, TableToggle, TransactionsCard, deltaInfo } from './Cards.tsx';
import { FilterBar, type View } from './FilterBar.tsx';
import { cycleTheme, useTransactions } from './data.ts';
import { fmtNOK, fmtPct } from './format.ts';
import {
  CategoryIcon,
  ChangesIcon,
  CounterpartyIcon,
  ErrorIcon,
  Icon,
  InfoIcon,
  LoadingIcon,
  MonthlyIcon,
  RecurringIcon,
  ThemeIcon,
} from './icons.ts';

/** What the card meter says underneath — only when the statement export has not reached every row. */
const cardNote = (rows: Categorized[]): string => {
  const blind = blindSpot(rows);
  return blind.count === 0 ? '' : `${blind.count} rows still have no merchant (${fmtNOK(blind.total)}) — no statement export covers them.`;
};

interface ExcludedNoteProps {
  excluded: ExcludedSummary;
  period: string;
}

/** An audit line, so it always reports the whole period and ignores the filters. */
const ExcludedNote = ({ excluded, period }: ExcludedNoteProps) =>
  excluded.count === 0 ? null : (
    <div className="mt-3 flex items-start gap-1.5 text-[11px] text-ink-muted">
      <Icon aria-hidden icon={InfoIcon} size={13} className="mt-px shrink-0" />
      <span>
        {excluded.count} transaction(s) totalling {fmtNOK(excluded.total)} excluded this {period} (internal transfers, card
        bill payments).
      </span>
    </div>
  );

type SetFilters = Dispatch<SetStateAction<Filters>>;

/** Clicking a bar filters to it; clicking the one already filtered to clears it. */
const pickCategory = (onFilters: SetFilters) => (category: string) =>
  onFilters((f) => ({ ...f, categories: f.categories.length === 1 && f.categories[0] === category ? [] : [category] }));

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
  const cats = stats.categories.map((c) => ({ label: c.category, total: c.total }));
  const cps = stats.topCounterparties.map((c) => ({ label: c.counterparty, total: c.total, count: c.count }));
  const subs = subsAndRecurring(stats);
  const deltas = visibleDeltas(stats.categoryDeltas);

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
        {single && <TransactionsCard txns={shown} />}

        {!single && cats.length > 0 && (
          <Card title="Spending by category" icon={CategoryIcon}>
            <HorizontalBars items={cats} onPick={pickCategory(onFilters)} />
            <TableToggle
              columns={[{ label: 'Category' }, { label: 'Total', num: true }]}
              rows={cats.map((c) => [c.label, fmtNOK(c.total)])}
            />
          </Card>
        )}

        {deltas.length > 0 && (
          <Card title="Biggest changes vs last month" icon={ChangesIcon}>
            <DivergingBars deltas={deltas} onPick={pickCategory(onFilters)} />
            <TableToggle
              columns={[{ label: 'Category' }, { label: 'This month', num: true }, { label: 'Last month', num: true }, { label: 'Delta', num: true }]}
              rows={deltas.map((d) => [d.category, fmtNOK(d.current), fmtNOK(d.previous), `${d.delta > 0 ? '+' : ''}${fmtNOK(d.delta)}`])}
            />
          </Card>
        )}

        {cps.length > 0 && (
          <Card title="Biggest counterparties" icon={CounterpartyIcon}>
            <HorizontalBars items={cps} onPick={pickCounterparty(onFilters)} />
            <TableToggle
              columns={[{ label: 'Counterparty' }, { label: 'Total', num: true }, { label: 'Count', num: true }]}
              rows={cps.map((c) => [c.label, fmtNOK(c.total), String(c.count)])}
            />
          </Card>
        )}

        {subs.length > 0 && (
          <Card title="Subscriptions & recurring" icon={RecurringIcon}>
            <DataTable
              columns={[{ label: 'Date' }, { label: 'Description' }, { label: 'Category' }, { label: 'Amount', num: true }]}
              rows={subs.map((t) => [t.date, t.counterparty ?? t.description, t.category, fmtNOK(t.amount)])}
            />
          </Card>
        )}

        {!single && <TransactionsCard txns={shown} />}
      </div>

      <ExcludedNote excluded={monthStats(month, all).excluded} period="month" />
    </>
  );
};

const YearView = ({ txns, filters, onFilters, period: year }: ViewProps) => {
  const all = txns.filter((t) => inYear(t, year));
  const shown = all.filter((t) => matchesFilters(t, filters));

  const stats = yearStats(year, byMonth(shown));
  const avg = stats.averageMonth;
  const cats = stats.categories.map((c) => ({ label: c.category, total: c.total }));
  const single = filters.categories.length === 1;

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
            <MonthlyGroupedBars series={stats.months} />
            <TableToggle
              columns={[
                { label: 'Month' },
                { label: 'Spent', num: true },
                { label: 'Income', num: true },
                { label: 'Net', num: true },
                { label: 'Card share', num: true },
              ]}
              rows={stats.months.map((m) => [m.month, fmtNOK(m.totalOut), fmtNOK(m.totalIn), fmtNOK(m.net), fmtPct(m.cardShare)])}
            />
          </Card>
        )}

        {!single && cats.length > 0 && (
          <Card title="Spending by category (year)" icon={CategoryIcon}>
            <HorizontalBars items={cats} onPick={pickCategory(onFilters)} />
            <TableToggle
              columns={[{ label: 'Category' }, { label: 'Total', num: true }]}
              rows={cats.map((c) => [c.label, fmtNOK(c.total)])}
            />
          </Card>
        )}

        <TransactionsCard txns={shown} />
      </div>

      <ExcludedNote excluded={yearStats(year, byMonth(all)).excluded} period="year" />
    </>
  );
};

export const App = () => {
  const load = useTransactions();
  const [view, setView] = useState<View>('month');
  const [month, setMonth] = useState<string | null>(null);
  const [year, setYear] = useState<string | null>(null);
  const [filters, setFilters] = useState<Filters>(NO_FILTERS);

  const txns = load.status === 'ready' ? load.txns : [];
  const months = useMemo(() => distinctMonths(txns), [txns]);
  const years = useMemo(() => distinctYears(txns), [txns]);
  const categories = useMemo(() => distinctCategories(txns), [txns]);

  // Latest period, until something is picked. Derived rather than stored, so
  // the first render after the fetch lands is already on the right month.
  const activeMonth = month ?? months[months.length - 1] ?? null;
  const activeYear = year ?? years[years.length - 1] ?? null;

  return (
    <div className="mx-auto max-w-[1180px] px-6 pt-5 pb-16">
      <header className="mb-4 flex flex-wrap items-baseline justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">Spending dashboard</h1>
          <div className="text-[13px] text-ink-soft">
            Served locally from your own machine. Never share this page or a screenshot of it.
          </div>
        </div>
        <button
          type="button"
          onClick={cycleTheme}
          className="flex items-center gap-1.5 rounded-md border border-line bg-surface px-2.5 py-1.5 text-xs text-ink-soft"
        >
          <Icon aria-hidden icon={ThemeIcon} size={14} />
          Toggle theme
        </button>
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
    </div>
  );
};
