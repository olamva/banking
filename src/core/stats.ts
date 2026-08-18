import { merchantOf } from "./select.ts";
import type { Categorized } from "./types.ts";

export type CategoryTotal = {
  category: string;
  total: number;
  share: number;
};

export type AccountTotal = {
  account: string;
  total: number;
  share: number;
};

export type CounterpartyTotal = {
  counterparty: string;
  total: number;
  count: number;
};

export type CategoryDelta = {
  category: string;
  current: number;
  previous: number;
  delta: number;
};

export type ExcludedSummary = {
  count: number;
  total: number;
};

export type MonthDelta = {
  totalIn: number;
  totalOut: number;
  net: number;
};

export type MonthStats = {
  month: string;
  totalIn: number;
  totalOut: number;
  net: number;
  categories: CategoryTotal[];
  subcategories: SubcategoryTotal[];
  topCounterparties: CounterpartyTotal[];
  incomeCategories: CategoryTotal[];
  incomeSubcategories: SubcategoryTotal[];
  topIncomeCounterparties: CounterpartyTotal[];
  incomeAccounts: AccountTotal[];
  subscriptions: Categorized[];
  recurring: Categorized[];
  categoryDeltas: CategoryDelta[];
  delta: MonthDelta | null;
  excluded: ExcludedSummary;
  accounts: AccountTotal[];
};

export type MonthSummary = {
  month: string;
  totalIn: number;
  totalOut: number;
  net: number;
  excluded: ExcludedSummary;
};

const toCents = (amount: number) => Math.round(amount * 100);
const fromCents = (cents: number) => cents / 100;
const byDate = (a: Categorized, b: Categorized) => a.date.localeCompare(b.date);

/** Largest-remainder rounding: integer basis points that always sum to 10000, so shares always sum to 1. */
function allocateShares(parts: number[]): number[] {
  const total = parts.reduce((sum, p) => sum + p, 0);
  if (total <= 0) return parts.map(() => 0);
  const scale = 10000;
  const raw = parts.map((p) => (p / total) * scale);
  const bp = raw.map(Math.floor);
  const remainder = scale - bp.reduce((sum, b) => sum + b, 0);
  const byFraction = raw
    .map((r, i) => ({ i, frac: r - Math.floor(r) }))
    .sort((a, b) => b.frac - a.frac);
  for (let k = 0; k < remainder; k++) bp[byFraction[k].i]++;
  return bp.map((b) => b / scale);
}

function slices(
  byKey: Map<string, number>,
): { key: string; total: number; share: number }[] {
  const keys = [...byKey.keys()];
  const cents = keys.map((k) => byKey.get(k)!);
  const shares = allocateShares(cents);
  return keys
    .map((key, i) => ({ key, total: fromCents(cents[i]), share: shares[i] }))
    .sort((a, b) => b.total - a.total);
}

const categoriesFromCents = (
  byCategory: Map<string, number>,
): CategoryTotal[] =>
  slices(byCategory).map(({ key, total, share }) => ({
    category: key,
    total,
    share,
  }));

export type SubcategoryTotal = {
  category: string;
  subcategory: string | null;
  total: number;
  share: number;
};

const SUB_KEY = (category: string, sub: string | null) =>
  `${category}/${sub ?? ""}`;

function subcategoriesFromCents(
  bySub: Map<string, number>,
): SubcategoryTotal[] {
  const byParent = new Map<string, Map<string, number>>();
  for (const [key, cents] of bySub) {
    const cut = key.indexOf("/");
    const category = key.slice(0, cut);
    (
      byParent.get(category) ?? byParent.set(category, new Map()).get(category)!
    ).set(key.slice(cut + 1), cents);
  }
  const out: SubcategoryTotal[] = [];
  for (const [category, subs] of byParent) {
    for (const { key, total, share } of slices(subs)) {
      out.push({
        category,
        subcategory: key === "" ? null : key,
        total,
        share,
      });
    }
  }
  const parentTotal = (c: string) =>
    out.reduce((n, x) => n + (x.category === c ? x.total : 0), 0);
  return out.sort(
    (a, b) =>
      parentTotal(b.category) - parentTotal(a.category) || b.total - a.total,
  );
}

const accountsFromCents = (byAccount: Map<string, number>): AccountTotal[] =>
  slices(byAccount).map(({ key, total, share }) => ({
    account: key,
    total,
    share,
  }));

type SideAgg = {
  cents: number;
  categoryCents: Map<string, number>;
  subCents: Map<string, number>;
  accountCents: Map<string, number>;
};

type CentsAgg = {
  in: SideAgg;
  out: SideAgg;
  excludedCount: number;
  excludedCents: number;
};

const emptySide = (): SideAgg => ({
  cents: 0,
  categoryCents: new Map(),
  subCents: new Map(),
  accountCents: new Map(),
});

const bump = (m: Map<string, number>, key: string, cents: number) =>
  m.set(key, (m.get(key) ?? 0) + cents);

function aggregateCents(txns: Categorized[]): CentsAgg {
  const agg: CentsAgg = {
    in: emptySide(),
    out: emptySide(),
    excludedCount: 0,
    excludedCents: 0,
  };
  for (const t of txns) {
    const cents = toCents(t.amount);
    if (t.excluded) {
      agg.excludedCount++;
      agg.excludedCents += Math.abs(cents);
      continue;
    }
    if (cents === 0) continue;
    const side = cents > 0 ? agg.in : agg.out;
    const mag = Math.abs(cents);
    side.cents += mag;
    bump(side.categoryCents, t.category, mag);
    bump(side.subCents, SUB_KEY(t.category, t.subcategory), mag);
    bump(side.accountCents, t.account, mag);
  }
  return agg;
}

export type Totals = {
  totalIn: number;
  totalOut: number;
  net: number;
  excluded: ExcludedSummary;
};

export function totals(txns: Categorized[]): Totals {
  const agg = aggregateCents(txns);
  return {
    totalIn: fromCents(agg.in.cents),
    totalOut: fromCents(agg.out.cents),
    net: fromCents(agg.in.cents - agg.out.cents),
    excluded: { count: agg.excludedCount, total: fromCents(agg.excludedCents) },
  };
}

function topCounterparties(
  txns: Categorized[],
  dir: "in" | "out",
  limit = 25,
): CounterpartyTotal[] {
  const byCp = new Map<string, { cents: number; count: number }>();
  for (const t of txns) {
    if (t.excluded || t.counterparty === null) continue;
    if (dir === "out" ? t.amount >= 0 : t.amount <= 0) continue;
    const entry = byCp.get(t.counterparty) ?? { cents: 0, count: 0 };
    entry.cents += Math.abs(toCents(t.amount));
    entry.count++;
    byCp.set(t.counterparty, entry);
  }
  return [...byCp.entries()]
    .map(([counterparty, { cents, count }]) => ({
      counterparty,
      total: fromCents(cents),
      count,
    }))
    .sort((a, b) => b.total - a.total)
    .slice(0, limit);
}

export function monthStats(
  month: string,
  txns: Categorized[],
  previous?: Categorized[],
): MonthStats {
  const agg = aggregateCents(txns);
  const prevAgg = previous ? aggregateCents(previous) : null;

  const categoryDeltas: CategoryDelta[] = [];
  if (prevAgg) {
    const names = new Set([
      ...agg.out.categoryCents.keys(),
      ...prevAgg.out.categoryCents.keys(),
    ]);
    for (const category of names) {
      const current = fromCents(agg.out.categoryCents.get(category) ?? 0);
      const prev = fromCents(prevAgg.out.categoryCents.get(category) ?? 0);
      categoryDeltas.push({
        category,
        current,
        previous: prev,
        delta: current - prev,
      });
    }
    categoryDeltas.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
  }

  return {
    month,
    totalIn: fromCents(agg.in.cents),
    totalOut: fromCents(agg.out.cents),
    net: fromCents(agg.in.cents - agg.out.cents),
    categories: categoriesFromCents(agg.out.categoryCents),
    subcategories: subcategoriesFromCents(agg.out.subCents),
    topCounterparties: topCounterparties(txns, "out"),
    incomeCategories: categoriesFromCents(agg.in.categoryCents),
    incomeSubcategories: subcategoriesFromCents(agg.in.subCents),
    topIncomeCounterparties: topCounterparties(txns, "in"),
    incomeAccounts: accountsFromCents(agg.in.accountCents),
    subscriptions: txns
      .filter((t) => !t.excluded && t.isSubscription)
      .sort(byDate),
    recurring: txns.filter((t) => !t.excluded && t.isRecurring).sort(byDate),
    categoryDeltas,
    delta: prevAgg
      ? {
          totalIn: fromCents(agg.in.cents - prevAgg.in.cents),
          totalOut: fromCents(agg.out.cents - prevAgg.out.cents),
          net: fromCents(
            agg.in.cents -
              agg.out.cents -
              (prevAgg.in.cents - prevAgg.out.cents),
          ),
        }
      : null,
    excluded: { count: agg.excludedCount, total: fromCents(agg.excludedCents) },
    accounts: accountsFromCents(agg.out.accountCents),
  };
}

export function byMonth(
  txns: Categorized[],
): { month: string; txns: Categorized[] }[] {
  const buckets = new Map<string, Categorized[]>();
  for (const t of txns) {
    const month = t.date.slice(0, 7);
    const bucket = buckets.get(month);
    if (bucket) bucket.push(t);
    else buckets.set(month, [t]);
  }
  return [...buckets.entries()]
    .sort()
    .map(([month, txns]) => ({ month, txns }));
}

export type SeriesPoint = {
  at: string;
  totalIn: number;
  totalOut: number;
};

const point = (at: string, txns: Categorized[]): SeriesPoint => {
  const agg = aggregateCents(txns);
  return {
    at,
    totalIn: fromCents(agg.in.cents),
    totalOut: fromCents(agg.out.cents),
  };
};

const eachDay = (from: string, to: string): string[] => {
  const out: string[] = [];
  const cursor = new Date(`${from}T00:00:00Z`);
  for (let at = from; at <= to;) {
    out.push(at);
    cursor.setUTCDate(cursor.getUTCDate() + 1);
    at = cursor.toISOString().slice(0, 10);
  }
  return out;
};

export function dailySeries(
  txns: Categorized[],
  from: string,
  to: string,
): SeriesPoint[] {
  const buckets = new Map<string, Categorized[]>();
  for (const t of txns) {
    const bucket = buckets.get(t.date);
    if (bucket) bucket.push(t);
    else buckets.set(t.date, [t]);
  }
  return eachDay(from, to).map((at) => point(at, buckets.get(at) ?? []));
}

export function monthlySeries(txns: Categorized[]): SeriesPoint[] {
  return byMonth(txns).map(({ month, txns }) => point(month, txns));
}

export function cumulative(series: SeriesPoint[]): SeriesPoint[] {
  let inCents = 0;
  let outCents = 0;
  return series.map((p) => {
    inCents += toCents(p.totalIn);
    outCents += toCents(p.totalOut);
    return {
      at: p.at,
      totalIn: fromCents(inCents),
      totalOut: fromCents(outCents),
    };
  });
}

export type YearStats = {
  year: string;
  months: MonthSummary[];
  categories: CategoryTotal[];
  subcategories: SubcategoryTotal[];
  averageMonth: {
    totalIn: number;
    totalOut: number;
    net: number;
  };
  excluded: ExcludedSummary;
};

const monthIndex = (month: string): number => {
  const [y, m] = month.split("-").map(Number);
  return y! * 12 + (m! - 1);
};

export function withGaps(series: SeriesPoint[]): (SeriesPoint | null)[] {
  if (series.length === 0) return [];
  const byIndex = new Map(series.map((m) => [monthIndex(m.at), m]));
  const bounds = [...byIndex.keys()];
  const from = Math.min(...bounds);
  const to = Math.max(...bounds);
  const out: (SeriesPoint | null)[] = [];
  for (let i = from; i <= to; i++) out.push(byIndex.get(i) ?? null);
  return out;
}

export function spendTrend(
  dense: (SeriesPoint | null)[],
): { slope: number; intercept: number } | null {
  const pts = dense.flatMap((p, x) => (p ? [{ x, y: p.totalOut }] : []));
  if (pts.length < 2) return null;
  const mx = pts.reduce((s, p) => s + p.x, 0) / pts.length;
  const my = pts.reduce((s, p) => s + p.y, 0) / pts.length;
  const varX = pts.reduce((s, p) => s + (p.x - mx) ** 2, 0);
  if (varX === 0) return null;
  const slope = pts.reduce((s, p) => s + (p.x - mx) * (p.y - my), 0) / varX;
  return { slope, intercept: my - slope * mx };
}

export function yearStats(
  year: string,
  monthsTxns: { month: string; txns: Categorized[] }[],
): YearStats {
  const sorted = [...monthsTxns].sort((a, b) => a.month.localeCompare(b.month));

  const months: MonthSummary[] = sorted.map(({ month, txns }) => {
    const agg = aggregateCents(txns);
    return {
      month,
      totalIn: fromCents(agg.in.cents),
      totalOut: fromCents(agg.out.cents),
      net: fromCents(agg.in.cents - agg.out.cents),
      excluded: {
        count: agg.excludedCount,
        total: fromCents(agg.excludedCents),
      },
    };
  });

  const agg = aggregateCents(sorted.flatMap((m) => m.txns));
  const n = months.length || 1;

  return {
    year,
    months,
    categories: categoriesFromCents(agg.out.categoryCents),
    subcategories: subcategoriesFromCents(agg.out.subCents),
    averageMonth: {
      totalIn: fromCents(Math.round(agg.in.cents / n)),
      totalOut: fromCents(Math.round(agg.out.cents / n)),
      net: fromCents(Math.round((agg.in.cents - agg.out.cents) / n)),
    },
    excluded: { count: agg.excludedCount, total: fromCents(agg.excludedCents) },
  };
}

export type SubscriptionGroup = {
  name: string;
  category: string;
  count: number;
  total: number;
  // NOK charged on `last`, not the average — what it costs now.
  // ponytail: assumes a monthly price, so a yearly bill reads as its yearly amount.
  latest: number;
  last: string;
};

export function subscriptionGroups(txns: Categorized[]): SubscriptionGroup[] {
  type Acc = {
    cents: number;
    latestCents: number;
    count: number;
    last: string;
    category: string;
    flagged: boolean;
  };
  const byName = new Map<string, Acc>();
  for (const t of txns) {
    if (t.excluded) continue;
    const name = merchantOf(t);
    const cents = -toCents(t.amount);
    const group = byName.get(name) ?? {
      cents: 0,
      latestCents: 0,
      count: 0,
      last: t.date,
      category: t.category,
      flagged: false,
    };
    group.cents += cents;
    group.count++;
    group.flagged ||= t.isSubscription || t.isRecurring;
    if (t.date > group.last) {
      group.last = t.date;
      group.category = t.category;
      group.latestCents = cents;
    } else if (t.date === group.last) {
      group.latestCents += cents;
    }
    byName.set(name, group);
  }
  return [...byName.entries()]
    .filter(([, g]) => g.flagged)
    .map(([name, g]) => ({
      name,
      category: g.category,
      count: g.count,
      total: fromCents(g.cents),
      latest: fromCents(g.latestCents),
      last: g.last,
    }))
    .sort((a, b) => b.total - a.total);
}

export function subsAndRecurring(stats: MonthStats): Categorized[] {
  const seen = new Set<string>();
  return [...stats.subscriptions, ...stats.recurring]
    .filter((t) => {
      if (seen.has(t.id)) return false;
      seen.add(t.id);
      return true;
    })
    .sort(byDate);
}
