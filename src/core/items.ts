import { compile } from "./match.ts";
import type { Receipt, ReceiptLine } from "./receipts.ts";
import type { RuleMap } from "./ruleFiles.ts";
import type { Categorized } from "./types.ts";

export type Purchase = {
  key: string;
  sizeKey: string;
  receipt: Receipt;
  raw: string;
  name: string;
  size?: string;
  date: string;
  store: string;
  qty: number;
  unit?: "kg";
  amount: number;
  discount: number;
  category?: string;
};

export type Item = {
  key: string;
  name: string;
  category: string;
  sizes: string[];
  unit?: "kg";
  count: number;
  qty: number;
  spent: number;
  price: number;
  last: string;
  medianDays: number | null;
  usual: number | null;
  change: number | null;
  purchases: Purchase[];
};

const osloDay = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Oslo" });

const NOISE = new Set([
  "bx",
  "boks",
  "fl",
  "flaske",
  "plastfl",
  "glassflas",
  "fridepack",
  "sleek",
  "ow",
  "krt",
  "kartong",
  "pose",
  "poser",
  "filmet",
  "løsvekt",
  "stykk",
  "stk",
  "kg",
  "lavpris",
  "x",
]);

const ORIGIN = new Set(["no", "n", "imp"]);

const RESIDUE = /^(?:0[.,]\d+|\d[.,]\d\d|\d+(?:\.{2,}|-)|,)$/;

const tidy = (name: string): string => {
  const shouted = name === name.toUpperCase();
  const words = name
    .replace(/\([^)\p{L}]*\)/gu, " ")
    .replace(/\brema 1000\b/gi, "Rema")
    .split(/\s+/)
    .filter((w) => w && !NOISE.has(w.toLowerCase()) && !RESIDUE.test(w));
  while (words.length > 1 && ORIGIN.has(words.at(-1)!.toLowerCase()))
    words.pop();
  return (
    words
      .map((w) =>
        w === "R" || w.toLowerCase() === "rema"
          ? "REMA 1000"
          : shouted
            ? w.charAt(0) + w.slice(1).toLowerCase()
            : w,
      )
      .join(" ")
      .replace(/,$/, "") || name
  );
};

export const itemPattern = (raw: string): string =>
  `/^${raw.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$/`;

const lookup = (rules: RuleMap, file: string) => {
  const found = Object.entries(rules).map(
    ([pattern, value]) => [compile(pattern, file), value] as const,
  );
  return (text: string) =>
    found.find(([matches]) => matches(text.toLowerCase()))?.[1];
};

const namer = (rules: RuleMap) => {
  const named = lookup(rules, "rules/items.json");
  return (raw: string) => named(raw) ?? tidy(raw);
};

export const UNCATEGORIZED = "Uncategorized";

const AISLES: Record<string, string> = {
  "10": "Pantry",
  "1023": "Snacks & sweets",
  "1024": "Snacks & sweets",
  "1025": "Snacks & sweets",
  "1027": "Snacks & sweets",
  "1028": "Snacks & sweets",
  "1035": "Snacks & sweets",
  "11": "Meat & fish",
  "1126": "Dairy & eggs",
  "1128": "Dairy & eggs",
  "1129": "Dairy & eggs",
  "1130": "Pantry",
  "1133": "Pantry",
  "12": "Bread & bakery",
  "13": "Frozen",
  "1321": "Snacks & sweets",
  "14": "Dairy & eggs",
  "1412": "Drinks",
  "1417": "Drinks",
  "15": "Drinks",
  "1521": "Alcohol",
  "16": "Fruit & veg",
  "18": "Household",
  "1810": "Personal care",
  "1914": "Personal care",
};

const groupName = (name: string): string | undefined => {
  const kept = name.replace(/\s*\((?:detaljert\)|[^)]*$)/i, "").trim();
  return /^(\d*|ikke i bruk)$/i.test(kept)
    ? undefined
    : kept.charAt(0) + kept.slice(1).toLowerCase();
};

const groupCategory = (group: ReceiptLine["group"]): string | undefined =>
  group &&
  [
    AISLES[group.code.slice(0, 4)] ?? AISLES[group.code.slice(0, 2)] ?? "Other",
    groupName(group.name),
  ]
    .filter(Boolean)
    .join("/");

const SPENT_ON: Record<string, string> = {
  "medier_og_underholdning/apper_og_spill": "Games & apps",
  "medier_og_underholdning/strommetjenester": "Streaming",
  "medier_og_underholdning/bokhandler": "Books",
  "hobby_og_fritid/nettjenester": "Games & apps",
  "hjem_og_hage/hvitevarer_og_elektronikk": "Electronics",
  hjem_og_hage: "Home",
  hobby_og_fritid: "Leisure",
  kafe_og_restaurant: "Eating out",
  reise: "Travel",
  bil_og_transport: "Transport",
  klaer_og_utstyr: "Clothing & gear",
  helse_og_velvaere: "Personal care",
};

const spentOn = (t: Categorized): string | undefined =>
  SPENT_ON[`${t.category}/${t.subcategory}`] ?? SPENT_ON[t.category];

export const topCategory = (category: string): string =>
  category.split("/")[0]!;

export const nameKey = (name: string): string =>
  name
    .toLowerCase()
    .replace(/(\d),(\d)/g, "$1.$2")
    .split(/\s+/)
    .filter((w) => w && !NOISE.has(w))
    .sort()
    .join(" ");

const BASE: Record<string, [string, number]> = {
  ml: ["l", 0.001],
  cl: ["l", 0.01],
  dl: ["l", 0.1],
  mg: ["g", 0.001],
  kg: ["g", 1000],
  stk: ["pk", 1],
};

const sizeKey = (size = ""): string =>
  [
    ...new Set(
      size
        .toLowerCase()
        .replace(/ca\. /g, "")
        .replace(/,/g, ".")
        .split(" · ")
        .flatMap((part) => {
          const [, before, amount, unit = "", after] =
            part.match(/^(?:(\d+) × )?([\d.]+) ?([a-z]*)(?: × (\d+))?$/) ?? [];
          if (!amount) return [part];
          const [base, factor] = BASE[unit] ?? [unit, 1];
          const count = before ?? after;
          return [
            `${Number((Number(amount) * factor).toFixed(6))} ${base}`.trim(),
            ...(count ? [`${count} pk`] : []),
          ];
        }),
    ),
  ]
    .sort()
    .join(" · ");

const ore = (n: number) => Math.round(n * 100) / 100;

export const packPrice = (p: Purchase): number =>
  p.qty ? p.amount / p.qty : p.amount;

export const shelfPrice = (p: Purchase): number =>
  packPrice({ ...p, amount: p.amount + p.discount });

export const unitPrice = (
  p: Purchase,
): { price: number; per: "kg" | "l" | "stk" } | null => {
  if (p.unit) return null;
  const parts = p.sizeKey.split(" · ");
  const pk = parts.find((s) => s.endsWith(" pk"));
  const count = Number(pk?.slice(0, -3) ?? 1);
  const [, amount, base] =
    parts.map((s) => s.match(/^([\d.]+) (g|l)$/)).find(Boolean) ?? [];
  const content = Number(amount) * count * (base === "g" ? 0.001 : 1);
  return amount
    ? { price: packPrice(p) / content, per: base === "g" ? "kg" : "l" }
    : pk
      ? { price: packPrice(p) / count, per: "stk" }
      : null;
};

export const isBought = (l: ReceiptLine): boolean =>
  l.amount > 0 && !l.fee && !/\bpant\b/i.test(l.name);

const receiptPurchases = (
  receipt: Receipt,
  nameOf: (raw: string) => string,
  withoutDeposit: boolean,
  categoryOf: (name: string) => string | undefined,
  fallback: string | undefined,
): Purchase[] =>
  [
    ...Map.groupBy(
      receipt.lines.filter(isBought),
      (l) => `${l.name}\n${sizeKey(l.size)}`,
    ).values(),
  ].map((same) => {
    const name = nameOf(same[0]!.name);
    const category =
      categoryOf(name) ?? groupCategory(same[0]!.group) ?? fallback;
    return {
      key: nameKey(name),
      sizeKey: sizeKey(same[0]!.size),
      receipt,
      raw: same[0]!.name,
      name,
      size: same[0]!.size,
      date: osloDay.format(receipt.at),
      store: receipt.store,
      qty: same.reduce((n, l) => n + l.qty, 0),
      unit: same[0]!.unit,
      amount: ore(
        same.reduce(
          (n, l) => n + l.amount - (withoutDeposit ? (l.deposit ?? 0) : 0),
          0,
        ),
      ),
      discount: ore(
        same
          .flatMap((l) => l.discounts ?? [])
          .reduce((n, d) => n + d.amount, 0),
      ),
      ...(category ? { category } : {}),
    };
  });

const bought = (
  txns: Categorized[],
  rules: RuleMap,
  withoutDeposit: boolean,
  categories: RuleMap,
): Purchase[][] => {
  const nameOf = namer(rules);
  const categoryOf = lookup(categories, "rules/item-categories.json");
  return txns.map((t) =>
    t.receipt
      ? receiptPurchases(
          t.receipt,
          nameOf,
          withoutDeposit,
          categoryOf,
          spentOn(t),
        )
      : [],
  );
};

export const purchasesOf = (
  txns: Categorized[],
  rules: RuleMap = {},
  withoutDeposit = false,
  categories: RuleMap = {},
): Purchase[] => bought(txns, rules, withoutDeposit, categories).flat();

export const withItems = (
  txns: Categorized[],
  rules: RuleMap = {},
  categories: RuleMap = {},
): Categorized[] => {
  const each = bought(txns, rules, false, categories);
  const kindOf = new Map(
    [...Map.groupBy(each.flat(), (p) => p.key)].map(([key, list]) => [
      key,
      itemCategory(list),
    ]),
  );
  return txns.map((t, i) =>
    t.receipt
      ? {
          ...t,
          items: [...new Set(each[i]!.map((p) => p.key))],
          kinds: [
            ...new Set(
              each[i]!.flatMap((p) => {
                const c = kindOf.get(p.key)!;
                return [topCategory(c), c];
              }),
            ),
          ],
        }
      : t,
  );
};

const median = (xs: number[]): number | null => {
  const s = xs.toSorted((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length
    ? s.length % 2
      ? s[mid]!
      : (s[mid - 1]! + s[mid]!) / 2
    : null;
};

const commonest = (xs: string[]): string =>
  [...Map.groupBy(xs, (x) => x)].sort(
    (a, b) =>
      b[1].length - a[1].length ||
      Number(a[0] === a[0].toUpperCase()) - Number(b[0] === b[0].toUpperCase()),
  )[0]![0];

const itemCategory = (list: Purchase[]): string => {
  const known = list.flatMap((p) => p.category ?? []);
  return known.length ? commonest(known) : UNCATEGORIZED;
};

const dayOf = (date: string) => Date.parse(`${date}T00:00:00Z`) / 864e5;

export const itemsOf = (purchases: Purchase[], bySize = false): Item[] =>
  [
    ...Map.groupBy(purchases, (p) =>
      bySize ? `${p.key}\n${p.sizeKey}` : p.key,
    ),
  ].map(([key, list]) => {
    const sorted = list.toSorted((a, b) => b.date.localeCompare(a.date));
    const qty = sorted.reduce((n, p) => n + p.qty, 0);
    const spent = ore(sorted.reduce((n, p) => n + p.amount, 0));
    const days = [...new Set(sorted.map((p) => dayOf(p.date)))];
    const [now, ...before] = sorted
      .filter((p) => p.sizeKey === sorted[0]!.sizeKey)
      .map(shelfPrice);
    const usual = before.length > 1 ? median(before) : null;
    return {
      key,
      name: commonest(sorted.map((p) => p.name)),
      category: itemCategory(sorted),
      sizes: [
        ...new Map(
          sorted.filter((p) => p.size).map((p) => [p.sizeKey, p.size!]),
        ).values(),
      ],
      unit: sorted[0]!.unit,
      count: new Set(sorted.map((p) => p.receipt)).size,
      qty,
      spent,
      price: qty ? ore(spent / qty) : 0,
      last: sorted[0]!.date,
      medianDays: median(days.slice(1).map((d, i) => days[i]! - d)),
      usual,
      change: usual ? now! / usual - 1 : null,
      purchases: sorted,
    };
  });
