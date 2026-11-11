import type { SeriesPoint } from "../../core/stats.ts";
import { monthLabel } from "./format.ts";

export type Bucket = "day" | "month";

// The stride comes from the measured cluster width, never from a fixed count.
export const axisLabels = (
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
