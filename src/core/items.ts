import { compile } from "./match.ts";
import type { Receipt } from "./receipts.ts";
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
};

export type Item = {
  key: string;
  name: string;
  sizes: string[];
  unit?: "kg";
  count: number;
  qty: number;
  spent: number;
  price: number;
  last: string;
  medianDays: number | null;
  purchases: Purchase[];
};

const osloDay = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Oslo" });

const PACKAGING = new Set([
  "bx",
  "boks",
  "fl",
  "flaske",
  "plastfl",
  "fridepack",
  "x",
]);

const tidy = (name: string): string => {
  const shouted = name === name.toUpperCase();
  return (
    name
      .split(/\s+/)
      .filter((w) => !PACKAGING.has(w.toLowerCase()))
      .map((w) =>
        w === "R"
          ? "REMA 1000"
          : shouted
            ? w.charAt(0) + w.slice(1).toLowerCase()
            : w,
      )
      .join(" ") || name
  );
};

export const itemPattern = (raw: string): string =>
  `/^${raw.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$/`;

const namer = (rules: RuleMap) => {
  const found = Object.entries(rules).map(
    ([pattern, name]) => [compile(pattern, "rules/items.json"), name] as const,
  );
  return (raw: string) =>
    found.find(([matches]) => matches(raw.toLowerCase()))?.[1] ?? tidy(raw);
};

export const nameKey = (name: string): string =>
  name
    .toLowerCase()
    .replace(/(\d),(\d)/g, "$1.$2")
    .split(/\s+/)
    .filter((w) => w && !PACKAGING.has(w))
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

const receiptPurchases = (
  receipt: Receipt,
  nameOf: (raw: string) => string,
): Purchase[] =>
  [
    ...Map.groupBy(
      receipt.lines.filter((l) => l.amount > 0),
      (l) => `${l.name}\n${sizeKey(l.size)}`,
    ).values(),
  ].map((same) => {
    const name = nameOf(same[0]!.name);
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
      amount: ore(same.reduce((n, l) => n + l.amount, 0)),
    };
  });

export const purchasesOf = (
  txns: Categorized[],
  rules: RuleMap = {},
): Purchase[] => {
  const nameOf = namer(rules);
  return txns.flatMap((t) =>
    t.receipt ? receiptPurchases(t.receipt, nameOf) : [],
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
    return {
      key,
      name: commonest(sorted.map((p) => p.name)),
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
      purchases: sorted,
    };
  });
