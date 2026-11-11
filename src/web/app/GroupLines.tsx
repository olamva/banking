import { Fragment } from "react";
import type { SeriesPoint } from "../../core/stats.ts";
import { fmtNOK } from "./format.ts";

export const runsOf = <T,>(dense: (T | null)[]): { m: T; i: number }[][] => {
  const runs: { m: T; i: number }[][] = [];
  dense.forEach((m, i) => {
    if (m === null) return;
    const open = runs.at(-1);
    if (open && open.at(-1)!.i === i - 1) open.push({ m, i });
    else runs.push([{ m, i }]);
  });
  return runs;
};

export interface GroupSeries {
  name: string;
  series: SeriesPoint[];
}

export interface GroupLine {
  name: string;
  color: string;
  dense: (SeriesPoint | null)[];
}

export const groupLines = (
  groups: GroupSeries[],
  dense: (SeriesPoint | null)[],
): GroupLine[] =>
  groups.map((g, k) => {
    const byAt = new Map(g.series.map((p) => [p.at, p.totalOut]));
    return {
      name: g.name,
      color: `var(--chart-${k + 1})`,
      dense: dense.map(
        (p) => p && { at: p.at, totalIn: 0, totalOut: byAt.get(p.at) ?? 0 },
      ),
    };
  });

export const GroupTipRows = ({
  lines,
  at,
}: {
  lines: GroupLine[];
  at: number;
}) =>
  lines.map((l) => (
    <Fragment key={l.name}>
      <span className="flex items-center gap-1.5 text-muted-foreground">
        <span
          className="size-2 shrink-0 rounded-full"
          style={{ background: l.color }}
        />
        {l.name}
      </span>
      <span className="text-right">{fmtNOK(l.dense[at]?.totalOut ?? 0)}</span>
    </Fragment>
  ));

interface GroupLayerProps {
  lines: GroupLine[];
  x: (i: number) => number;
  y: (v: number) => number;
  dots: boolean;
  near: number | null;
}

export const GroupLayer = ({ lines, x, y, dots, near }: GroupLayerProps) =>
  lines.map((l) => (
    <g key={l.name}>
      {runsOf(l.dense).map((run) => (
        <polyline
          key={run[0]!.i}
          points={run.map(({ m, i }) => `${x(i)},${y(m.totalOut)}`).join(" ")}
          strokeWidth={2}
          fill="none"
          style={{ stroke: l.color }}
        />
      ))}
      {l.dense.map((p, i) =>
        p === null || (!dots && i !== near) ? null : (
          <circle
            key={p.at}
            cx={x(i)}
            cy={y(p.totalOut)}
            r={near === i ? (dots ? 5 : 4) : 3}
            style={{ fill: l.color }}
          />
        ),
      )}
    </g>
  ));
