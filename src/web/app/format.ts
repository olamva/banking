/** Presentation only — nothing here decides what a number is, just how it reads. */
import { useEffect, useRef, useState } from "react";
import { buildLabels, tidy, type Labels } from "../../core/labels.ts";
import type { Categorized } from "../../core/types.ts";

/**
 * Built once. `toLocaleString` builds its formatter per call, which is invisible
 * on a stat tile and is not on a two-thousand-row table — it was most of what
 * one of those cost to render.
 */
const NOK = new Intl.NumberFormat("nb-NO");

export const fmtNOK = (n: number): string => `${NOK.format(Math.round(n))} kr`;

/**
 * The øre as well. Every other figure on the page is a sum of many rows, where
 * two decimals are noise — one row's own amount is the one place they are the
 * point, so the detail view must not round 249,50 to 250.
 */
const NOK_EXACT = new Intl.NumberFormat("nb-NO", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export const fmtNOKExact = (n: number): string => `${NOK_EXACT.format(n)} kr`;

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

/**
 * A hue per main category, so a subcategory can say which main it belongs to
 * without a second column repeating the name.
 *
 * Assigned by position in the sorted list of every main in the *dataset*, never
 * the filtered view: hues derived from what is on screen would repaint the
 * table every time a filter moved, and a colour that means something different
 * after a click means nothing. Spread evenly rather than hashed because a hash
 * collides — the 17 mains on record put two pairs on the same hue, which is
 * exactly the distinction this is for.
 *
 * Set once beside `setLabels`, and for the same reason.
 */
let HUES: Record<string, number> = {};

export const setCategoryHues = (categories: string[]): void => {
  const sorted = [...new Set(categories)].sort();
  HUES = Object.fromEntries(
    sorted.map((c, i) => [c, Math.round((i * 360) / sorted.length)]),
  );
};

/**
 * `oklch` so the hues are perceptually even and every category lands at the same
 * lightness — `hsl` spends a third of its circle on greens and draws yellow far
 * brighter than blue at the same number. Lightness is a CSS variable because the
 * page has two themes and only that half of the colour changes between them.
 *
 * A category no `setCategoryHues` has seen keeps the ordinary text colour rather
 * than borrowing the hue of whichever main sorted first.
 */
export const categoryColor = (category: string): string =>
  category in HUES
    ? `oklch(var(--cat-l) 0.13 ${HUES[category]})`
    : "var(--color-ink)";

/** Split a `category/sub` pair; an empty sub half means the row had none. */
export const splitPair = (pair: string): [string, string | null] => {
  const cut = pair.indexOf("/");
  if (cut === -1) return [pair, null];
  const sub = pair.slice(cut + 1);
  return [pair.slice(0, cut), sub === "" ? null : sub];
};

/** What one pair is called on its own, without repeating its parent. */
export const pairLabel = (pair: string): string => subcategoryLabel(...splitPair(pair));

/**
 * What a category row in a tree is called, given the pairs beneath it.
 *
 * A category with exactly one *named* child reads as that child: everything
 * filed under `annet_lan_og_gjeld` is a student loan, so "Annet lån og gjeld"
 * is the vaguer of two names for one set of rows and "Studielån" is the useful
 * one. A category whose only child is the unnamed remainder keeps its own name
 * — "Vennebetaling" must not become "Annet".
 */
export const treeLabel = (category: string, pairs: string[]): string =>
  pairs.length === 1 && splitPair(pairs[0]!)[1] !== null
    ? pairLabel(pairs[0]!)
    : categoryLabel(category);

/**
 * The four field names camel-casing does not tidy into something readable. Every
 * other key reads as itself — `bankConfidence` -> `Bank confidence` — which is
 * what keeps this map from having to list `Txn` twice, and what makes a widened
 * `Txn` (`mcc`, `mccGroup`) show up in the detail view without a line here.
 */
/**
 * The one field with nothing to read in it: an opaque id, long enough to wrap to
 * a second line and push every other field down the dialog. The detail view
 * truncates it, and it is named here so that the rule and the map cannot drift.
 */
export const ID_FIELD = "Transaction ID";

const FIELD_NAMES: Record<string, string> = {
  id: ID_FIELD,
  counterparty: "Merchant",
  typeText: "Type",
  reason: "Excluded because",
};

const fieldName = (key: string): string =>
  FIELD_NAMES[key] ?? tidy(key.replace(/([A-Z])/g, " $1").toLowerCase());

/**
 * Every field the row carries, for the detail view — read off the row itself
 * rather than listed, so nothing has to be kept in step with `Txn`.
 *
 * `accountKey` is the one field held back: the key is a local secret and must
 * never be a label on the page, which is the whole reason `account` rides along
 * beside it. Nulls and empty strings are dropped — "the bank sent nothing here"
 * is better said by the row not being there.
 *
 * `skip` is for the caller that already shows a field somewhere better: the
 * detail view puts six of them in its heading, and a list repeating them under
 * it is the same fact twice.
 */
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

/**
 * What the bank itself called this row, as one thing rather than five fields:
 * the pair's names, and the pair's slugs under it. The slugs are there because
 * they are what a line in `rules/overrides.json` is written against — the names
 * are for reading, the slugs are for pasting.
 *
 * Null where the bank sent no category at all, which so far is never.
 *
 * Not `categorize`'s `bankPair`, which is a different question: that one applies
 * our renames and returns null for a catch-all, because it is deciding where a
 * row lands. This one reports what the bank literally said.
 */
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

/**
 * One row's own date, spelled out: `2026-07-04` reads `4. juli 2026`. Parsed and
 * formatted as UTC, because the string is already the Oslo-local day — reading
 * it in any other zone is what moves the 1st into the previous month.
 */
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
