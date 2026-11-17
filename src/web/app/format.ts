import { useEffect, useRef, useState } from "react";
import { buildLabels, tidy, type Labels } from "../../core/labels.ts";
import type { Categorized } from "../../core/types.ts";

const NOK = new Intl.NumberFormat("nb-NO");

const kr = (s: string): string => `${s.replace("−", "− ")} kr`;

export const fmtNOK = (n: number): string => kr(NOK.format(Math.round(n)));

const NOK_ORE = new Intl.NumberFormat("nb-NO", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

// A whole krone drops the ",00". Half a krone keeps two digits, never one.
export const fmtNOKExact = (n: number): string =>
  Math.round(n * 100) % 100 === 0 ? fmtNOK(n) : kr(NOK_ORE.format(n));

export const fmtPct = (share: number): string =>
  `${Math.round(share * 1000) / 10}%`;

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
  originalCounterparty: "Imported payee",
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
    if (key === "accountKey" || key === "card" || skip.includes(key)) return [];
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

export { bankLabel } from "../../core/labels.ts";

export const fmtDateTime = (ms: number): string =>
  new Date(ms).toLocaleString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Oslo",
  });

export const fmtDate = (date: string): string =>
  new Date(`${date}T00:00:00Z`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });

const REGIONS = new Intl.DisplayNames(["en"], { type: "region" });

const REGION_CODES = new Map(
  Array.from({ length: 676 }, (_, i) =>
    String.fromCharCode(65 + Math.floor(i / 26), 65 + (i % 26)),
  ).flatMap((code) => {
    const name = REGIONS.of(code)!;
    const current =
      Intl.getCanonicalLocales(`und-${code}`)[0] === `und-${code}`;
    return name === code || !current
      ? []
      : [[name.toLowerCase(), code] as const];
  }),
);

export const flagOf = (country: string): string => {
  const code = REGION_CODES.get(country.toLowerCase());
  return code
    ? String.fromCodePoint(...[...code].map((c) => 0x1f1a5 + c.charCodeAt(0)))
    : "";
};

export const fmtShortDate = (date: string): string =>
  new Date(`${date}T00:00:00Z`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    ...(!date.startsWith(String(new Date().getFullYear())) && {
      year: "numeric",
    }),
    timeZone: "UTC",
  });

export const shortDateSizes = (dates: string[]): string[] => {
  const year = new Date().getFullYear();
  const y = dates.some((d) => !d.startsWith(String(year))) ? year - 1 : year;
  return [fmtShortDate(`${y}-09-28`)];
};

export const fmtDay = (date: string): string =>
  `${new Date(`${date}T00:00:00Z`).toLocaleDateString("en-GB", { weekday: "long", timeZone: "UTC" })} ${fmtShortDate(date)}`;

export const fmtMonth = (month: string): string =>
  new Date(`${month}-01T00:00:00Z`).toLocaleDateString("en-GB", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });

export const monthLabel = (month: string): string => {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y!, m! - 1, 1)).toLocaleDateString("en-GB", {
    month: "short",
    timeZone: "UTC",
  });
};

export const pointLabel = (at: string): string =>
  at.length > 7 ? `${Number(at.slice(8))} ${monthLabel(at)}` : monthLabel(at);

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
