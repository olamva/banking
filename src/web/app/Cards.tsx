/**
 * The boxes everything sits in: cards, KPI tiles and tables. Presentation only.
 */
import { useState, type ReactNode } from 'react';
import type { Categorized } from '../../core/types.ts';
import { categoryLabel, fmtNOK, fmtPct } from './format.ts';
import {
  DownIcon,
  FlatIcon,
  Icon,
  SortAscIcon,
  SortDescIcon,
  SortableIcon,
  TransactionsIcon,
  UpIcon,
  type IconSvgElement,
} from './icons.ts';

interface CardProps {
  title: string;
  icon?: IconSvgElement;
  wide?: boolean;
  children: ReactNode;
}

export const Card = ({ title, icon, wide, children }: CardProps) => (
  <div className={`min-w-0 rounded-[10px] border border-line bg-surface p-4 ${wide ? 'col-span-full' : ''}`}>
    <h2 className="mb-2.5 flex items-center gap-1.5 text-sm font-semibold">
      {icon && <Icon aria-hidden icon={icon} size={15} className="shrink-0 text-ink-soft" />}
      {title}
    </h2>
    {children}
  </div>
);

export interface Delta {
  raw: number;
  pct: number;
  good: boolean;
}

/** `goodIfUp` because more income is good and more spending is not. */
export const deltaInfo = (current: number, previous: number, goodIfUp: boolean): Delta => {
  const raw = Math.round((current - previous) * 100) / 100;
  const pct = previous !== 0 ? raw / Math.abs(previous) : raw === 0 ? 0 : 1;
  return { raw, pct, good: raw === 0 ? true : goodIfUp === raw > 0 };
};

interface StatTileProps {
  label: string;
  value: string;
  delta?: Delta;
}

export const StatTile = ({ label, value, delta }: StatTileProps) => (
  <div className="rounded-[10px] border border-line bg-surface px-4 py-3.5">
    <div className="text-xs text-ink-soft">{label}</div>
    <div className="mt-1 text-[26px] font-semibold">{value}</div>
    {delta && (
      <div
        className={`mt-1 flex items-center gap-1 text-xs ${Math.abs(delta.pct) < 0.005 ? 'text-ink-muted' : delta.good ? 'text-good' : 'text-critical'}`}
      >
        {/* Labelled, not decorative: direction is otherwise only in the colour. */}
        <Icon
          role="img"
          aria-label={delta.raw > 0 ? 'up' : delta.raw < 0 ? 'down' : 'unchanged'}
          icon={delta.raw > 0 ? UpIcon : delta.raw < 0 ? DownIcon : FlatIcon}
          size={14}
          className="shrink-0"
        />
        {fmtNOK(Math.abs(delta.raw))} vs last month
      </div>
    )}
  </div>
);

interface MeterTileProps {
  label: string;
  share: number;
  /** Only when there is something to say — an empty note renders nothing. */
  note?: string;
}

export const MeterTile = ({ label, share, note }: MeterTileProps) => (
  <div className="rounded-[10px] border border-line bg-surface px-4 py-3.5">
    <div className="text-xs text-ink-soft">{label}</div>
    <div className="mt-1 text-[26px] font-semibold">{fmtPct(share)}</div>
    <div className="mt-2 h-2.5 overflow-hidden rounded-md bg-series-1-track">
      <div className="h-full rounded-md bg-series-1" style={{ width: `${Math.min(share * 100, 100)}%` }} />
    </div>
    {note && <div className="mt-1.5 text-[11px] text-ink-muted">{note}</div>}
  </div>
);

export interface Column {
  label: string;
  num?: boolean;
  /** Set to make the header a sort button. The caller owns the sort; the header owns the arrow. */
  onClick?: () => void;
  /** Which way this column is sorted, or null when it is sortable but not the sorted one. */
  sort?: 'asc' | 'desc' | null;
}

interface DataTableProps {
  columns: Column[];
  rows: string[][];
  /** Caps the height and pins the header, for the long lists. */
  scroll?: boolean;
}

export const DataTable = ({ columns, rows, scroll }: DataTableProps) => (
  <div className={`mt-2 overflow-x-auto ${scroll ? 'max-h-[460px] overflow-y-auto' : ''}`}>
    <table className="w-full border-collapse text-xs">
      <thead>
        <tr>
          {columns.map((c) => (
            <th
              key={c.label}
              aria-sort={c.sort ? (c.sort === 'asc' ? 'ascending' : 'descending') : undefined}
              className={`border-b border-grid bg-surface py-1 pr-2 font-semibold ${c.num ? 'text-right' : 'text-left'} ${scroll ? 'sticky top-0' : ''}`}
            >
              {c.onClick ? (
                <button
                  type="button"
                  onClick={c.onClick}
                  className="inline-flex items-center gap-1 font-semibold text-ink-soft hover:text-ink"
                >
                  {c.label}
                  {/* Always shown, so a sortable column looks sortable before anyone hovers it.
                      Decorative — `aria-sort` on the `th` above says the same thing. */}
                  <Icon
                    aria-hidden
                    icon={c.sort === 'asc' ? SortAscIcon : c.sort === 'desc' ? SortDescIcon : SortableIcon}
                    size={13}
                    className={`shrink-0 ${c.sort ? '' : 'text-ink-muted opacity-50'}`}
                  />
                </button>
              ) : (
                c.label
              )}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, i) => (
          <tr key={i} className="hover:bg-hover">
            {row.map((cell, j) => (
              <td key={j} className={`border-b border-grid py-1 pr-2 ${columns[j]?.num ? 'text-right tabular-nums' : 'text-left'}`}>
                {cell}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

const merchantOf = (t: Categorized) => t.counterparty ?? t.description;

const SORTS = {
  date: (a: Categorized, b: Categorized) => a.date.localeCompare(b.date),
  merchant: (a: Categorized, b: Categorized) => merchantOf(a).localeCompare(merchantOf(b)),
  // On the label, not the slug, so the order matches the column: `Strøm` belongs
  // under S, where it reads, and not under the `stroem` nobody sees.
  category: (a: Categorized, b: Categorized) => categoryLabel(a.category).localeCompare(categoryLabel(b.category)),
  amount: (a: Categorized, b: Categorized) => a.amount - b.amount,
};

type SortKey = keyof typeof SORTS;

interface TransactionsCardProps {
  txns: Categorized[];
}

/**
 * Every row in view, newest first. It has a view of its own now — the dashboards
 * are the charts, this is the rows behind them.
 *
 * ponytail: renders every row. A year is a couple of thousand `<tr>` and the
 * page is local — virtualise or paginate only if that ever gets slow.
 */
export const TransactionsCard = ({ txns }: TransactionsCardProps) => {
  const [by, setBy] = useState<SortKey | null>('date');
  const [asc, setAsc] = useState(false);

  const sorted = by ? [...txns].sort((a, b) => (asc ? 1 : -1) * SORTS[by](a, b)) : txns;

  // Names A-Z on first click, everything else biggest/newest first. A third
  // click drops the sort and the rows fall back to the order they arrived in.
  const firstAsc = (key: SortKey) => key === 'merchant' || key === 'category';
  const head = (label: string, key: SortKey, num?: boolean): Column => ({
    label,
    num,
    sort: by === key ? (asc ? 'asc' : 'desc') : null,
    onClick: () =>
      by !== key
        ? (setBy(key), setAsc(firstAsc(key)))
        : asc === firstAsc(key)
          ? setAsc(!asc)
          : setBy(null),
  });

  return (
    <Card title={`Transactions (${txns.length})`} icon={TransactionsIcon} wide>
      {sorted.length === 0 ? (
        <div className="py-10 text-center text-ink-muted">No transactions match the current filters.</div>
      ) : (
        <DataTable
          scroll
          columns={[
            head('Date', 'date'),
            head('Merchant / description', 'merchant'),
            head('Category', 'category'),
            { label: 'Source' },
            head('Amount', 'amount', true),
          ]}
          rows={sorted.map((t) => [
            t.date,
            merchantOf(t),
            categoryLabel(t.category),
            t.source === 'card' ? 'card' : 'bank',
            fmtNOK(t.amount),
          ])}
        />
      )}
    </Card>
  );
};
