import { useId, useState } from "react";
import { spendTrend, withGaps, type SeriesPoint } from "../../core/stats.ts";
import { fmtNOK, niceStep, pointLabel, toggled, useWidth } from "./format.ts";
import { axisLabels, type Bucket } from "./axis.ts";
import { Empty } from "./Cards.tsx";
import { ChartLegend } from "./ChartLegend.tsx";
import { useTooltip } from "./Charts.tsx";
import {
  GroupLayer,
  GroupTipRows,
  groupLines,
  runsOf,
  type GroupSeries,
} from "./GroupLines.tsx";

export type Mark = "out" | "in" | "compare" | "trend" | `g:${string}`;

interface SpendLinesProps {
  series: SeriesPoint[];
  bucket: Bucket;
  income: boolean;
  spend: boolean;
  band: boolean;
  trend: boolean;
  compare?: SeriesPoint[];
  compareLabel?: string;
  groups: GroupSeries[];
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
  groups,
}: SpendLinesProps) => {
  const [ref, width] = useWidth();
  const { show, hide, node } = useTooltip();
  const [near, setNear] = useState<number | null>(null);

  const [hidden, setHidden] = useState<ReadonlySet<Mark>>(new Set());
  const shows = (m: Mark) => !hidden.has(m);
  const toggle = (m: Mark) => setHidden((prev) => toggled(prev, m));

  const dense = bucket === "month" ? withGaps(series) : series;

  const lines = groupLines(groups, dense);
  const shownLines = lines.filter((l) => shows(`g:${l.name}`));
  const peaks = groups.length
    ? shownLines.flatMap((l) => l.dense.map((p) => p?.totalOut ?? 0))
    : [...series, ...compare].map((p) => Math.max(p.totalIn, p.totalOut));

  const multiYear = new Set(series.map((p) => p.at.slice(0, 4))).size > 1;
  const height = multiYear ? 234 : 220;
  const padL = 50;
  const padB = multiYear ? 38 : 24;
  const padT = 10;
  const plotW = Math.max(width - padL - 16, 20);
  const plotH = height - padB - padT;
  const maxVal = Math.max(...peaks, 1);
  const step = niceStep(maxVal);
  const gridMax = Math.ceil(maxVal / step) * step;

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

  const tipFor = (at: number, p: SeriesPoint, was: SeriesPoint | null) => (
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
          <span className="text-right text-muted-foreground">
            {p.at.slice(0, 4)}
          </span>
          <span className="text-right text-muted-foreground">
            {was.at.slice(0, 4)}
          </span>
        </>
      ) : (
        <span />
      )}
      {hasSpend && (
        <>
          <span className="text-muted-foreground">Spent</span>
          <span className="text-right">{fmtNOK(p.totalOut)}</span>
          {was && (
            <span className="text-right text-muted-foreground">
              {fmtNOK(was.totalOut)}
            </span>
          )}
        </>
      )}
      {hasIncome && (
        <>
          <span className="text-muted-foreground">Income</span>
          <span className="text-right">{fmtNOK(p.totalIn)}</span>
          {was && (
            <span className="text-right text-muted-foreground">
              {fmtNOK(was.totalIn)}
            </span>
          )}
        </>
      )}
      <GroupTipRows lines={shownLines} at={at} />
    </div>
  );

  const track = (e: React.PointerEvent<SVGRectElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    const i = Math.round((e.clientX - box.left - clusterW / 2) / clusterW);
    const at = Math.max(0, Math.min(dense.length - 1, i));
    const p = dense[at];
    if (!p) return leave();
    setNear(at);
    show(e, tipFor(at, p, cmp[at] ?? null));
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
          groups={lines}
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
                    v === 0 && gridMin < 0
                      ? "stroke-foreground/20"
                      : "stroke-border"
                  }
                />
                <text
                  x={padL - 8}
                  y={gy + 3}
                  textAnchor="end"
                  className="fill-muted-foreground text-[11px]"
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
                className="stroke-border"
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
                    className="fill-none stroke-spend"
                  />
                )}
                {hasIncome && (
                  <polyline
                    points={pts(run, (p) => p.totalIn).join(" ")}
                    strokeWidth={1.5}
                    strokeDasharray="4 3"
                    className="fill-none stroke-income"
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
                      className="fill-spend opacity-20"
                    />
                    <polygon
                      points={band}
                      clipPath={`url(#${clip}-under-${r})`}
                      className="fill-income opacity-20"
                    />
                  </>
                )}
                {hasSpend && shows("out") && (
                  <polyline
                    points={pts(run, (p) => p.totalOut).join(" ")}
                    strokeWidth={2}
                    className="fill-none stroke-spend"
                  />
                )}
                {hasIncome && shows("in") && (
                  <polyline
                    points={income.join(" ")}
                    strokeWidth={2}
                    className="fill-none stroke-income"
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
                className="stroke-chart-1"
              />
            </>
          )}
          <GroupLayer
            lines={shownLines}
            x={px}
            y={py}
            dots={dots}
            near={near}
          />
          {near !== null && (
            <line
              x1={px(near)}
              x2={px(near)}
              y1={padT}
              y2={padT + plotH}
              strokeDasharray="3 3"
              className="stroke-muted-foreground"
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
                    className="fill-spend"
                  />
                )}
                {hasIncome && shows("in") && (
                  <circle
                    cx={px(i)}
                    cy={py(p.totalIn)}
                    r={near === i ? (dots ? 5 : 4) : 3}
                    className="fill-income"
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
                  ? "fill-foreground text-[11px] font-semibold"
                  : "fill-muted-foreground text-[11px]"
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
              className="fill-muted-foreground text-[11px] font-semibold"
            >
              {y}
            </text>
          ))}
          <line
            x1={padL}
            x2={padL}
            y1={padT}
            y2={padT + plotH}
            className="stroke-foreground/20"
          />
          <line
            x1={padL}
            x2={width - 8}
            y1={padT + plotH}
            y2={padT + plotH}
            className="stroke-foreground/20"
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
