import { axisBounds, shiftDay, todayOslo, type Period } from "./select.ts";
import type { Categorized } from "./types.ts";

export const settledBounds = (
  rows: Categorized[],
  shown: Categorized[],
  p: Period,
  now = todayOslo(),
  b = axisBounds(rows, p, now),
) =>
  p.kind === "recent" ||
  b.to.slice(0, 7) !== now.slice(0, 7) ||
  shown.some((t) => t.date.startsWith(b.to.slice(0, 7)))
    ? b
    : { ...b, to: shiftDay(`${b.to.slice(0, 7)}-01`, -1) };
