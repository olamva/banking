import {
  spendingInsights,
  type MerchantHabit,
  type WeekdayHabit,
} from "./insights.ts";
import { buildLabels, type Names } from "./labels.ts";
import { payeePattern } from "./bulkRules.ts";
import type { Receipt } from "./receipts.ts";
import {
  axisBounds,
  distinctMonths,
  distinctYears,
  inRange,
  merchantOf,
  period,
  todayOslo,
  type PeriodKind,
} from "./select.ts";
import {
  byMonth,
  cumulative,
  dailySeries,
  monthStats,
  monthlySeries,
  subscriptionGroups,
  visibleDeltas,
  withGaps,
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

export type AppSeries = {
  bucket: "day" | "month";
  start: string;
  spent: number[];
  income: number[];
};

export type AppPeriod = {
  key: string;
  kind: PeriodKind;
  label: string;
  from: string;
  to: string;
  totalIn: number;
  totalOut: number;
  net: number;
  averageOut: number | null;
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
  series: AppSeries;
  insights: AppInsights;
};

export type AppData = {
  generated: string;
  today: string;
  labels: Record<string, string>;
  periods: AppPeriod[];
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

const appSeries = (
  rows: Categorized[],
  kind: PeriodKind,
  from: string,
  to: string,
): AppSeries => {
  const points =
    kind === "all"
      ? withGaps(monthlySeries(rows)).map(
          (p) => p ?? { at: "", totalIn: 0, totalOut: 0 },
        )
      : cumulative(dailySeries(rows, from, to));
  return {
    bucket: kind === "all" ? "month" : "day",
    start: kind === "all" ? from.slice(0, 7) : from,
    spent: points.map((p) => p.totalOut),
    income: points.map((p) => p.totalIn),
  };
};

export function appPeriod(
  key: string,
  txns: Categorized[],
  today = todayOslo(),
): AppPeriod {
  const p = period(key, today);
  const rows = txns.filter((t) => inRange(t, p.from, p.to));
  const before = p.prev
    ? txns.filter((t) => inRange(t, p.prev!.from, p.prev!.to))
    : [];
  const stats = monthStats(p.label, rows, before.length ? before : undefined);
  const months = byMonth(rows);
  const { from, to } = axisBounds(rows, p, today);
  return {
    key,
    kind: p.kind,
    label: p.label,
    from,
    to,
    totalIn: stats.totalIn,
    totalOut: stats.totalOut,
    net: stats.net,
    averageOut:
      months.length > 1
        ? yearStats(p.label, months).averageMonth.totalOut
        : null,
    delta: stats.delta,
    compared: before.length ? p.prev!.label : null,
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
    series: appSeries(rows, p.kind, from, to),
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
  remember: payeePattern(t),
  receipt: t.receipt ?? null,
});

export function appData(
  txns: Categorized[],
  names: Names = {},
  today = todayOslo(),
  generated = new Date().toISOString(),
): AppData {
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
    periods: [...distinctMonths(txns), ...distinctYears(txns), "all"].map(
      (key) => appPeriod(key, txns, today),
    ),
    txns: txns.toSorted((a, b) => b.date.localeCompare(a.date)).map(appTxn),
  };
}
