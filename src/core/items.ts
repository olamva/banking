import type { Receipt } from "./receipts.ts";
import type { Categorized } from "./types.ts";

export type Purchase = {
  key: string;
  receipt: string;
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
  size?: string;
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

const keyOf = (name: string) => name.toLowerCase().replace(/\s+/g, " ").trim();

const ore = (n: number) => Math.round(n * 100) / 100;

const receiptPurchases = (receipt: Receipt): Purchase[] =>
  [
    ...Map.groupBy(
      receipt.lines.filter((l) => l.amount > 0),
      (l) => keyOf(l.name),
    ),
  ].map(([key, same]) => ({
    key,
    receipt: `${receipt.source}:${receipt.id}`,
    name: same[0]!.name,
    size: same[0]!.size,
    date: osloDay.format(receipt.at),
    store: receipt.store,
    qty: same.reduce((n, l) => n + l.qty, 0),
    unit: same[0]!.unit,
    amount: ore(same.reduce((n, l) => n + l.amount, 0)),
  }));

export const purchasesOf = (txns: Categorized[]): Purchase[] =>
  txns.flatMap((t) => (t.receipt ? receiptPurchases(t.receipt) : []));

const median = (xs: number[]): number | null => {
  const s = xs.toSorted((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length
    ? s.length % 2
      ? s[mid]!
      : (s[mid - 1]! + s[mid]!) / 2
    : null;
};

const dayOf = (date: string) => Date.parse(`${date}T00:00:00Z`) / 864e5;

export const itemsOf = (purchases: Purchase[]): Item[] =>
  [...Map.groupBy(purchases, (p) => p.key)].map(([key, list]) => {
    const sorted = list.toSorted((a, b) => b.date.localeCompare(a.date));
    const latest = sorted[0]!;
    const qty = sorted.reduce((n, p) => n + p.qty, 0);
    const spent = ore(sorted.reduce((n, p) => n + p.amount, 0));
    const days = [...new Set(sorted.map((p) => dayOf(p.date)))];
    return {
      key,
      name: latest.name,
      size: latest.size,
      unit: latest.unit,
      count: sorted.length,
      qty,
      spent,
      price: qty ? ore(spent / qty) : 0,
      last: latest.date,
      medianDays: median(days.slice(1).map((d, i) => days[i]! - d)),
      purchases: sorted,
    };
  });
