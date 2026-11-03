import {
  spendingInsights,
  type MerchantHabit,
  type WeekdayHabit,
} from "./insights.ts";
import { buildLabels, type Names } from "./labels.ts";
import { preferenceKey } from "./preferences.ts";
import type { Receipt } from "./receipts.ts";
import { inRange, merchantOf, period, todayOslo } from "./select.ts";
import {
  byMonth,
  cumulative,
  dailySeries,
  monthStats,
  subscriptionGroups,
  totals,
  visibleDeltas,
  yearStats,
  type AccountTotal,
  type CategoryDelta,
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
  remember: string | null;
  receipt: Receipt | null;
};

export type AppInsights = {
  transactionCount: number;
  merchantCount: number;
  weekdays: WeekdayHabit[];
  topByTransactions: MerchantHabit[];
  topBySpend: MerchantHabit[];
  expected: MerchantHabit[];
  merchants: MerchantHabit[];
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
  incomeMerchants: CounterpartyTotal[];
  accounts: AccountTotal[];
  changes: CategoryDelta[];
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
  insights: AppInsights;
};

export type AppData = {
  generated: string;
  today: string;
  labels: Record<string, string>;
  months: AppMonth[];
  years: AppYear[];
  insights: AppInsights;
  txns: AppTxn[];
};

const MERCHANTS = 12;
const EXPECTED = 10;
const HABITS = 40;

const appInsights = (rows: Categorized[], today: string): AppInsights => {
  const all = spendingInsights(rows, today);
  return {
    transactionCount: all.transactionCount,
    merchantCount: all.merchantCount,
    weekdays: all.weekdays,
    topByTransactions: all.topByTransactions,
    topBySpend: all.topBySpend,
    expected: all.merchants
      .filter((m) => m.returnPattern?.active)
      .sort((a, b) =>
        a.returnPattern!.expectedNext.localeCompare(
          b.returnPattern!.expectedNext,
        ),
      )
      .slice(0, EXPECTED),
    merchants: all.merchants.slice(0, HABITS),
  };
};

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
    incomeMerchants: stats.topIncomeCounterparties.slice(0, MERCHANTS),
    accounts: stats.accounts,
    changes: visibleDeltas(stats.categoryDeltas),
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
  today: string,
): AppYear {
  const stats = yearStats(year, months);
  const rows = months.flatMap((m) => m.txns);
  const sum = totals(rows);
  return {
    year,
    totalIn: sum.totalIn,
    totalOut: sum.totalOut,
    net: sum.net,
    averageOut: stats.averageMonth.totalOut,
    categories: stats.categories,
    insights: appInsights(rows, today),
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
  remember: t.excluded ? null : preferenceKey(t),
  receipt: t.receipt ?? null,
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
      ([year, ms]) => appYear(year, ms, today),
    ),
    insights: appInsights(txns, today),
    txns: txns.toSorted((a, b) => b.date.localeCompare(a.date)).map(appTxn),
  };
}
