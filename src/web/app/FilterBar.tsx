/**
 * The one control surface. Categories are chips rather than a select, because
 * any number of them can be on at once and ctrl-clicking a multi-select is not
 * something anyone should have to do.
 */
import type { Filters } from '../../core/select.ts';
import { NO_FILTERS } from '../../core/select.ts';
import { categoryLabel } from './format.ts';
import { Icon, ResetFiltersIcon, SearchIcon } from './icons.ts';

export type View = 'month' | 'year' | 'transactions';

interface FilterBarProps {
  view: View;
  onView: (view: View) => void;
  months: string[];
  month: string | null;
  onMonth: (month: string) => void;
  years: string[];
  year: string | null;
  onYear: (year: string) => void;
  /** The transactions view's period, in days back from today. Null is all time. */
  days: number | null;
  onDays: (days: number | null) => void;
  categories: string[];
  filters: Filters;
  onFilters: (filters: Filters) => void;
}

const CONTROL = 'rounded-md border border-line bg-page px-2 py-1.5 text-[13px] text-ink';

export const FilterBar = ({ view, onView, months, month, onMonth, years, year, onYear, days, onDays, categories, filters, onFilters }: FilterBarProps) => {
  const toggleCategory = (cat: string) => {
    const on = filters.categories.includes(cat);
    onFilters({ ...filters, categories: on ? filters.categories.filter((c) => c !== cat) : [...filters.categories, cat] });
  };

  const amount = (key: 'minAmount' | 'maxAmount') => (e: React.ChangeEvent<HTMLInputElement>) =>
    onFilters({ ...filters, [key]: e.target.value === '' ? null : Number(e.target.value) });

  return (
    <div className="mb-5 flex flex-wrap items-center gap-2 rounded-[10px] border border-line bg-surface px-3 py-2.5">
      <div className="inline-flex overflow-hidden rounded-md border border-line">
        {(['month', 'year', 'transactions'] as const).map((v) => (
          <button
            key={v}
            type="button"
            aria-pressed={view === v}
            onClick={() => onView(v)}
            className={`px-3 py-1.5 text-[13px] capitalize ${view === v ? 'bg-series-1 text-white' : 'bg-page text-ink-soft'}`}
          >
            {v}
          </button>
        ))}
      </div>

      {view === 'month' && (
        <select className={CONTROL} value={month ?? ''} onChange={(e) => onMonth(e.target.value)} aria-label="Month">
          {months.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
      )}
      {view === 'year' && (
        <select className={CONTROL} value={year ?? ''} onChange={(e) => onYear(e.target.value)} aria-label="Year">
          {years.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
      )}
      {view === 'transactions' && (
        <select
          className={CONTROL}
          value={days ?? ''}
          onChange={(e) => onDays(e.target.value ? Number(e.target.value) : null)}
          aria-label="Period"
        >
          {/* Shortest first; all time is still the default, it just sits last. */}
          <option value="30">Last 30 days</option>
          <option value="90">Last 90 days</option>
          <option value="">All time</option>
        </select>
      )}

      <div className="relative">
        <Icon
          aria-hidden
          icon={SearchIcon}
          size={14}
          className="pointer-events-none absolute top-1/2 left-2 -translate-y-1/2 text-ink-muted"
        />
        <input
          type="search"
          className={`${CONTROL} w-44 pl-7`}
          placeholder="Search description…"
          value={filters.search}
          onChange={(e) => onFilters({ ...filters, search: e.target.value })}
          aria-label="Search description"
        />
      </div>
      <input
        type="number"
        className={`${CONTROL} w-24`}
        placeholder="Min NOK"
        value={filters.minAmount ?? ''}
        onChange={amount('minAmount')}
        aria-label="Minimum amount"
      />
      <input
        type="number"
        className={`${CONTROL} w-24`}
        placeholder="Max NOK"
        value={filters.maxAmount ?? ''}
        onChange={amount('maxAmount')}
        aria-label="Maximum amount"
      />

      <button
        type="button"
        onClick={() => onFilters(NO_FILTERS)}
        className="ml-auto flex items-center gap-1.5 rounded-md border border-line px-2.5 py-1.5 text-xs text-ink-muted"
      >
        <Icon aria-hidden icon={ResetFiltersIcon} size={14} />
        Reset filters
      </button>

      <div className="flex basis-full flex-wrap gap-1.5" role="group" aria-label="Filter by category">
        {categories.map((c) => {
          const on = filters.categories.includes(c);
          return (
            <button
              key={c}
              type="button"
              aria-pressed={on}
              onClick={() => toggleCategory(c)}
              className={`rounded-full border px-2.5 py-1 text-xs ${on ? 'border-series-1 bg-series-1 text-white' : 'border-line bg-page text-ink-soft'}`}
            >
              {categoryLabel(c)}
            </button>
          );
        })}
      </div>
    </div>
  );
};
