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
import { spendTrend, withGaps, type CategoryDelta, type SeriesPoint } from '../../core/stats.ts';
import { fmtNOK, monthLabel, niceStep, pointLabel, useWidth } from './format.ts';
import { ExpandIcon, Icon } from './icons.ts';

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
      /* Wide enough for two years of running totals side by side — six figures
         in three columns is wider than a wrapped merchant name ever was. */
      className="pointer-events-none fixed z-10 max-w-72 rounded-md border border-line bg-surface px-2.5 py-1.5 text-xs text-ink shadow-lg"
      style={{ left: Math.min(tip.x + 14, window.innerWidth - 300), top: Math.min(tip.y + 14, window.innerHeight - 100) }}
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
  /**
   * What a click reports, when that is not the label. Categories arrive already
   * readable, so the slug has to ride along or every click would have to be
   * mapped back from a display name — and two slugs can tidy to one name.
   */
  key?: string;
  /**
   * The level below this row. Given, the row gains a disclosure triangle and
   * these appear indented under it, drawn on the same scale so a child bar reads
   * as the slice of its parent that it is.
   */
  subs?: BarItem[];
}

interface HorizontalBarsProps {
  items: BarItem[];
  /**
   * Every row is a filter button for its own label. The second argument is
   * whether the meta key was held — the chart does not know what that means,
   * only that it happened.
   *
   * Omit it and the rows are plain text: a breakdown nothing can filter on has
   * no business looking clickable.
   */
  onPick?: (key: string, meta: boolean) => void;
  /** The same, for a row's children. Omit it and children are plain text. */
  onPickSub?: (key: string, meta: boolean) => void;
}

/**
 * Category totals or top counterparties. One hue — this encodes magnitude, not
 * identity.
 *
 * The same rows the SVG drew, in HTML, for a reason SVG cannot fix: it has no
 * text-overflow, so a label in a fixed gutter had to be cut by counting
 * characters against an assumed width per character. That guess is low for
 * capitals, and a merchant billing as `RUTERAPPEN OSLO NO` measured as fitting
 * and then ran off the left edge of the card. CSS truncates against the room
 * actually there.
 *
 * A row carrying `subs` expands in place. Children share the parent's scale
 * rather than being renormalised to their own widest, so an opened category
 * reads as that bar cut up — renormalising would draw the largest child as wide
 * as its parent and say the opposite.
 */
export const HorizontalBars = ({ items, onPick, onPickSub }: HorizontalBarsProps) => {
  const { bind, node } = useTooltip();
  const [open, setOpen] = useState<ReadonlySet<string>>(new Set());
  const maxVal = Math.max(...items.map((i) => i.total), 1);

  if (items.length === 0) return <Empty>Nothing in this range.</Empty>;

  const toggle = (key: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (!next.delete(key)) next.add(key);
      return next;
    });

  const bar = (item: BarItem, depth: number, pick?: (key: string, meta: boolean) => void) => {
    const id = item.key ?? item.label;
    const row = (
      <>
        <span
          className="shrink-0 truncate text-right text-ink-soft"
          style={{ width: `${122 - depth * 12}px` }}
        >
          {item.label}
        </span>
        <span className="flex min-w-0 flex-1 items-center gap-2">
          {/* The bar area keeps 78px back for the value, as the SVG did — a
              full-width bar would otherwise push the number off the edge.
              `min-w-px` keeps the smallest total visible as a sliver. */}
          <span
            className={`h-4 min-w-px rounded ${depth ? 'bg-series-1/50' : 'bg-series-1'}`}
            style={{ width: `calc((100% - 78px) * ${item.total / maxVal})` }}
          />
          <span className="shrink-0 font-semibold">{fmtNOK(item.total)}</span>
        </span>
      </>
    );
    const tip = bind(
      <>
        <div className="text-ink-soft">{item.label}</div>
        <div className="font-semibold">
          {fmtNOK(item.total)}
          {item.count ? ` · ${item.count} txns` : ''}
        </div>
      </>,
    );
    const shared = 'flex h-[26px] min-w-0 flex-1 items-center gap-2 rounded-md text-[11px]';
    return pick ? (
      <button
        type="button"
        onClick={(e) => pick(id, e.metaKey)}
        className={`${shared} hover:bg-hover`}
        {...tip}
      >
        {row}
      </button>
    ) : (
      <div className={shared} {...tip}>
        {row}
      </div>
    );
  };

  return (
    <>
      <div className="flex flex-col">
        {items.map((item) => {
          const id = item.key ?? item.label;
          // One child is the parent again with an extra indent, so it is not a
          // breakdown and gets no chevron.
          const subs = item.subs && item.subs.length > 1 ? item.subs : [];
          const expanded = open.has(id);
          return (
            <div key={id} className="flex flex-col">
              <div className="flex items-center">
                {subs.length > 0 ? (
                  <button
                    type="button"
                    onClick={() => toggle(id)}
                    aria-expanded={expanded}
                    aria-label={`${expanded ? 'Hide' : 'Show'} ${item.label} breakdown`}
                    className="mr-0.5 flex h-[26px] w-3 shrink-0 items-center justify-center text-ink-soft hover:text-ink"
                  >
                    <Icon
                      aria-hidden
                      icon={ExpandIcon}
                      size={12}
                      className={`transition-transform ${expanded ? 'rotate-90' : ''}`}
                    />
                  </button>
                ) : (
                  // Holds the column so labels line up whether or not a row opens.
                  <span className="mr-0.5 w-3 shrink-0" />
                )}
                {bar(item, 0, onPick)}
              </div>
              {expanded &&
                subs.map((sub) => (
                  <div key={sub.key ?? sub.label} className="flex items-center">
                    <span className="mr-0.5 w-3 shrink-0" />
                    <span className="w-3 shrink-0" />
                    {bar(sub, 1, onPickSub)}
                  </div>
                ))}
            </div>
          );
        })}
      </div>
      {node}
    </>
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
  // The real maximum, not a rounded-up one: the gridlines that wanted round
  // numbers are gone, so the biggest bar may as well reach the edge of its half.
  const maxAbs = Math.max(...shown.map((d) => Math.abs(d.delta)), 1);

  return (
    <div ref={ref}>
      {shown.length === 0 ? (
        <Empty>No change worth drawing.</Empty>
      ) : (
        <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
          {/* Only the zero line. The gridlines that used to flank it were for
              comparing bars against each other, back when the bar was the sole
              encoding of its size — every bar now prints its own number at its
              end, which answers that better than counting rules. This one stays:
              it is the zero the chart diverges from, and without it nothing says
              which side of it a bar is on. */}
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

/**
 * The unbroken stretches of a gapped series. The months either side of a gap
 * are not neighbours, so nothing may be drawn between them: each stretch gets
 * its own lines and its own band, and a stretch of one month draws no line at
 * all and is carried by its dot.
 */
const runsOf = <T,>(dense: (T | null)[]): { m: T; i: number }[][] => {
  const runs: { m: T; i: number }[][] = [];
  dense.forEach((m, i) => {
    if (m === null) return;
    const open = runs.at(-1);
    if (open && open.at(-1)!.i === i - 1) open.push({ m, i });
    else runs.push([{ m, i }]);
  });
  return runs;
};

export type Bucket = 'day' | 'month';

/**
 * A thing the legend keys, and so a thing it can switch off.
 *
 * The shading is not one. It had two keys, `Left over` and `Overspent`, for the
 * one polygon they name either side of the income line — but it is a reading of
 * the two lines rather than a mark of its own, and red above green needs no
 * telling apart from red and green. It draws whenever the grain supports it.
 */
type Mark = 'out' | 'in' | 'compare' | 'trend';

interface SpendLinesProps {
  /** Already in the bucket it says it is in — see `dailySeries` / `monthlySeries`. */
  series: SeriesPoint[];
  bucket: Bucket;
  /**
   * Whether any point has income at all. Filtered to a spending category there
   * is none, and a green line along the axis is not a finding. The caller
   * derives it because it titles the card.
   */
  income: boolean;
  /** The same the other way round: a category that only ever paid in spent nothing. */
  spend: boolean;
  /**
   * Whether to shade between the two lines. Independent of `income` and `spend`
   * both: a line the filter emptied sits on the axis, and the gap against it is
   * still the measurement — all of the income left over, or all of the spending
   * uncovered. What the band does not survive is raw days, which is the one
   * thing the caller gates it on: it reads the vertical gap as a whole period's
   * balance, and income lands on about a third of days, so day by day the
   * shading would call almost every one of them uncovered. The lines themselves
   * are honest at every grain and stay.
   */
  band: boolean;
  /**
   * Whether a fitted line through spending is worth offering. False on a
   * running total, where it is a straight line drawn over an already-straight
   * one: a cumulative series only ever climbs, so its fit reports an average
   * rate the tile above already gives as a number. Switching it off where it
   * does mean something is the reader's business, and the legend's — this is
   * about not offering it where it never does, which is a property of the grain
   * and so the caller's to know.
   */
  trend: boolean;
  /**
   * The same span one period back, drawn faint behind. Empty when there is
   * nothing to compare against — see `vs` in App.tsx.
   */
  compare?: SeriesPoint[];
  /** What that window is called, for the legend and the tooltip. */
  compareLabel?: string;
}

/** Spent against income across a period, a point per day or per month. */
export const SpendLines = ({
  series,
  bucket,
  income: hasIncome,
  spend: hasSpend,
  band: hasBand,
  trend: offersTrend,
  compare = [],
  compareLabel,
}: SpendLinesProps) => {
  const [ref, width] = useWidth(500);
  const { show, hide, node } = useTooltip();
  const [near, setNear] = useState<number | null>(null);

  /**
   * What the legend has switched off, by the mark it keys.
   *
   * Held as the hidden set rather than the shown one so the default is the
   * empty set: which marks exist depends on the window — income, the band and
   * the compared period each come and go — and a set of what is on would have
   * to be rebuilt every time one appeared, silently reviving something the
   * reader had just dismissed.
   *
   * Local, and not in the URL the period, grain and filters share: it is how
   * one card is being read, not what is on screen, so nothing about a shared
   * link is wrong without it.
   */
  const [hidden, setHidden] = useState<ReadonlySet<Mark>>(new Set());
  const shows = (m: Mark) => !hidden.has(m);
  const toggle = (m: Mark) =>
    setHidden((prev) => {
      const next = new Set(prev);
      if (!next.delete(m)) next.add(m);
      return next;
    });

  /**
   * The caption row only earns its 14px when the axis crosses a year boundary.
   * A single year is already named by the filter that selected it, so there it
   * is dead space, and the gutter goes back to one row.
   */
  const multiYear = new Set(series.map((p) => p.at.slice(0, 4))).size > 1;
  const height = multiYear ? 234 : 220;
  const padL = 50;
  const padB = multiYear ? 38 : 24;
  const padT = 10;
  const plotW = Math.max(width - padL - 16, 20);
  const plotH = height - padB - padT;
  // Over both series: a compared point that outspent every current one would
  // otherwise draw off the top of the plot.
  const maxVal = Math.max(...[...series, ...compare].map((p) => Math.max(p.totalIn, p.totalOut)), 1);
  const step = niceStep(maxVal);
  const gridMax = Math.ceil(maxVal / step) * step;

  /**
   * The x axis is the calendar, not the array.
   *
   * Only the monthly series needs help with that: it carries the months that
   * have rows and nothing for the ones that do not, so without `withGaps` the
   * axis silently relabels itself and May sits next to August looking like
   * June. A daily series arrives dense already, and its empty days are real
   * zeros rather than holes, so putting it through the same call would find
   * nothing to do.
   */
  const dense = bucket === 'month' ? withGaps(series) : series;
  const clusterW = plotW / Math.max(dense.length, 1);
  const px = (i: number) => padL + i * clusterW + clusterW / 2;

  /**
   * One straight line through spending, for the whole span. Deliberately drawn
   * across a gap where the series is not: it is a summary of the span rather
   * than a reading of any point on it, which is also why it takes no dot and no
   * tooltip.
   *
   * Fitted whatever the legend says, and cheap enough to be: the key that turns
   * it off has to know there was anything to turn off.
   */
  const trend = offersTrend ? spendTrend(dense) : null;
  const ends = trend ? [0, dense.length - 1].map((x) => trend.intercept + trend.slope * x) : [];

  /**
   * The axis floor, which is zero until the trend needs it not to be. Spending
   * is a total and can never be negative, but a fitted line through a falling
   * one crosses zero on its way down — three months of 1000, 0, 0 fit a line
   * that ends at -167 — and a line clipped away at the floor would vanish
   * exactly where it has the most to say. Rounded down onto the same step the
   * top uses, so the gridlines stay evenly spaced through it.
   */
  const gridMin = Math.min(0, ...ends.map((v) => Math.floor(v / step) * step));
  const ticks = Array.from(
    { length: Math.round((gridMax - gridMin) / step) + 1 },
    (_, i) => gridMin + i * step,
  );
  const py = (v: number) => padT + plotH - ((v - gridMin) / (gridMax - gridMin)) * plotH;

  /**
   * The compared window laid over the same axis, matched on where in the
   * calendar a point sits rather than on how far into the array it is: the
   * compared window is always exactly one period back, so the same month — and
   * for a daily series the same month and day — is the pairing that means
   * something. Matching by index instead would drift by a day through a leap
   * year, and by a month through a series that starts on one.
   *
   * A monthly slot can be a hole, so its key is derived from the position
   * rather than read off the point: the current year missing June must not
   * stop last June being drawn.
   */
  const cmpBy = new Map(compare.map((p) => [bucket === 'day' ? p.at.slice(5) : p.at.slice(5, 7), p]));
  const firstMonth = Number(dense[0]?.at.slice(5, 7) ?? '1');
  const cmpKey = (i: number) =>
    bucket === 'day'
      ? (dense[i]?.at.slice(5) ?? null)
      : String(((firstMonth - 1 + i) % 12) + 1).padStart(2, '0');
  const cmp = dense.map((_, i) => {
    const key = cmpKey(i);
    return key === null ? null : (cmpBy.get(key) ?? null);
  });

  /**
   * Which slots get a label under them, and what it says.
   *
   * Three axes share one row. A monthly series names months, thinned on a
   * calendar-anchored stride so the kept labels land on the same months in
   * every year. A daily series inside a single month names days — that is the
   * whole point of looking at one month. A daily series longer than that has
   * far too many days to name any of them, so it names months again, at the
   * slot where each one starts.
   *
   * Every stride is chosen against `clusterW`, never fixed: the same year is
   * twelve labels on a full-width card and four on a third of one.
   */
  const labels: { i: number; text: string }[] = (() => {
    if (bucket === 'month') {
      const every = [1, 2, 3, 4, 6, 12].find((n) => n * clusterW >= 30) ?? 12;
      return dense.flatMap((p, i) =>
        p && (Number(p.at.slice(5)) - 1) % every === 0 ? [{ i, text: monthLabel(p.at) }] : [],
      );
    }
    if (new Set(series.map((p) => p.at.slice(0, 7))).size === 1) {
      const every = [1, 2, 5, 10].find((n) => n * clusterW >= 26) ?? 10;
      return series.flatMap((p, i) =>
        (Number(p.at.slice(8)) - 1) % every === 0 ? [{ i, text: String(Number(p.at.slice(8))) }] : [],
      );
    }
    // The slot each month starts on, which is not always its 1st: the archive
    // opens partway through a month, and that month still wants naming.
    const starts = series.flatMap((p, i) =>
      i === 0 || p.at.slice(0, 7) !== series[i - 1]!.at.slice(0, 7) ? [{ i, at: p.at }] : [],
    );
    const every = [1, 2, 3, 4, 6, 12].find((n) => n * clusterW * 30 >= 34) ?? 12;
    return starts.flatMap(({ i, at }) =>
      (Number(at.slice(5, 7)) - 1) % every === 0 ? [{ i, text: monthLabel(at) }] : [],
    );
  })();

  /**
   * The year is named once, under the stretch it covers, rather than on one
   * point of it — the row above repeats `jan..des`, or `1..28`, and says
   * nothing about which pass through the calendar it is on. Centred on what is
   * actually present, so a part year sits under its own half.
   */
  const years = !multiYear
    ? []
    : [...new Set(dense.filter((p) => p !== null).map((p) => p.at.slice(0, 4)))].map((y) => {
        const at = dense.flatMap((p, i) => (p?.at.startsWith(y) ? [i] : []));
        return { y, x: (px(at[0]!) + px(at.at(-1)!)) / 2 };
      });

  /**
   * A dot per point stops being a mark and starts being the line once they
   * touch, and a year of days is four thousand SVG nodes redrawn on every
   * pointer move. Past that density the polyline carries the shape and the
   * hover marker carries the reading.
   */
  const dots = clusterW >= 8;

  const runs = runsOf(dense);

  const pts = (run: { m: SeriesPoint; i: number }[], pick: (p: SeriesPoint) => number) =>
    run.map(({ m, i }) => `${px(i)},${py(pick(m))}`);

  const clip = useId();

  /**
   * A small table rather than a list of sentences: two years side by side under
   * their own headings costs one row of chrome and puts each number directly
   * above the one it is to be read against. Spelling them out instead —
   * "this time last year: out …, in …" — is the same four numbers as prose,
   * which is what it looked like before.
   *
   * The years are the headings, because the legend already says which line is
   * dashed and the compared window's full name is longer than the tooltip.
   */
  const tipFor = (p: SeriesPoint, was: SeriesPoint | null) => (
    <div
      className={`grid gap-x-3 tabular-nums ${was ? 'grid-cols-[auto_1fr_1fr]' : 'grid-cols-[auto_1fr]'}`}
    >
      {/* The corner of the table names the point, so the heading row carries
          it rather than a title line above repeating what the first column
          already says. Its year comes from the columns; with no columns to
          take it, it goes here. */}
      <span className="font-semibold">
        {was ? pointLabel(p.at) : `${pointLabel(p.at)} ${p.at.slice(0, 4)}`}
      </span>
      {was ? (
        <>
          <span className="text-right text-ink-muted">{p.at.slice(0, 4)}</span>
          <span className="text-right text-ink-muted">{was.at.slice(0, 4)}</span>
        </>
      ) : (
        <span />
      )}
      {hasSpend && (
        <>
          <span className="text-ink-soft">Spent</span>
          <span className="text-right">{fmtNOK(p.totalOut)}</span>
          {was && <span className="text-right text-ink-muted">{fmtNOK(was.totalOut)}</span>}
        </>
      )}
      {hasIncome && (
        <>
          <span className="text-ink-soft">Income</span>
          <span className="text-right">{fmtNOK(p.totalIn)}</span>
          {was && <span className="text-right text-ink-muted">{fmtNOK(was.totalIn)}</span>}
        </>
      )}
    </div>
  );

  /**
   * The whole plot is the target, not the dots: a 3px circle is a hard thing to
   * hit, and the nearest x is unambiguous whatever the bucket — which is what
   * keeps this working at a point per day, where there may be no dot to aim at
   * at all.
   */
  const track = (e: React.PointerEvent<SVGRectElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    const i = Math.round((e.clientX - box.left - clusterW / 2) / clusterW);
    const at = Math.max(0, Math.min(dense.length - 1, i));
    const p = dense[at];
    // Over a gap there is nothing to report, and the nearest month is a guess
    // in two directions — so the tooltip goes rather than naming a month the
    // pointer is not on.
    if (!p) return leave();
    setNear(at);
    show(e, tipFor(p, cmp[at] ?? null));
  };

  const leave = () => {
    setNear(null);
    hide();
  };

  return (
    <div ref={ref}>
      {/* Always, now that every key is also its mark's switch. A lone series
          needed no key telling it apart from the others, but it does need
          somewhere to be switched back on from. */}
      {series.length > 0 && (
        <ChartLegend
          income={hasIncome}
          spend={hasSpend}
          trend={trend !== null}
          compareLabel={compare.length > 0 ? compareLabel : undefined}
          hidden={hidden}
          onToggle={toggle}
        />
      )}
      {series.length === 0 ? (
        <Empty>Nothing in range.</Empty>
      ) : (
        <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
          {ticks.map((v) => {
            const gy = py(v);
            return (
              <g key={v}>
                {/* Zero is a gridline like any other until the axis runs below
                    it, and then it is the line the trend is read against. */}
                <line
                  x1={padL}
                  x2={width - 8}
                  y1={gy}
                  y2={gy}
                  className={v === 0 && gridMin < 0 ? 'stroke-axis' : 'stroke-grid'}
                />
                <text x={padL - 8} y={gy + 3} textAnchor="end" className="fill-ink-muted text-[11px]">
                  {fmtNOK(v).replace(' kr', '')}
                </text>
              </g>
            );
          })}
          {/* A soft rule on the des|jan seam. The axis is a run of repeating
              month names, or of day numbers that start over even more often, so
              the year break is the one landmark on it. Drawn before the bands,
              so it reads as ground rather than data. */}
          {dense.map((p, i) =>
            p && i > 0 && p.at.slice(4) === (bucket === 'day' ? '-01-01' : '-01') ? (
              <line
                key={`year-${p.at}`}
                x1={px(i) - clusterW / 2}
                x2={px(i) - clusterW / 2}
                y1={padT}
                y2={padT + plotH}
                className="stroke-grid"
              />
            ) : null,
          )}
          {/* The compared period, under the current one and out of its way: no
              band and no dots. The band is this period's finding, and a second
              set of dots is ink for a series that is there to be glanced at
              rather than read off. */}
          {shows('compare') &&
            runsOf(cmp).map((run) => (
              <g key={`cmp-${run[0]!.i}`} className="opacity-40">
                {hasSpend && (
                  <polyline
                    points={pts(run, (p) => p.totalOut).join(' ')}
                    strokeWidth={1.5}
                    strokeDasharray="4 3"
                    className="fill-none stroke-critical-strong"
                  />
                )}
                {hasIncome && (
                  <polyline
                    points={pts(run, (p) => p.totalIn).join(' ')}
                    strokeWidth={1.5}
                    strokeDasharray="4 3"
                    className="fill-none stroke-good-strong"
                  />
                )}
              </g>
            ))}
          {/* One band and one pair of lines per unbroken stretch. The clip ids
              carry the stretch's index, or every stretch would be clipped to
              the first one's income edge. */}
          {runs.map((run, r) => {
            const income = pts(run, (p) => p.totalIn);
            const band = [...income, ...pts(run, (p) => p.totalOut).reverse()].join(' ');
            const edge = (y: number) =>
              [`${px(run[0]!.i)},${y}`, ...income, `${px(run.at(-1)!.i)},${y}`].join(' ');
            return (
              <g key={run[0]!.m.at}>
                {/* The shading has no key of its own, so it follows the lines
                    it is drawn between: it is the gap from one to the other,
                    and shading up to an edge that is not on the chart claims a
                    surplus against nothing. Both, because either line missing
                    leaves the polygon with an invisible side. */}
                {hasBand && shows('in') && shows('out') && (
                  <>
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
                  </>
                )}
                {hasSpend && shows('out') && (
                  <polyline points={pts(run, (p) => p.totalOut).join(' ')} strokeWidth={2} className="fill-none stroke-critical-strong" />
                )}
                {hasIncome && shows('in') && (
                  <polyline points={income.join(' ')} strokeWidth={2} className="fill-none stroke-good-strong" />
                )}
              </g>
            );
          })}
          {/* Clipped to the plot rather than clamped to it: the axis already
              stretched to hold both ends, and clamping a line is how a slope
              gets flattened into a claim nobody made. */}
          {trend && shows('trend') && (
            <>
              <defs>
                <clipPath id={`${clip}-plot`}>
                  <rect x={padL} y={padT} width={plotW} height={plotH} />
                </clipPath>
              </defs>
              <line
                x1={px(0)}
                y1={py(ends[0]!)}
                x2={px(dense.length - 1)}
                y2={py(ends[1]!)}
                strokeWidth={1.5}
                strokeDasharray="7 5"
                clipPath={`url(#${clip}-plot)`}
                className="stroke-series-1"
              />
            </>
          )}
          {near !== null && (
            <line x1={px(near)} x2={px(near)} y1={padT} y2={padT + plotH} strokeDasharray="3 3" className="stroke-ink-muted" />
          )}
          {dots &&
            dense.map((p, i) =>
              p === null ? null : (
                <g key={p.at}>
                  {/* A stretch of one point draws no polyline, so the dots are what carries it. */}
                  {hasSpend && shows('out') && (
                    <circle cx={px(i)} cy={py(p.totalOut)} r={near === i ? 5 : 3} className="fill-critical-strong" />
                  )}
                  {hasIncome && shows('in') && (
                    <circle cx={px(i)} cy={py(p.totalIn)} r={near === i ? 5 : 3} className="fill-good-strong" />
                  )}
                </g>
              ),
            )}
          {/* Too dense for dots, so the hovered point gets the only one there
              is — otherwise the rule marks a spot on the line with nothing on
              it to say which point it landed on. */}
          {!dots && near !== null && dense[near] && (
            <g>
              {hasSpend && shows('out') && (
                <circle cx={px(near)} cy={py(dense[near].totalOut)} r={4} className="fill-critical-strong" />
              )}
              {hasIncome && shows('in') && (
                <circle cx={px(near)} cy={py(dense[near].totalIn)} r={4} className="fill-good-strong" />
              )}
            </g>
          )}
          {labels.map(({ i, text }) => (
            <text
              key={i}
              x={px(i)}
              y={padT + plotH + 18}
              textAnchor="middle"
              className={near === i ? 'fill-ink text-[11px] font-semibold' : 'fill-ink-muted text-[11px]'}
            >
              {text}
            </text>
          ))}
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

interface ChartLegendProps {
  income: boolean;
  /** The same the other way round — no spending in view, no key for its line. */
  spend: boolean;
  /** Whether the fitted line is drawn — it is keyed only where it exists. */
  trend: boolean;
  /** Named when a compared period is drawn; the dashes are the same for both its lines. */
  compareLabel?: string;
  /** Which marks are switched off, so the keys can say so. */
  hidden: ReadonlySet<Mark>;
  onToggle: (mark: Mark) => void;
}

interface LegendKeyProps {
  on: boolean;
  onToggle: () => void;
  /** What is being switched, for the reader who cannot see the swatch. */
  name: string;
  children: ReactNode;
}

/**
 * One key, and the switch for the mark it explains.
 *
 * Every key is a button, which is the point: one interactive key among inert
 * ones reads as a label like the rest of them, so the way to make a legend a
 * control surface is to make all of it one. Dimmed rather than struck through
 * or emptied — the swatch is what says which mark this is, so it has to survive
 * being switched off.
 */
const LegendKey = ({ on, onToggle, name, children }: LegendKeyProps) => (
  <button
    type="button"
    onClick={onToggle}
    aria-pressed={on}
    title={`${on ? 'Hide' : 'Show'} ${name}`}
    className={`inline-flex items-center gap-1.5 rounded-sm hover:text-ink ${on ? '' : 'opacity-40'}`}
  >
    {children}
  </button>
);

/** Drawn by `SpendLines` itself — it is the only chart with more than one series. */
const ChartLegend = ({ income, spend, trend, compareLabel, hidden, onToggle }: ChartLegendProps) => {
  const key = (mark: Mark) => ({ on: !hidden.has(mark), onToggle: () => onToggle(mark) });
  return (
    <div className="mb-2 flex flex-wrap gap-3.5 text-xs text-ink-soft">
      {spend && (
        <LegendKey {...key('out')} name="the spending line">
          <span className="inline-block h-[3px] w-3 rounded-sm bg-critical-strong" />
          Spent
        </LegendKey>
      )}
      {income && (
        <LegendKey {...key('in')} name="the income line">
          <span className="inline-block h-[3px] w-3 rounded-sm bg-good-strong" />
          Income
        </LegendKey>
      )}
      {/* Blue, because it is not a fourth reading of the money: it is the red
          line said straight, and drawing it in red would put two claims about
          spending in one colour — with the compared period already dashed and
          red, that is three.

          The key names it and no more. It carried the slope as a percentage for
          a while, in four framings, and every one of them was a true number that
          read wrong: a straight line has no single rate, so the figure is
          whatever its base and its period are chosen to be, and a reader has no
          way to tell which choice they are looking at. The line itself says
          "spending drifts this way over this window", which is the whole of
          what a least-squares fit knows. */}
      {trend && (
        <LegendKey {...key('trend')} name="the fitted trend">
          <svg aria-hidden width={16} height={3} className="shrink-0">
            <line x1={0} x2={16} y1={1.5} y2={1.5} strokeWidth={3} strokeDasharray="7 5" className="stroke-series-1" />
          </svg>
          Trend
        </LegendKey>
      )}
      {/* One key for both dashed lines — the dashes are what mark the period, and
          the colours mean the same here as they do above.

          Drawn as SVG rather than as a dashed CSS border, which is the swatch
          this had first: a 12px border draws one dash and reads as a solid grey
          rule, which is neither dashed nor either of the two colours it stands
          for. Same stroke and same gap as the chart, so the key and the line it
          explains are the same mark. */}
      {compareLabel && (
        <LegendKey {...key('compare')} name={compareLabel}>
          <svg aria-hidden width={16} height={income && spend ? 9 : 3} className="shrink-0 opacity-40">
            {spend && (
              <line x1={0} x2={16} y1={1.5} y2={1.5} strokeWidth={3} strokeDasharray="4 3" className="stroke-critical-strong" />
            )}
            {income && (
              <line
                x1={0}
                x2={16}
                y1={spend ? 7.5 : 1.5}
                y2={spend ? 7.5 : 1.5}
                strokeWidth={3}
                strokeDasharray="4 3"
                className="stroke-good-strong"
              />
            )}
          </svg>
          {compareLabel}
        </LegendKey>
      )}
    </div>
  );
};
