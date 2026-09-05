import { useEffect, useRef, useState } from "react";
import { buildLabels, tidy, type Labels } from "../../core/labels.ts";
import type { Categorized } from "../../core/types.ts";

const NOK = new Intl.NumberFormat("nb-NO");

export const fmtNOK = (n: number): string => `${NOK.format(Math.round(n))} kr`;

const NOK_ORE = new Intl.NumberFormat("nb-NO", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

// A whole krone drops the ",00". Half a krone keeps two digits, never one.
export const fmtNOKExact = (n: number): string =>
  Math.round(n * 100) % 100 === 0 ? fmtNOK(n) : `${NOK_ORE.format(n)} kr`;

export const fmtPct = (share: number): string =>
  `${Math.round(share * 1000) / 10}%`;

// ponytail: one module-level `Labels`, not a prop through eight call sites.
// Pass it from `App` if a second labelled dataset shares the page.
let LABELS: Labels = buildLabels([]);

export const setLabels = (l: Labels): void => {
  LABELS = l;
};

export const categoryLabel = (slug: string): string => LABELS.category(slug);

export const subcategoryLabel = (
  category: string,
  sub: string | null,
): string => LABELS.subcategory(category, sub);

let HUES: Record<string, number> = {};

export const setCategoryHues = (categories: string[]): void => {
  const sorted = [...new Set(categories)].sort();
  HUES = Object.fromEntries(
    sorted.map((c, i) => [c, Math.round((i * 360) / sorted.length)]),
  );
};

export const categoryColor = (category: string): string =>
  category in HUES
    ? `oklch(var(--cat-l) 0.13 ${HUES[category]})`
    : "var(--color-ink)";

export const splitPair = (pair: string): [string, string | null] => {
  const cut = pair.indexOf("/");
  if (cut === -1) return [pair, null];
  const sub = pair.slice(cut + 1);
  return [pair.slice(0, cut), sub === "" ? null : sub];
};

export const pairLabel = (pair: string): string =>
  subcategoryLabel(...splitPair(pair));

export const treeLabel = (category: string, pairs: string[]): string =>
  pairs.length === 1 && splitPair(pairs[0]!)[1] !== null
    ? pairLabel(pairs[0]!)
    : categoryLabel(category);

export const rowLabel = (category: string, sub: string | null): string =>
  sub === null ? categoryLabel(category) : subcategoryLabel(category, sub);

export const ID_FIELD = "Transaction ID";

const FIELD_NAMES: Record<string, string> = {
  id: ID_FIELD,
  counterparty: "Merchant",
  typeText: "Type",
  reason: "Excluded because",
};

const fieldName = (key: string): string =>
  FIELD_NAMES[key] ?? tidy(key.replace(/([A-Z])/g, " $1").toLowerCase());

export const txnFields = (
  t: Categorized,
  skip: readonly string[] = [],
): [string, string][] =>
  Object.entries(t).flatMap(([key, value]) => {
    if (key === "accountKey" || skip.includes(key)) return [];
    if (value === null || value === "") return [];
    const text =
      typeof value === "boolean"
        ? value
          ? "Yes"
          : "No"
        : key === "amount"
          ? fmtNOKExact(value as number)
          : key === "category"
            ? categoryLabel(value as string)
            : key === "subcategory"
              ? subcategoryLabel(t.category, value as string)
              : String(value);
    return [[fieldName(key), text] as [string, string]];
  });

export const bankLabel = (
  t: Categorized,
): [name: string, slug: string] | null => {
  if (t.bankCategory === null) return null;
  const name = t.bankCategoryName ?? tidy(t.bankCategory);
  const sub = t.bankSubName ?? (t.bankSub === null ? null : tidy(t.bankSub));
  return [
    sub === null ? name : `${name} / ${sub}`,
    t.bankSub === null ? t.bankCategory : `${t.bankCategory}/${t.bankSub}`,
  ];
};

export const fmtDate = (date: string): string =>
  new Date(`${date}T00:00:00Z`).toLocaleDateString("nb-NO", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });

export const monthLabel = (month: string): string => {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y!, m! - 1, 1)).toLocaleDateString("nb-NO", {
    month: "short",
    timeZone: "UTC",
  });
};

export const pointLabel = (at: string): string =>
  at.length > 7 ? `${Number(at.slice(8))}. ${monthLabel(at)}` : monthLabel(at);

export const toggled = <T>(set: ReadonlySet<T>, value: T): Set<T> => {
  const next = new Set(set);
  if (!next.delete(value)) next.add(value);
  return next;
};

export const niceStep = (maxVal: number): number => {
  if (maxVal <= 0) return 1;
  const rough = maxVal / 4;
  const mag = Math.pow(10, Math.floor(Math.log10(rough)));
  const norm = rough / mag;
  return (norm < 1.5 ? 1 : norm < 3 ? 2 : norm < 7 ? 5 : 10) * mag;
};

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
