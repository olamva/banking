/**
 * The boxes everything sits in: cards, KPI tiles and tables. Presentation only.
 */
import { useState, type ReactNode } from 'react';
import type { Categorized } from '../../core/types.ts';
import { fmtNOK, fmtPct } from './format.ts';

interface CardProps {
  title: string;
  wide?: boolean;
  children: ReactNode;
}

export const Card = ({ title, wide, children }: CardProps) => (
  <div className={`min-w-0 rounded-[10px] border border-line bg-surface p-4 ${wide ? 'col-span-full' : ''}`}>
    <h2 className="mb-2.5 text-sm font-semibold">{title}</h2>
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
      <div className={`mt-1 text-xs ${Math.abs(delta.pct) < 0.005 ? 'text-ink-muted' : delta.good ? 'text-good' : 'text-critical'}`}>
        {delta.raw > 0 ? '↑' : delta.raw < 0 ? '↓' : '→'} {fmtNOK(Math.abs(delta.raw))} vs last month
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
  /** Set to make the header a sort button. The caller owns the sort and the arrow in `label`. */
  onClick?: () => void;
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
              className={`border-b border-grid bg-surface py-1 pr-2 font-semibold ${c.num ? 'text-right' : 'text-left'} ${scroll ? 'sticky top-0' : ''}`}
            >
              {c.onClick ? (
                <button type="button" onClick={c.onClick} className="font-semibold text-ink-soft hover:text-ink">
                  {c.label}
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

interface TableToggleProps {
  columns: Column[];
  rows: string[][];
}

/** The numbers behind a chart, one click away — collapsed so they stay out of the way. */
export const TableToggle = ({ columns, rows }: TableToggleProps) => (
  <details className="mt-2.5">
    <summary className="cursor-pointer text-xs text-ink-muted">Table</summary>
    <DataTable columns={columns} rows={rows} />
  </details>
);

const merchantOf = (t: Categorized) => t.counterparty ?? t.description;

const SORTS = {
  date: (a: Categorized, b: Categorized) => a.date.localeCompare(b.date),
  merchant: (a: Categorized, b: Categorized) => merchantOf(a).localeCompare(merchantOf(b)),
  amount: (a: Categorized, b: Categorized) => a.amount - b.amount,
};

type SortKey = keyof typeof SORTS;

interface TransactionsCardProps {
  txns: Categorized[];
}

/**
 * Every row in view, newest first. With one category picked this is the whole
 * point of the page, so it leads; otherwise it sits below the charts as the
 * detail behind them.
 *
 * ponytail: renders every row. A year is a couple of thousand `<tr>` and the
 * page is local — virtualise or paginate only if that ever gets slow.
 */
export const TransactionsCard = ({ txns }: TransactionsCardProps) => {
  const [by, setBy] = useState<SortKey>('date');
  const [asc, setAsc] = useState(false);

  const sorted = [...txns].sort((a, b) => (asc ? 1 : -1) * SORTS[by](a, b));

  // Names A-Z on first click, everything else biggest/newest first.
  const head = (label: string, key: SortKey, num?: boolean): Column => ({
    label: by === key ? `${label} ${asc ? '↑' : '↓'}` : label,
    num,
    onClick: () => (by === key ? setAsc(!asc) : (setBy(key), setAsc(key === 'merchant'))),
  });

  return (
    <Card title={`Transactions (${txns.length})`} wide>
      {sorted.length === 0 ? (
        <div className="py-10 text-center text-ink-muted">No transactions match the current filters.</div>
      ) : (
        <DataTable
          scroll
          columns={[
            head('Date', 'date'),
            head('Merchant / description', 'merchant'),
            { label: 'Category' },
            { label: 'Source' },
            head('Amount', 'amount', true),
          ]}
          rows={sorted.map((t) => [
            t.date,
            merchantOf(t),
            t.category,
            t.source === 'card' ? 'card' : 'bank',
            fmtNOK(t.amount),
          ])}
        />
      )}
    </Card>
  );
};
