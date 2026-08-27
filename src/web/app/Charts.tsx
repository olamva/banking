import { useId, useState, type ReactNode } from "react";
import {
  spendTrend,
  withGaps,
  type CategoryDelta,
  type SeriesPoint,
} from "../../core/stats.ts";
import {
  fmtNOK,
  monthLabel,
  niceStep,
  pointLabel,
  useWidth,
} from "./format.ts";
import { ExpandIcon, Icon } from "./icons.ts";

interface TipState {
  x: number;
  y: number;
  content: ReactNode;
}

const useTooltip = () => {
  const [tip, setTip] = useState<TipState | null>(null);

  const show = (e: React.PointerEvent, content: ReactNode) =>
    setTip({ x: e.clientX, y: e.clientY, content });
  const hide = () => setTip(null);

  const bind = (content: ReactNode) => ({
    onPointerMove: (e: React.PointerEvent) => show(e, content),
    onPointerLeave: hide,
  });

  const node = tip ? (
    <div
      className="pointer-events-none fixed z-10 max-w-72 rounded-md border border-line bg-surface px-2.5 py-1.5 text-xs text-ink shadow-lg"
      style={{
        left: Math.min(tip.x + 14, window.innerWidth - 300),
        top: Math.min(tip.y + 14, window.innerHeight - 100),
      }}
    >
      {tip.content}
    </div>
  ) : null;

  return { bind, show, hide, node };
};

interface EmptyProps {
  children: ReactNode;
}

const Empty = ({ children }: EmptyProps) => (
  <div className="py-10 text-center text-ink-muted">{children}</div>
);

// SVG has no text-overflow. A character in 11px system-ui is about 5.6px wide.
const ellipsis = (s: string, px: number) => {
  const max = Math.max(Math.floor(px / 5.6), 3);
  return s.length > max ? s.slice(0, max - 1) + "…" : s;
};

export interface BarItem {
  label: string;
  total: number;
  count?: number;
  key?: string;
  subs?: BarItem[];
}

const TONE = {
  spend: ["bg-critical-strong", "bg-critical-strong/50"],
  income: ["bg-good-strong", "bg-good-strong/50"],
} as const;

interface HorizontalBarsProps {
  items: BarItem[];
  onPick?: (key: string, meta: boolean) => void;
  onPickSub?: (key: string, meta: boolean) => void;
  tone?: keyof typeof TONE;
  max?: number;
}

export const HorizontalBars = ({
  items,
  onPick,
  onPickSub,
  tone = "spend",
  max = 10,
}: HorizontalBarsProps) => {
  const { bind, node } = useTooltip();
  const [open, setOpen] = useState<ReadonlySet<string>>(new Set());
  const [showAll, setShowAll] = useState(false);
  const maxVal = Math.max(...items.map((i) => i.total), 1);

  if (items.length === 0) return <Empty>Nothing in this range.</Empty>;

  const visible = showAll ? items : items.slice(0, max);
  const hidden = items.length - visible.length;

  const toggle = (key: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (!next.delete(key)) next.add(key);
      return next;
    });

  const bar = (
    item: BarItem,
    depth: number,
    pick?: (key: string, meta: boolean) => void,
  ) => {
    const id = item.key ?? item.label;
    const row = (
      <>
        <span
          className="shrink-0 truncate text-right text-ink-soft"
          style={{ width: `min(${122 - depth * 12}px, 34%)` }}
        >
          {item.label}
        </span>
        <span className="flex min-w-0 flex-1 items-center gap-2">
          {/* The bar area keeps 78px back for the value, as the SVG did — a
              full-width bar would otherwise push the number off the edge.
              `min-w-px` keeps the smallest total visible as a sliver. */}
          <span
            className={`h-4 min-w-px rounded ${TONE[tone][depth ? 1 : 0]}`}
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
          {item.count ? ` · ${item.count} txns` : ""}
        </div>
      </>,
    );
    const shared =
      "flex h-[26px] min-w-0 flex-1 items-center gap-2 rounded-md text-[11px]";
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
        {visible.map((item) => {
          const id = item.key ?? item.label;
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
                    aria-label={`${expanded ? "Hide" : "Show"} ${item.label} breakdown`}
                    className="relative mr-0.5 flex h-6.5 w-3 shrink-0 items-center justify-center text-ink-soft before:absolute before:-inset-2 before:content-[''] hover:text-ink"
                  >
                    <Icon
                      aria-hidden
                      icon={ExpandIcon}
                      size={12}
                      className={`transition-transform ${expanded ? "rotate-90" : ""}`}
                    />
                  </button>
                ) : (
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
      {/* Gated on the whole list, not on what is still hidden: a filter can
          shrink the list under the cut while it is open, and `hidden > 0` would
          then leave a "Show less" that closes nothing. A list of nine keeps no
          button in either state. */}
      {items.length > max && (
        <button
          type="button"
          onClick={() => setShowAll((s) => !s)}
          aria-expanded={showAll}
          className="mt-1 flex h-6.5 w-full items-center justify-center gap-1 rounded-md text-[11px] text-ink-muted hover:bg-hover hover:text-ink"
        >
          <Icon
            aria-hidden
            icon={ExpandIcon}
            size={12}
            className={`transition-transform ${showAll ? "-rotate-90" : "rotate-90"}`}
          />
          {showAll ? "Show less" : `Show ${hidden} more`}
        </button>
      )}
      {node}
    </>
  );
};

export const visibleDeltas = (deltas: CategoryDelta[]): CategoryDelta[] =>
  deltas.filter((d) => Math.abs(d.delta) > 0.5).slice(0, 8);

interface DivergingBarsProps {
  deltas: CategoryDelta[];
  onPick?: (category: string, meta: boolean) => void;
}

export const DivergingBars = ({
  deltas: shown,
  onPick,
}: DivergingBarsProps) => {
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
                  className={`hover:opacity-85 ${onPick ? "cursor-pointer" : "cursor-default"} ${positive ? "fill-critical-strong" : "fill-good-strong"}`}
                  {...bind(
                    <>
                      <div className="text-ink-soft">{d.category}</div>
                      <div className="font-semibold">
                        {positive ? "+" : ""}
                        {fmtNOK(d.delta)}
                      </div>
                      <div className="text-ink-soft">
                        was {fmtNOK(d.previous)}
                      </div>
                    </>,
                  )}
                />
                <text
                  x={positive ? mid - w - 8 : mid + w + 8}
                  y={y + 16}
                  textAnchor={positive ? "end" : "start"}
                  className="fill-ink-soft text-[11px]"
                >
                  <title>{d.category}</title>
                  {ellipsis(
                    d.category,
                    (positive ? mid - w : width - mid - w) - 8,
                  )}
                </text>
                {/* The exact number at the bar's own end — the gridlines are for comparing, this is for reading. */}
                <text
                  x={positive ? mid + w + 6 : mid - w - 6}
                  y={y + 16}
                  textAnchor={positive ? "start" : "end"}
                  className="fill-ink text-[11px] font-semibold"
                >
                  {positive ? "+" : ""}
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

export type Bucket = "day" | "month";

// The stride comes from the measured cluster width, never from a fixed count.
const axisLabels = (
  bucket: Bucket,
  series: SeriesPoint[],
  dense: (SeriesPoint | null)[],
  clusterW: number,
): { i: number; text: string }[] => {
  const stride = (steps: number[], room: number, per = 1) =>
    steps.find((n) => n * clusterW * per >= room) ?? steps.at(-1)!;

  if (bucket === "month") {
    const every = stride([1, 2, 3, 4, 6, 12], 30);
    return dense.flatMap((p, i) =>
      p && (Number(p.at.slice(5)) - 1) % every === 0
        ? [{ i, text: monthLabel(p.at) }]
        : [],
    );
  }
  if (new Set(series.map((p) => p.at.slice(0, 7))).size === 1) {
    const every = stride([1, 2, 5, 10], 26);
    return series.flatMap((p, i) =>
      (Number(p.at.slice(8)) - 1) % every === 0
        ? [{ i, text: String(Number(p.at.slice(8))) }]
        : [],
    );
  }
  const starts = series.flatMap((p, i) =>
    i === 0 || p.at.slice(0, 7) !== series[i - 1]!.at.slice(0, 7)
      ? [{ i, at: p.at }]
      : [],
  );
  // 30 days to a cluster, because a day bucket puts each month that far apart.
  const every = stride([1, 2, 3, 4, 6, 12], 34, 30);
  return starts.flatMap(({ i, at }) =>
    (Number(at.slice(5, 7)) - 1) % every === 0
      ? [{ i, text: monthLabel(at) }]
      : [],
  );
};

type Mark = "out" | "in" | "compare" | "trend";

interface SpendLinesProps {
  series: SeriesPoint[];
  bucket: Bucket;
  income: boolean;
  spend: boolean;
  band: boolean;
  trend: boolean;
  compare?: SeriesPoint[];
  compareLabel?: string;
}

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

  const [hidden, setHidden] = useState<ReadonlySet<Mark>>(new Set());
  const shows = (m: Mark) => !hidden.has(m);
  const toggle = (m: Mark) =>
    setHidden((prev) => {
      const next = new Set(prev);
      if (!next.delete(m)) next.add(m);
      return next;
    });

  const multiYear = new Set(series.map((p) => p.at.slice(0, 4))).size > 1;
  const height = multiYear ? 234 : 220;
  const padL = 50;
  const padB = multiYear ? 38 : 24;
  const padT = 10;
  const plotW = Math.max(width - padL - 16, 20);
  const plotH = height - padB - padT;
  const maxVal = Math.max(
    ...[...series, ...compare].map((p) => Math.max(p.totalIn, p.totalOut)),
    1,
  );
  const step = niceStep(maxVal);
  const gridMax = Math.ceil(maxVal / step) * step;

  const dense = bucket === "month" ? withGaps(series) : series;
  const clusterW = plotW / Math.max(dense.length, 1);
  const px = (i: number) => padL + i * clusterW + clusterW / 2;

  const trend = offersTrend ? spendTrend(dense) : null;
  const ends = trend
    ? [0, dense.length - 1].map((x) => trend.intercept + trend.slope * x)
    : [];

  const gridMin = shows("trend")
    ? Math.min(0, ...ends.map((v) => Math.floor(v / step) * step))
    : 0;
  const ticks = Array.from(
    { length: Math.round((gridMax - gridMin) / step) + 1 },
    (_, i) => gridMin + i * step,
  );
  const py = (v: number) =>
    padT + plotH - ((v - gridMin) / (gridMax - gridMin)) * plotH;

  const cmpBy = new Map(
    compare.map((p) => [
      bucket === "day" ? p.at.slice(5) : p.at.slice(5, 7),
      p,
    ]),
  );
  const firstMonth = Number(dense[0]?.at.slice(5, 7) ?? "1");
  const cmpKey = (i: number) =>
    bucket === "day"
      ? (dense[i]?.at.slice(5) ?? null)
      : String(((firstMonth - 1 + i) % 12) + 1).padStart(2, "0");
  const cmp = dense.map((_, i) => {
    const key = cmpKey(i);
    return key === null ? null : (cmpBy.get(key) ?? null);
  });

  const labels = axisLabels(bucket, series, dense, clusterW);

  const years = !multiYear
    ? []
    : [
        ...new Set(
          dense.filter((p) => p !== null).map((p) => p.at.slice(0, 4)),
        ),
      ].map((y) => {
        const at = dense.flatMap((p, i) => (p?.at.startsWith(y) ? [i] : []));
        return { y, x: (px(at[0]!) + px(at.at(-1)!)) / 2 };
      });

  const dots = clusterW >= 8;

  const runs = runsOf(dense);

  const pts = (
    run: { m: SeriesPoint; i: number }[],
    pick: (p: SeriesPoint) => number,
  ) => run.map(({ m, i }) => `${px(i)},${py(pick(m))}`);

  const clip = useId();

  const tipFor = (p: SeriesPoint, was: SeriesPoint | null) => (
    <div
      className={`grid gap-x-3 tabular-nums ${was ? "grid-cols-[auto_1fr_1fr]" : "grid-cols-[auto_1fr]"}`}
    >
      {/* The corner names the point, so no title line repeats the first
          column. Its year comes from the columns, or from here where there
          are none. */}
      <span className="font-semibold">
        {was ? pointLabel(p.at) : `${pointLabel(p.at)} ${p.at.slice(0, 4)}`}
      </span>
      {was ? (
        <>
          <span className="text-right text-ink-muted">{p.at.slice(0, 4)}</span>
          <span className="text-right text-ink-muted">
            {was.at.slice(0, 4)}
          </span>
        </>
      ) : (
        <span />
      )}
      {hasSpend && (
        <>
          <span className="text-ink-soft">Spent</span>
          <span className="text-right">{fmtNOK(p.totalOut)}</span>
          {was && (
            <span className="text-right text-ink-muted">
              {fmtNOK(was.totalOut)}
            </span>
          )}
        </>
      )}
      {hasIncome && (
        <>
          <span className="text-ink-soft">Income</span>
          <span className="text-right">{fmtNOK(p.totalIn)}</span>
          {was && (
            <span className="text-right text-ink-muted">
              {fmtNOK(was.totalIn)}
            </span>
          )}
        </>
      )}
    </div>
  );

  const track = (e: React.PointerEvent<SVGRectElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    const i = Math.round((e.clientX - box.left - clusterW / 2) / clusterW);
    const at = Math.max(0, Math.min(dense.length - 1, i));
    const p = dense[at];
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
      {/* Always, since every key is also its mark's switch: a lone series still
          needs somewhere to be switched back on from. */}
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
                  className={
                    v === 0 && gridMin < 0 ? "stroke-axis" : "stroke-grid"
                  }
                />
                <text
                  x={padL - 8}
                  y={gy + 3}
                  textAnchor="end"
                  className="fill-ink-muted text-[11px]"
                >
                  {fmtNOK(v).replace(" kr", "")}
                </text>
              </g>
            );
          })}
          {/* A soft rule on the des|jan seam — the one landmark on an axis of
              repeating month names. Drawn before the bands, so it reads as
              ground rather than data. */}
          {dense.map((p, i) =>
            p &&
            i > 0 &&
            p.at.slice(4) === (bucket === "day" ? "-01-01" : "-01") ? (
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
          {shows("compare") &&
            runsOf(cmp).map((run) => (
              <g key={`cmp-${run[0]!.i}`} className="opacity-40">
                {hasSpend && (
                  <polyline
                    points={pts(run, (p) => p.totalOut).join(" ")}
                    strokeWidth={1.5}
                    strokeDasharray="4 3"
                    className="fill-none stroke-critical-strong"
                  />
                )}
                {hasIncome && (
                  <polyline
                    points={pts(run, (p) => p.totalIn).join(" ")}
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
            const band = [
              ...income,
              ...pts(run, (p) => p.totalOut).reverse(),
            ].join(" ");
            const edge = (y: number) =>
              [
                `${px(run[0]!.i)},${y}`,
                ...income,
                `${px(run.at(-1)!.i)},${y}`,
              ].join(" ");
            return (
              <g key={run[0]!.m.at}>
                {/* The shading has no key of its own, so it follows the lines
                    it is drawn between: it is the gap from one to the other,
                    and shading up to an edge that is not on the chart claims a
                    surplus against nothing. Both, because either line missing
                    leaves the polygon with an invisible side. */}
                {hasBand && shows("in") && shows("out") && (
                  <>
                    <defs>
                      <clipPath id={`${clip}-over-${r}`}>
                        <polygon points={edge(padT)} />
                      </clipPath>
                      <clipPath id={`${clip}-under-${r}`}>
                        <polygon points={edge(padT + plotH)} />
                      </clipPath>
                    </defs>
                    <polygon
                      points={band}
                      clipPath={`url(#${clip}-over-${r})`}
                      className="fill-critical-strong opacity-20"
                    />
                    <polygon
                      points={band}
                      clipPath={`url(#${clip}-under-${r})`}
                      className="fill-good-strong opacity-20"
                    />
                  </>
                )}
                {hasSpend && shows("out") && (
                  <polyline
                    points={pts(run, (p) => p.totalOut).join(" ")}
                    strokeWidth={2}
                    className="fill-none stroke-critical-strong"
                  />
                )}
                {hasIncome && shows("in") && (
                  <polyline
                    points={income.join(" ")}
                    strokeWidth={2}
                    className="fill-none stroke-good-strong"
                  />
                )}
              </g>
            );
          })}
          {/* Clipped to the plot rather than clamped to it: the axis already
              stretched to hold both ends, and clamping a line is how a slope
              gets flattened into a claim nobody made. */}
          {trend && shows("trend") && (
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
            <line
              x1={px(near)}
              x2={px(near)}
              y1={padT}
              y2={padT + plotH}
              strokeDasharray="3 3"
              className="stroke-ink-muted"
            />
          )}
          {/* A stretch of one point draws no polyline, so the dots are what
              carries it. Too dense for dots, and the hovered point gets the
              only one there is — otherwise the rule marks a spot on the line
              with nothing on it to say which point it landed on. */}
          {dense.map((p, i) =>
            p === null || (!dots && i !== near) ? null : (
              <g key={p.at}>
                {hasSpend && shows("out") && (
                  <circle
                    cx={px(i)}
                    cy={py(p.totalOut)}
                    r={near === i ? (dots ? 5 : 4) : 3}
                    className="fill-critical-strong"
                  />
                )}
                {hasIncome && shows("in") && (
                  <circle
                    cx={px(i)}
                    cy={py(p.totalIn)}
                    r={near === i ? (dots ? 5 : 4) : 3}
                    className="fill-good-strong"
                  />
                )}
              </g>
            ),
          )}
          {labels.map(({ i, text }) => (
            <text
              key={i}
              x={px(i)}
              y={padT + plotH + 18}
              textAnchor="middle"
              className={
                near === i
                  ? "fill-ink text-[11px] font-semibold"
                  : "fill-ink-muted text-[11px]"
              }
            >
              {text}
            </text>
          ))}
          {years.map(({ y, x }) => (
            <text
              key={y}
              x={x}
              y={height - 5}
              textAnchor="middle"
              className="fill-ink-soft text-[11px] font-semibold"
            >
              {y}
            </text>
          ))}
          <line
            x1={padL}
            x2={padL}
            y1={padT}
            y2={padT + plotH}
            className="stroke-axis"
          />
          <line
            x1={padL}
            x2={width - 8}
            y1={padT + plotH}
            y2={padT + plotH}
            className="stroke-axis"
          />
          {/* Last, so it sits over everything it is meant to catch pointers for.
              `onPointerDown` as well as move, for touch: a tap on a phone is a
              down and an up with no move between them, so a move-only chart had
              no reading at all there. Deliberately not `touch-action: none` —
              catching the drag would mean the plot ate the page's scroll. */}
          <rect
            x={padL}
            y={padT}
            width={plotW}
            height={plotH}
            fill="transparent"
            onPointerDown={track}
            onPointerMove={track}
            onPointerLeave={leave}
          />
        </svg>
      )}
      {node}
    </div>
  );
};

interface ChartLegendProps {
  income: boolean;
  spend: boolean;
  trend: boolean;
  compareLabel?: string;
  hidden: ReadonlySet<Mark>;
  onToggle: (mark: Mark) => void;
}

interface LegendKeyProps {
  on: boolean;
  onToggle: () => void;
  name: string;
  children: ReactNode;
}

const LegendKey = ({ on, onToggle, name, children }: LegendKeyProps) => (
  <button
    type="button"
    onClick={onToggle}
    aria-pressed={on}
    title={`${on ? "Hide" : "Show"} ${name}`}
    className={`inline-flex items-center gap-1.5 rounded-sm hover:text-ink ${on ? "" : "opacity-40"}`}
  >
    {children}
  </button>
);

const ChartLegend = ({
  income,
  spend,
  trend,
  compareLabel,
  hidden,
  onToggle,
}: ChartLegendProps) => {
  const key = (mark: Mark) => ({
    on: !hidden.has(mark),
    onToggle: () => onToggle(mark),
  });
  return (
    <div className="mb-2 flex flex-wrap gap-3.5 text-xs text-ink-soft">
      {spend && (
        <LegendKey {...key("out")} name="the spending line">
          <span className="inline-block h-0.75 w-3 rounded-sm bg-critical-strong" />
          Spent
        </LegendKey>
      )}
      {income && (
        <LegendKey {...key("in")} name="the income line">
          <span className="inline-block h-0.75 w-3 rounded-sm bg-good-strong" />
          Income
        </LegendKey>
      )}
      {/* Blue, because red would put two claims about spending in one colour,
          with the compared period already dashed and red.

          The key names it and no more: a straight line has no single rate, so
          any percentage on it is whatever its base and period are chosen to be.
          The line says "spending drifts this way over this window", which is
          the whole of what a least-squares fit knows. */}
      {trend && (
        <LegendKey {...key("trend")} name="the fitted trend">
          <svg aria-hidden width={16} height={3} className="shrink-0">
            <line
              x1={0}
              x2={16}
              y1={1.5}
              y2={1.5}
              strokeWidth={3}
              strokeDasharray="7 5"
              className="stroke-series-1"
            />
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
        <LegendKey {...key("compare")} name={compareLabel}>
          <svg
            aria-hidden
            width={16}
            height={income && spend ? 9 : 3}
            className="shrink-0 opacity-40"
          >
            {spend && (
              <line
                x1={0}
                x2={16}
                y1={1.5}
                y2={1.5}
                strokeWidth={3}
                strokeDasharray="4 3"
                className="stroke-critical-strong"
              />
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
