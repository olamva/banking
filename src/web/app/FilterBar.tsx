/**
 * The one control surface. Categories are chips rather than a select, because
 * any number of them can be on at once and ctrl-clicking a multi-select is not
 * something anyone should have to do.
 */
import type { Filters } from '../../core/select.ts';
import { NO_FILTERS } from '../../core/select.ts';

export type View = 'month' | 'year';

interface FilterBarProps {
  view: View;
  onView: (view: View) => void;
  months: string[];
  month: string | null;
  onMonth: (month: string) => void;
  years: string[];
  year: string | null;
  onYear: (year: string) => void;
  categories: string[];
  filters: Filters;
  onFilters: (filters: Filters) => void;
}

const CONTROL = 'rounded-md border border-line bg-page px-2 py-1.5 text-[13px] text-ink';

export const FilterBar = ({ view, onView, months, month, onMonth, years, year, onYear, categories, filters, onFilters }: FilterBarProps) => {
  const toggleCategory = (cat: string) => {
    const on = filters.categories.includes(cat);
    onFilters({ ...filters, categories: on ? filters.categories.filter((c) => c !== cat) : [...filters.categories, cat] });
  };

  const amount = (key: 'minAmount' | 'maxAmount') => (e: React.ChangeEvent<HTMLInputElement>) =>
    onFilters({ ...filters, [key]: e.target.value === '' ? null : Number(e.target.value) });

  return (
    <div className="mb-5 flex flex-wrap items-center gap-2 rounded-[10px] border border-line bg-surface px-3 py-2.5">
      <div className="inline-flex overflow-hidden rounded-md border border-line">
        {(['month', 'year'] as const).map((v) => (
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

      {view === 'month' ? (
        <select className={CONTROL} value={month ?? ''} onChange={(e) => onMonth(e.target.value)} aria-label="Month">
          {months.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
      ) : (
        <select className={CONTROL} value={year ?? ''} onChange={(e) => onYear(e.target.value)} aria-label="Year">
          {years.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
      )}

      <select
        className={CONTROL}
        value={filters.source}
        onChange={(e) => onFilters({ ...filters, source: e.target.value as Filters['source'] })}
        aria-label="Source"
      >
        <option value="">Bank + card</option>
        <option value="sb1">Bank only</option>
        <option value="card">Card only</option>
      </select>

      <input
        type="search"
        className={`${CONTROL} w-40`}
        placeholder="Search description…"
        value={filters.search}
        onChange={(e) => onFilters({ ...filters, search: e.target.value })}
        aria-label="Search description"
      />
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
        className="ml-auto rounded-md border border-line px-2.5 py-1.5 text-xs text-ink-muted"
      >
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
              {c}
            </button>
          );
        })}
      </div>
    </div>
  );
};
