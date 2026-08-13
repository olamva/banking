/** Presentation only — nothing here decides what a number is, just how it reads. */
import { useEffect, useRef, useState } from "react";
import { buildLabels, type Labels } from "../../core/labels.ts";

/**
 * Built once. `toLocaleString` builds its formatter per call, which is invisible
 * on a stat tile and is not on a two-thousand-row table — it was most of what
 * one of those cost to render.
 */
const NOK = new Intl.NumberFormat("nb-NO");

export const fmtNOK = (n: number): string => `${NOK.format(Math.round(n))} kr`;

export const fmtPct = (share: number): string =>
  `${Math.round(share * 1000) / 10}%`;

/**
 * What a category slug is called on the page.
 *
 * The names come from `core/labels.ts` — the bank's own `mainI18n`/`subI18n`
 * off the rows, whatever `rules/categories.json` overrides, and a tidied slug
 * for the rest. This used to be a hardcoded map here, and its own comment
 * admitted it drifted every time the rules were edited; it still listed `stroem`
 * after that category had stopped existing.
 *
 * ponytail: one module-level `Labels`, set once when the rows arrive, rather
 * than a prop threaded through eight call sites across the cards and the charts.
 * It replaces a module-level map in the same place, is written once per page
 * load and only ever read after, and the components stay as dumb as they were.
 * Upgrade path if a second labelled dataset ever shares the page: pass `Labels`
 * as a prop from `App` and delete these two lines.
 */
let LABELS: Labels = buildLabels([]);

export const setLabels = (l: Labels): void => {
  LABELS = l;
};

export const categoryLabel = (slug: string): string => LABELS.category(slug);

export const subcategoryLabel = (category: string, sub: string | null): string =>
  LABELS.subcategory(category, sub);

export const monthLabel = (month: string): string => {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y!, m! - 1, 1)).toLocaleDateString("nb-NO", {
    month: "short",
    timeZone: "UTC",
  });
};

/**
 * What one point on the spending chart is called: `2026-08-14` reads `14. aug`,
 * `2026-08` reads `aug`. The bucket is the string's own length, so nothing has
 * to tell it which it is holding.
 *
 * No year. The tooltip compares two of them side by side under their own year
 * headings, and a point that repeated the year would say it twice; where there
 * is no heading to carry it, the caller appends it.
 */
export const pointLabel = (at: string): string =>
  at.length > 7 ? `${Number(at.slice(8))}. ${monthLabel(at)}` : monthLabel(at);

/** Rounded axis step, so gridlines land on 500 / 1000 / 5000 rather than 4713.6. */
export const niceStep = (maxVal: number): number => {
  if (maxVal <= 0) return 1;
  const rough = maxVal / 4;
  const mag = Math.pow(10, Math.floor(Math.log10(rough)));
  const norm = rough / mag;
  return (norm < 1.5 ? 1 : norm < 3 ? 2 : norm < 7 ? 5 : 10) * mag;
};

/**
 * The charts are hand-drawn SVG in pixel coordinates, so they need the real
 * width of their box. A ResizeObserver keeps that honest when the window
 * changes or a card appears and reflows the grid.
 */
export const useWidth = (
  fallback = 340,
): [(el: HTMLDivElement | null) => void, number] => {
  const [width, setWidth] = useState(fallback);
  const observer = useRef<ResizeObserver | null>(null);

  useEffect(() => () => observer.current?.disconnect(), []);

  const ref = (el: HTMLDivElement | null): void => {
    observer.current?.disconnect();
    if (!el) return;
    observer.current = new ResizeObserver(([entry]) => {
      const w = entry?.contentRect.width ?? 0;
      if (w > 0) setWidth(w);
    });
    observer.current.observe(el);
  };

  return [ref, width];
};
