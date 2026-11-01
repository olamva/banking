import { buildLabels, type Names } from "./labels.ts";
import { inRange, merchantOf, period, todayOslo } from "./select.ts";
import {
  byMonth,
  cumulative,
  dailySeries,
  monthStats,
  subscriptionGroups,
  totals,
  yearStats,
  type CategoryTotal,
  type CounterpartyTotal,
  type MonthDelta,
  type SubscriptionGroup,
  type SubcategoryTotal,
  type Totals,
} from "./stats.ts";
import type { Categorized } from "./types.ts";

export type AppTxn = {
  date: string;
  amount: number;
  merchant: string;
  description: string;
  category: string;
  subcategory: string | null;
  account: string;
  country: string | null;
  type: string | null;
  recurring: boolean;
  pending: boolean;
  excluded: string | null;
};

export type AppMonth = {
  month: string;
  totalIn: number;
  totalOut: number;
  net: number;
  delta: MonthDelta | null;
  compared: string | null;
  categories: CategoryTotal[];
  subcategories: SubcategoryTotal[];
  incomeCategories: CategoryTotal[];
  merchants: CounterpartyTotal[];
  subscriptions: SubscriptionGroup[];
  excluded: Totals["excluded"];
  spentByDay: number[];
  incomeByDay: number[];
};

export type AppYear = {
  year: string;
  totalIn: number;
  totalOut: number;
  net: number;
  averageOut: number;
  categories: CategoryTotal[];
};

export type AppData = {
  generated: string;
  today: string;
  labels: Record<string, string>;
  months: AppMonth[];
  years: AppYear[];
  txns: AppTxn[];
};

const MERCHANTS = 12;

const lastDay = (month: string, today: string): string =>
  today.startsWith(month)
    ? today
    : new Date(Date.UTC(+month.slice(0, 4), +month.slice(5), 0))
        .toISOString()
        .slice(0, 10);

function appMonth(
  month: string,
  rows: Categorized[],
  all: Categorized[],
  today: string,
): AppMonth {
  const prev = period(month, today).prev!;
  const before = all.filter((t) => inRange(t, prev.from, prev.to));
  const stats = monthStats(month, rows, before.length ? before : undefined);
  const days = cumulative(
    dailySeries(rows, `${month}-01`, lastDay(month, today)),
  );
  return {
    month,
    totalIn: stats.totalIn,
    totalOut: stats.totalOut,
    net: stats.net,
    delta: stats.delta,
    compared: before.length ? prev.label : null,
    categories: stats.categories,
    subcategories: stats.subcategories,
    incomeCategories: stats.incomeCategories,
    merchants: stats.topCounterparties.slice(0, MERCHANTS),
    subscriptions: subscriptionGroups(
      rows.filter((t) => t.isSubscription || t.isRecurring),
    ),
    excluded: stats.excluded,
    spentByDay: days.map((p) => p.totalOut),
    incomeByDay: days.map((p) => p.totalIn),
  };
}

function appYear(
  year: string,
  months: { month: string; txns: Categorized[] }[],
): AppYear {
  const stats = yearStats(year, months);
  const sum = totals(months.flatMap((m) => m.txns));
  return {
    year,
    totalIn: sum.totalIn,
    totalOut: sum.totalOut,
    net: sum.net,
    averageOut: stats.averageMonth.totalOut,
    categories: stats.categories,
  };
}

const appTxn = (t: Categorized): AppTxn => ({
  date: t.date,
  amount: t.amount,
  merchant: merchantOf(t),
  description: t.description,
  category: t.category,
  subcategory: t.subcategory,
  account: t.account,
  country: t.country,
  type: t.typeText,
  recurring: t.isSubscription || t.isRecurring,
  pending: t.isPending,
  excluded: t.excluded ? (t.reason ?? "Excluded") : null,
});

export function appData(
  txns: Categorized[],
  names: Names = {},
  today = todayOslo(),
  generated = new Date().toISOString(),
): AppData {
  const months = byMonth(txns);
  const labelOf = buildLabels(txns, names);
  const labels: Record<string, string> = {};
  for (const t of txns) {
    labels[t.category] ??= labelOf.category(t.category);
    if (t.subcategory !== null)
      labels[`${t.category}/${t.subcategory}`] ??= labelOf.subcategory(
        t.category,
        t.subcategory,
      );
  }
  return {
    generated,
    today,
    labels,
    months: months.map(({ month, txns: rows }) =>
      appMonth(month, rows, txns, today),
    ),
    years: [...Map.groupBy(months, (m) => m.month.slice(0, 4))].map(
      ([year, ms]) => appYear(year, ms),
    ),
    txns: txns.toSorted((a, b) => b.date.localeCompare(a.date)).map(appTxn),
  };
}
