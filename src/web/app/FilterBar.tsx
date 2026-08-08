/**
 * The one control surface: what period you are looking at, and which categories
 * are in play.
 *
 * Categories are picked from a dropdown and removed from chips. The dropdown
 * holds checkboxes rather than being a `<select multiple>`, because ctrl-
 * clicking a multi-select is not something anyone should have to do; the chips
 * exist so an active filter is always visible and always one click from gone —
 * a filter you cannot see is a filter you cannot turn off.
 */
import type { Filters } from '../../core/select.ts';
import { NO_FILTERS } from '../../core/select.ts';
import { categoryLabel } from './format.ts';
import { CloseIcon, Icon, ResetFiltersIcon } from './icons.ts';

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

interface ChipProps {
  label: string;
  onRemove: () => void;
}

/** An active filter, and the way to drop it. */
const Chip = ({ label, onRemove }: ChipProps) => (
  <button
    type="button"
    onClick={onRemove}
    className="flex items-center gap-1 rounded-full border border-series-1 bg-series-1 py-1 pr-1.5 pl-2.5 text-xs text-white"
  >
    {label}
    <Icon role="img" aria-label={`Remove ${label}`} icon={CloseIcon} size={12} className="shrink-0 opacity-80" />
  </button>
);

export const FilterBar = ({ view, onView, months, month, onMonth, years, year, onYear, days, onDays, categories, filters, onFilters }: FilterBarProps) => {
  const toggleCategory = (cat: string) => {
    const on = filters.categories.includes(cat);
    onFilters({ ...filters, categories: on ? filters.categories.filter((c) => c !== cat) : [...filters.categories, cat] });
  };

  const picked = filters.categories.length;
  const dirty = picked > 0 || filters.search !== '';

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

      {/* `details` rather than a button and an open flag: the disclosure state is
          the browser's problem, and there is none of ours to get out of sync. */}
      <details className="relative">
        <summary className={`${CONTROL} cursor-pointer list-none marker:content-none`}>
          Categories{picked > 0 && ` (${picked})`}
        </summary>
        <div className="absolute z-20 mt-1 max-h-72 w-56 overflow-y-auto rounded-md border border-line bg-surface p-1.5 shadow-lg">
          {categories.length === 0 ? (
            <div className="px-1.5 py-1 text-xs text-ink-muted">Nothing in this period.</div>
          ) : (
            categories.map((c) => (
              <label key={c} className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-[13px] hover:bg-hover">
                <input type="checkbox" checked={filters.categories.includes(c)} onChange={() => toggleCategory(c)} />
                {categoryLabel(c)}
              </label>
            ))
          )}
        </div>
      </details>

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

      {dirty && (
        <div className="flex basis-full flex-wrap gap-1.5" role="group" aria-label="Active filters">
          {filters.categories.map((c) => (
            <Chip key={c} label={categoryLabel(c)} onRemove={() => toggleCategory(c)} />
          ))}
          {/* The search box lives on the transactions table, so without this a
              search set there would be invisible everywhere else. */}
          {filters.search && (
            <Chip label={`“${filters.search}”`} onRemove={() => onFilters({ ...filters, search: '' })} />
          )}
        </div>
      )}
    </div>
  );
};
