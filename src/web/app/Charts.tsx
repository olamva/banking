/**
 * Hand-drawn SVG, no chart library. Each chart measures its own box and lays
 * out in pixel coordinates; colours come from the theme variables in
 * index.css, which is what makes them follow dark mode without a `dark:` twin
 * on every fill.
 *
 * Nothing here sums anything — every number arrives already aggregated by
 * src/core/stats.ts.
 */
import { useState, type ReactNode } from 'react';
import type { CategoryDelta, MonthSummary } from '../../core/stats.ts';
import { fmtNOK, fmtPct, monthLabel, niceStep, useWidth } from './format.ts';

interface TipState {
  x: number;
  y: number;
  content: ReactNode;
}

/** One floating tooltip per chart — only one can be hovered at a time anyway. */
const useTooltip = () => {
  const [tip, setTip] = useState<TipState | null>(null);

  const bind = (content: ReactNode) => ({
    onPointerMove: (e: React.PointerEvent) => setTip({ x: e.clientX, y: e.clientY, content }),
    onPointerLeave: () => setTip(null),
  });

  const node = tip ? (
    <div
      className="pointer-events-none fixed z-10 max-w-60 rounded-md border border-line bg-surface px-2.5 py-1.5 text-xs text-ink shadow-lg"
      style={{ left: Math.min(tip.x + 14, window.innerWidth - 250), top: Math.min(tip.y + 14, window.innerHeight - 100) }}
    >
      {tip.content}
    </div>
  ) : null;

  return { bind, node };
};

interface EmptyProps {
  children: ReactNode;
}

const Empty = ({ children }: EmptyProps) => <div className="py-10 text-center text-ink-muted">{children}</div>;

export interface BarItem {
  label: string;
  total: number;
  count?: number;
}

interface HorizontalBarsProps {
  items: BarItem[];
  /** Given, every bar becomes a filter button for its own label. */
  onPick?: (label: string) => void;
}

/** Category totals or top counterparties. One hue — this encodes magnitude, not identity. */
export const HorizontalBars = ({ items, onPick }: HorizontalBarsProps) => {
  const [ref, width] = useWidth();
  const { bind, node } = useTooltip();

  const rowH = 26;
  const labelW = 130;
  const barAreaW = Math.max(width - labelW - 60, 20);
  const height = items.length * rowH + 8;
  const maxVal = Math.max(...items.map((i) => i.total), 1);

  return (
    <div ref={ref}>
      {items.length === 0 ? (
        <Empty>Nothing in this range.</Empty>
      ) : (
        <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
          {items.map((item, i) => {
            const y = i * rowH + 4;
            const w = Math.max((item.total / maxVal) * barAreaW, 1);
            return (
              <g key={item.label}>
                <text x={labelW - 8} y={y + 16} textAnchor="end" className="fill-ink-soft text-[11px]">
                  {item.label}
                </text>
                <rect
                  x={labelW}
                  y={y + 3}
                  width={w}
                  height={16}
                  rx={4}
                  onClick={onPick && (() => onPick(item.label))}
                  className={`fill-series-1 hover:opacity-85 ${onPick ? 'cursor-pointer' : 'cursor-default'}`}
                  {...bind(
                    <>
                      <div className="text-ink-soft">{item.label}</div>
                      <div className="font-semibold">
                        {fmtNOK(item.total)}
                        {item.count ? ` · ${item.count} txns` : ''}
                      </div>
                    </>,
                  )}
                />
                <text x={labelW + w + 8} y={y + 16} className="fill-ink text-[11px] font-semibold">
                  {fmtNOK(item.total)}
                </text>
              </g>
            );
          })}
        </svg>
      )}
      {node}
    </div>
  );
};

/**
 * The bars worth drawing: the eight biggest moves, rounding noise dropped. The
 * caller trims, so it can tell an empty chart from a full one and hide the card.
 */
export const visibleDeltas = (deltas: CategoryDelta[]): CategoryDelta[] =>
  deltas.filter((d) => Math.abs(d.delta) > 0.5).slice(0, 8);

interface DivergingBarsProps {
  /** Already trimmed by the caller — see `visibleDeltas`. */
  deltas: CategoryDelta[];
  /** Given, every bar becomes a filter button for its own category. */
  onPick?: (category: string) => void;
}

/** Red spent more, blue spent less. Diverging, because zero is the meaningful middle. */
export const DivergingBars = ({ deltas: shown, onPick }: DivergingBarsProps) => {
  const [ref, width] = useWidth();
  const { bind, node } = useTooltip();

  const rowH = 26;
  const mid = width / 2;
  const halfW = Math.max(width / 2 - 90, 20);
  const height = shown.length * rowH + 8;
  const maxAbs = Math.max(...shown.map((d) => Math.abs(d.delta)), 1);

  return (
    <div ref={ref}>
      {shown.length === 0 ? (
        <Empty>No change from last month.</Empty>
      ) : (
        <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
          <line x1={mid} x2={mid} y1={0} y2={height} className="stroke-axis" />
          {shown.map((d, i) => {
            const y = i * rowH + 4;
            const w = Math.max((Math.abs(d.delta) / maxAbs) * halfW, 1);
            const positive = d.delta > 0;
            return (
              <g key={d.category}>
                <rect
                  x={positive ? mid : mid - w}
                  y={y + 3}
                  width={w}
                  height={16}
                  rx={4}
                  onClick={onPick && (() => onPick(d.category))}
                  className={`hover:opacity-85 ${onPick ? 'cursor-pointer' : 'cursor-default'} ${positive ? 'fill-up' : 'fill-down'}`}
                  {...bind(
                    <>
                      <div className="text-ink-soft">{d.category}</div>
                      <div className="font-semibold">
                        {positive ? '+' : ''}
                        {fmtNOK(d.delta)}
                      </div>
                      <div className="text-ink-soft">was {fmtNOK(d.previous)}</div>
                    </>,
                  )}
                />
                <text
                  x={positive ? mid - w - 8 : mid + w + 8}
                  y={y + 16}
                  textAnchor={positive ? 'end' : 'start'}
                  className="fill-ink-soft text-[11px]"
                >
                  {d.category}
                </text>
              </g>
            );
          })}
        </svg>
      )}
      {node}
    </div>
  );
};

interface MonthlyGroupedBarsProps {
  series: MonthSummary[];
}

/** Spent against income, month by month across a year. */
export const MonthlyGroupedBars = ({ series }: MonthlyGroupedBarsProps) => {
  const [ref, width] = useWidth(500);
  const { bind, node } = useTooltip();

  const height = 220;
  const padL = 50;
  const padB = 24;
  const padT = 10;
  const plotW = Math.max(width - padL - 16, 20);
  const plotH = height - padB - padT;
  const maxVal = Math.max(...series.map((m) => Math.max(m.totalIn, m.totalOut)), 1);
  const step = niceStep(maxVal);
  const gridMax = Math.ceil(maxVal / step) * step;
  const clusterW = plotW / Math.max(series.length, 1);
  const barW = Math.min(24, clusterW / 3);
  const ticks = Array.from({ length: Math.floor(gridMax / step) + 1 }, (_, i) => i * step);

  return (
    <div ref={ref}>
      {series.length === 0 ? (
        <Empty>No months in range.</Empty>
      ) : (
        <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
          {ticks.map((v) => {
            const gy = padT + plotH - (v / gridMax) * plotH;
            return (
              <g key={v}>
                <line x1={padL} x2={width - 8} y1={gy} y2={gy} className="stroke-grid" />
                <text x={padL - 8} y={gy + 3} textAnchor="end" className="fill-ink-muted text-[11px]">
                  {fmtNOK(v).replace(' kr', '')}
                </text>
              </g>
            );
          })}
          {series.map((m, i) => {
            const cx = padL + i * clusterW + clusterW / 2;
            const outH = (m.totalOut / gridMax) * plotH;
            const inH = (m.totalIn / gridMax) * plotH;
            const tip = (
              <>
                <div className="text-ink-soft">{m.month}</div>
                <div className="font-semibold">out {fmtNOK(m.totalOut)}</div>
                <div className="font-semibold">in {fmtNOK(m.totalIn)}</div>
                <div className="text-ink-soft">
                  net {fmtNOK(m.net)} · card {fmtPct(m.cardShare)}
                </div>
              </>
            );
            return (
              <g key={m.month}>
                <rect x={cx - barW - 1} y={padT + plotH - outH} width={barW} height={Math.max(outH, 0)} rx={3} className="cursor-default fill-series-1 hover:opacity-85" {...bind(tip)} />
                <rect x={cx + 1} y={padT + plotH - inH} width={barW} height={Math.max(inH, 0)} rx={3} className="cursor-default fill-series-2 hover:opacity-85" {...bind(tip)} />
                <text x={cx} y={height - 6} textAnchor="middle" className="fill-ink-muted text-[11px]">
                  {monthLabel(m.month)}
                </text>
              </g>
            );
          })}
          <line x1={padL} x2={padL} y1={padT} y2={padT + plotH} className="stroke-axis" />
          <line x1={padL} x2={width - 8} y1={padT + plotH} y2={padT + plotH} className="stroke-axis" />
        </svg>
      )}
      {node}
    </div>
  );
};

export const ChartLegend = () => (
  <div className="mb-2 flex gap-3.5 text-xs text-ink-soft">
    <span className="inline-flex items-center gap-1.5">
      <span className="inline-block h-[3px] w-3 rounded-sm bg-series-1" />
      Spent
    </span>
    <span className="inline-flex items-center gap-1.5">
      <span className="inline-block h-[3px] w-3 rounded-sm bg-series-2" />
      Income
    </span>
  </div>
);
