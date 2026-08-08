/** Presentation only — nothing here decides what a number is, just how it reads. */
import { useEffect, useRef, useState } from 'react';

export const fmtNOK = (n: number): string => `${Math.round(n).toLocaleString('nb-NO')} kr`;

export const fmtPct = (share: number): string => `${Math.round(share * 1000) / 10}%`;

/**
 * Slugs come from the bank and from overrides.json, so a generic rule beats a
 * map that drifts every time the file is hand-edited. Only the slugs that spell
 * a Norwegian letter out need naming.
 */
const ODD: Record<string, string> = { stroem: 'Strøm', helse_og_velvaere: 'Helse og velvære' };

export const categoryLabel = (slug: string): string =>
  ODD[slug] ?? slug.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());

export const monthLabel = (month: string): string => {
  const [y, m] = month.split('-').map(Number);
  return new Date(Date.UTC(y!, m! - 1, 1)).toLocaleDateString('nb-NO', { month: 'short', timeZone: 'UTC' });
};

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
export const useWidth = (fallback = 340): [(el: HTMLDivElement | null) => void, number] => {
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
