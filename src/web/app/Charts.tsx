/**
 * Hand-drawn SVG, no chart library. Each chart measures its own box and lays
 * out in pixel coordinates; colours come from the theme variables in
 * index.css, which is what makes them follow dark mode without a `dark:` twin
 * on every fill.
 *
 * Nothing here sums anything — every number arrives already aggregated by
 * src/core/stats.ts.
 */
import { useId, useState, type ReactNode } from 'react';
import { withGaps, type CategoryDelta, type MonthSummary } from '../../core/stats.ts';
import { fmtNOK, fmtPct, monthLabel, niceStep, useWidth } from './format.ts';

interface TipState {
  x: number;
  y: number;
  content: ReactNode;
}

/** One floating tooltip per chart — only one can be hovered at a time anyway. */
const useTooltip = () => {
  const [tip, setTip] = useState<TipState | null>(null);

  /** For a chart whose content depends on where the pointer is, not on what it is over. */
  const show = (e: React.PointerEvent, content: ReactNode) => setTip({ x: e.clientX, y: e.clientY, content });
  const hide = () => setTip(null);

  const bind = (content: ReactNode) => ({
    onPointerMove: (e: React.PointerEvent) => show(e, content),
    onPointerLeave: hide,
  });

  const node = tip ? (
    <div
      className="pointer-events-none fixed z-10 max-w-60 rounded-md border border-line bg-surface px-2.5 py-1.5 text-xs text-ink shadow-lg"
      style={{ left: Math.min(tip.x + 14, window.innerWidth - 250), top: Math.min(tip.y + 14, window.innerHeight - 100) }}
    >
      {tip.content}
    </div>
  ) : null;

  return { bind, show, hide, node };
};

interface EmptyProps {
  children: ReactNode;
}

const Empty = ({ children }: EmptyProps) => <div className="py-10 text-center text-ink-muted">{children}</div>;

/** SVG has no text-overflow; 11px system-ui averages ~5.6px a character. */
const ellipsis = (s: string, px: number) => {
  const max = Math.max(Math.floor(px / 5.6), 3);
  return s.length > max ? s.slice(0, max - 1) + '…' : s;
};

export interface BarItem {
  label: string;
  total: number;
  count?: number;
}

interface HorizontalBarsProps {
  items: BarItem[];
  /**
   * Given, every bar becomes a filter button for its own label. The second
   * argument is whether the meta key was held — the chart does not know what
   * that means, only that it happened.
   */
  onPick?: (label: string, meta: boolean) => void;
}

/** Category totals or top counterparties. One hue — this encodes magnitude, not identity. */
export const HorizontalBars = ({ items, onPick }: HorizontalBarsProps) => {
  const [ref, width] = useWidth();
  const { bind, node } = useTooltip();

  const rowH = 26;
  const labelW = 130;
  // The 78 is the value label's own room: a full-width bar would push it off the right edge.
  const barAreaW = Math.max(width - labelW - 78, 20);
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
                  <title>{item.label}</title>
                  {ellipsis(item.label, labelW - 8)}
                </text>
                <rect
                  x={labelW}
                  y={y + 3}
                  width={w}
                  height={16}
                  rx={4}
                  onClick={onPick && ((e) => onPick(item.label, e.metaKey))}
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
  /** Given, every bar becomes a filter button for its own category; see `HorizontalBars`. */
  onPick?: (category: string, meta: boolean) => void;
}

/** Red spent more, green spent less. Diverging, because zero is the meaningful middle. */
export const DivergingBars = ({ deltas: shown, onPick }: DivergingBarsProps) => {
  const [ref, width] = useWidth();
  const { bind, node } = useTooltip();

  const rowH = 26;
  const mid = width / 2;
  const halfW = Math.max(width / 2 - 90, 20);
  const height = shown.length * rowH + 8;
  const maxAbs = Math.max(...shown.map((d) => Math.abs(d.delta)), 1);

  // Doubled, because niceStep sizes for one axis and this one spends its range
  // on both sides of zero — otherwise the gridlines come out twice as dense.
  const step = niceStep(maxAbs * 2);
  const gridMax = Math.ceil(maxAbs / step) * step;
  const ticks = Array.from({ length: Math.floor(gridMax / step) }, (_, i) => (i + 1) * step);

  return (
    <div ref={ref}>
      {shown.length === 0 ? (
        <Empty>No change from last month.</Empty>
      ) : (
        <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
          {/* Gridlines only, no tick row: at card width the labels collided into
              each other, and every bar carries its own number anyway. These are
              for comparing bars against each other, not for reading a value off. */}
          {ticks.map((v) => {
            const dx = (v / gridMax) * halfW;
            return (
              <g key={v}>
                <line x1={mid - dx} x2={mid - dx} y1={0} y2={height} className="stroke-grid" />
                <line x1={mid + dx} x2={mid + dx} y1={0} y2={height} className="stroke-grid" />
              </g>
            );
          })}
          <line x1={mid} x2={mid} y1={0} y2={height} className="stroke-axis" />
          {shown.map((d, i) => {
            const y = i * rowH + 4;
            const w = Math.max((Math.abs(d.delta) / gridMax) * halfW, 1);
            const positive = d.delta > 0;
            return (
              <g key={d.category}>
                <rect
                  x={positive ? mid : mid - w}
                  y={y + 3}
                  width={w}
                  height={16}
                  rx={4}
                  onClick={onPick && ((e) => onPick(d.category, e.metaKey))}
                  className={`hover:opacity-85 ${onPick ? 'cursor-pointer' : 'cursor-default'} ${positive ? 'fill-critical-strong' : 'fill-good-strong'}`}
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
                  <title>{d.category}</title>
                  {ellipsis(d.category, (positive ? mid - w : width - mid - w) - 8)}
                </text>
                {/* The exact number at the bar's own end — the gridlines are for comparing, this is for reading. */}
                <text
                  x={positive ? mid + w + 6 : mid - w - 6}
                  y={y + 16}
                  textAnchor={positive ? 'start' : 'end'}
                  className="fill-ink text-[11px] font-semibold"
                >
                  {positive ? '+' : ''}
                  {fmtNOK(d.delta)}
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

interface MonthlyLinesProps {
  series: MonthSummary[];
}

/** Spent against income, month by month across a year. */
export const MonthlyLines = ({ series }: MonthlyLinesProps) => {
  const [ref, width] = useWidth(500);
  const { show, hide, node } = useTooltip();
  const [near, setNear] = useState<number | null>(null);

  /**
   * The caption row only earns its 14px when the axis crosses a year boundary.
   * A single year is already named by the filter that selected it, so there it
   * is dead space, and the gutter goes back to one row.
   */
  const multiYear = new Set(series.map((m) => m.month.slice(0, 4))).size > 1;
  const height = multiYear ? 234 : 220;
  const padL = 50;
  const padB = multiYear ? 38 : 24;
  const padT = 10;
  const plotW = Math.max(width - padL - 16, 20);
  const plotH = height - padB - padT;
  const maxVal = Math.max(...series.map((m) => Math.max(m.totalIn, m.totalOut)), 1);
  const step = niceStep(maxVal);
  const gridMax = Math.ceil(maxVal / step) * step;
  /**
   * The x axis is the calendar, not the array: a month with no data still takes
   * up its own slot, so a hole in the record is a hole on the page. Without it
   * the axis silently relabels itself and May sits next to August looking like
   * June.
   */
  const dense = withGaps(series);
  const clusterW = plotW / Math.max(dense.length, 1);
  const ticks = Array.from({ length: Math.floor(gridMax / step) + 1 }, (_, i) => i * step);
  const px = (i: number) => padL + i * clusterW + clusterW / 2;
  const py = (v: number) => padT + plotH - (v / gridMax) * plotH;

  /**
   * A year or two fits every month; past that the labels run into each other.
   * Thin them on a calendar-anchored stride, never on the array index, so the
   * kept labels land on the same months in every year.
   */
  const every = [1, 2, 3, 4, 6, 12].find((n) => n * clusterW >= 30) ?? 12;
  const axisLabel = (month: string) =>
    (Number(month.slice(5)) - 1) % every === 0 ? monthLabel(month) : null;

  /**
   * The year is named once, under the stretch of months it covers, rather than
   * on one of them — the month row repeats `jan..des` and says nothing about
   * which pass through the calendar it is on. Centred on the months actually
   * present, so a part year sits under its own half.
   */
  const years = !multiYear
    ? []
    : [...new Set(dense.filter((m) => m !== null).map((m) => m.month.slice(0, 4)))].map((y) => {
        const at = dense.flatMap((m, i) => (m?.month.startsWith(y) ? [i] : []));
        return { y, x: (px(at[0]!) + px(at.at(-1)!)) / 2 };
      });

  /**
   * The months either side of a gap are not neighbours, so nothing may be drawn
   * between them. Each unbroken stretch gets its own lines and its own band; a
   * stretch of one month draws no line at all and is carried by its dot.
   */
  const runs: { m: MonthSummary; i: number }[][] = [];
  dense.forEach((m, i) => {
    if (!m) return;
    const open = runs.at(-1);
    if (open && open.at(-1)!.i === i - 1) open.push({ m, i });
    else runs.push([{ m, i }]);
  });

  const pts = (run: { m: MonthSummary; i: number }[], pick: (m: MonthSummary) => number) =>
    run.map(({ m, i }) => `${px(i)},${py(pick(m))}`);

  const clip = useId();

  const tipFor = (m: MonthSummary) => (
    <>
      <div className="text-ink-soft">{m.month}</div>
      <div className="font-semibold">out {fmtNOK(m.totalOut)}</div>
      <div className="font-semibold">in {fmtNOK(m.totalIn)}</div>
      {/* No card spend in the month means no card line — a `card 0%` is the
          absence of a thing, dressed up as a measurement of it. */}
      <div className="text-ink-soft">
        net {fmtNOK(m.net)}
        {m.cardShare > 0 && ` · card ${fmtPct(m.cardShare)}`}
      </div>
    </>
  );

  /**
   * The whole plot is the target, not the dots: a 3px circle is a hard thing to
   * hit, and on a chart with one point per month the nearest x is unambiguous.
   */
  const track = (e: React.PointerEvent<SVGRectElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    const i = Math.round((e.clientX - box.left - clusterW / 2) / clusterW);
    const at = Math.max(0, Math.min(dense.length - 1, i));
    const m = dense[at];
    // Over a gap there is nothing to report, and the nearest month is a guess
    // in two directions — so the tooltip goes rather than naming a month the
    // pointer is not on.
    if (!m) return leave();
    setNear(at);
    show(e, tipFor(m));
  };

  const leave = () => {
    setNear(null);
    hide();
  };

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
          {/* A soft rule on the des|jan seam. The axis is a run of repeating
              month names, so the year break is the one landmark on it. Drawn
              before the bands, so it reads as ground rather than data. */}
          {dense.map((m, i) =>
            m && i > 0 && m.month.endsWith('-01') ? (
              <line
                key={`year-${m.month}`}
                x1={px(i) - clusterW / 2}
                x2={px(i) - clusterW / 2}
                y1={padT}
                y2={padT + plotH}
                className="stroke-grid"
              />
            ) : null,
          )}
          {/* One band and one pair of lines per unbroken stretch. The clip ids
              carry the stretch's index, or every stretch would be clipped to
              the first one's income edge. */}
          {runs.map((run, r) => {
            const income = pts(run, (m) => m.totalIn);
            const band = [...income, ...pts(run, (m) => m.totalOut).reverse()].join(' ');
            const edge = (y: number) =>
              [`${px(run[0]!.i)},${y}`, ...income, `${px(run.at(-1)!.i)},${y}`].join(' ');
            return (
              <g key={run[0]!.m.month}>
                <defs>
                  <clipPath id={`${clip}-over-${r}`}>
                    <polygon points={edge(padT)} />
                  </clipPath>
                  <clipPath id={`${clip}-under-${r}`}>
                    <polygon points={edge(padT + plotH)} />
                  </clipPath>
                </defs>
                <polygon points={band} clipPath={`url(#${clip}-over-${r})`} className="fill-critical-strong opacity-20" />
                <polygon points={band} clipPath={`url(#${clip}-under-${r})`} className="fill-good-strong opacity-20" />
                <polyline points={pts(run, (m) => m.totalOut).join(' ')} strokeWidth={2} className="fill-none stroke-critical-strong" />
                <polyline points={pts(run, (m) => m.totalIn).join(' ')} strokeWidth={2} className="fill-none stroke-good-strong" />
              </g>
            );
          })}
          {near !== null && (
            <line x1={px(near)} x2={px(near)} y1={padT} y2={padT + plotH} strokeDasharray="3 3" className="stroke-ink-muted" />
          )}
          {dense.map((m, i) =>
            m === null ? null : (
              <g key={m.month}>
                {/* A stretch of one month draws no polyline, so the dots are what carries it. */}
                <circle cx={px(i)} cy={py(m.totalOut)} r={near === i ? 5 : 3} className="fill-critical-strong" />
                <circle cx={px(i)} cy={py(m.totalIn)} r={near === i ? 5 : 3} className="fill-good-strong" />
                {axisLabel(m.month) && (
                  <text
                    x={px(i)}
                    y={padT + plotH + 18}
                    textAnchor="middle"
                    className={near === i ? 'fill-ink text-[11px] font-semibold' : 'fill-ink-muted text-[11px]'}
                  >
                    {axisLabel(m.month)}
                  </text>
                )}
              </g>
            ),
          )}
          {years.map(({ y, x }) => (
            <text key={y} x={x} y={height - 5} textAnchor="middle" className="fill-ink-soft text-[11px] font-semibold">
              {y}
            </text>
          ))}
          <line x1={padL} x2={padL} y1={padT} y2={padT + plotH} className="stroke-axis" />
          <line x1={padL} x2={width - 8} y1={padT + plotH} y2={padT + plotH} className="stroke-axis" />
          {/* Last, so it sits over everything it is meant to catch pointers for. */}
          <rect x={padL} y={padT} width={plotW} height={plotH} fill="transparent" onPointerMove={track} onPointerLeave={leave} />
        </svg>
      )}
      {node}
    </div>
  );
};

export const ChartLegend = () => (
  <div className="mb-2 flex gap-3.5 text-xs text-ink-soft">
    <span className="inline-flex items-center gap-1.5">
      <span className="inline-block h-[3px] w-3 rounded-sm bg-critical-strong" />
      Spent
    </span>
    <span className="inline-flex items-center gap-1.5">
      <span className="inline-block h-[3px] w-3 rounded-sm bg-good-strong" />
      Income
    </span>
    {/* The band is the point of the chart, so it gets a key of its own. */}
    <span className="inline-flex items-center gap-1.5">
      <span className="inline-block h-2.5 w-3 rounded-sm bg-good-strong opacity-20" />
      Left over
    </span>
    <span className="inline-flex items-center gap-1.5">
      <span className="inline-block h-2.5 w-3 rounded-sm bg-critical-strong opacity-20" />
      Overspent
    </span>
  </div>
);
