import {
  spendingInsights,
  type MerchantHabit,
  type WeekdayHabit,
} from "./insights.ts";
import { bankLabel, buildLabels, type Names } from "./labels.ts";
import { payeePattern } from "./bulkRules.ts";
import { purchasesOf } from "./items.ts";
import type { Receipt } from "./receipts.ts";
import type { RuleMap } from "./ruleFiles.ts";
import {
  axisBounds,
  distinctMonths,
  distinctYears,
  inRange,
  matchesFilters,
  merchantOf,
  NO_FILTERS,
  period,
  todayOslo,
  type Filters,
  type PeriodKind,
} from "./select.ts";
import {
  byMonth,
  cumulative,
  dailySeries,
  monthStats,
  monthlySeries,
  subscriptionGroups,
  totals,
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

export type AppPurchase = {
  key: string;
  sizeKey: string;
  name: string;
  raw: string;
  size: string | null;
  qty: number;
  unit: string | null;
  amount: number;
};

export type AppTxn = {
  unnamed: boolean;
  original: string | null;
  remote: string | null;
  source: string | null;
  bank: [string, string] | null;
  purchases: AppPurchase[] | null;
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
  averageIn: number | null;
  delta: MonthDelta | null;
  compared: string | null;
  prev: { from: string; to: string } | null;
  categories: CategoryTotal[];
  subcategories: SubcategoryTotal[];
  incomeCategories: CategoryTotal[];
  incomeSubcategories: SubcategoryTotal[];
  merchants: CounterpartyTotal[];
  incomeMerchants: CounterpartyTotal[];
  accounts: AccountTotal[];
  incomeAccounts: AccountTotal[];
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

const MERCHANTS = 25;
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
  filters: Filters = NO_FILTERS,
): AppPeriod {
  const p = period(key, today);
  const all = txns.filter((t) => inRange(t, p.from, p.to));
  const rows = all.filter((t) => matchesFilters(t, filters));
  const earlier = p.prev
    ? txns.filter((t) => inRange(t, p.prev!.from, p.prev!.to))
    : [];
  const before = earlier.filter((t) => matchesFilters(t, filters));
  const stats = monthStats(p.label, rows, earlier.length ? before : undefined);
  const months = byMonth(rows);
  const average = months.length > 1 ? yearStats(p.label, months) : null;
  const { from, to } = axisBounds(all, p, today);
  return {
    key,
    kind: p.kind,
    label: p.label,
    from,
    to,
    totalIn: stats.totalIn,
    totalOut: stats.totalOut,
    net: stats.net,
    averageOut: average?.averageMonth.totalOut ?? null,
    averageIn: average?.averageMonth.totalIn ?? null,
    delta: stats.delta,
    compared: earlier.length ? p.prev!.label : null,
    prev: earlier.length ? { from: p.prev!.from, to: p.prev!.to } : null,
    categories: stats.categories,
    subcategories: stats.subcategories,
    incomeCategories: stats.incomeCategories,
    incomeSubcategories: stats.incomeSubcategories,
    merchants: stats.topCounterparties.slice(0, MERCHANTS),
    incomeMerchants: stats.topIncomeCounterparties.slice(0, MERCHANTS),
    accounts: stats.accounts,
    incomeAccounts: stats.incomeAccounts,
    changes: visibleDeltas(stats.categoryDeltas),
    subscriptions: subscriptionGroups(
      rows.filter((t) => t.isSubscription || t.isRecurring),
    ),
    excluded: totals(all).excluded,
    series: appSeries(rows, p.kind, from, to),
    insights: appInsights(rows, today),
  };
}

const appPurchases = (t: Categorized, items: RuleMap): AppPurchase[] | null =>
  t.receipt
    ? purchasesOf([t], items).map((p) => ({
        key: p.key,
        sizeKey: p.sizeKey,
        name: p.name,
        raw: p.raw,
        size: p.size ?? null,
        qty: p.qty,
        unit: p.unit ?? null,
        amount: p.amount,
      }))
    : null;

export const appTxn = (t: Categorized, items: RuleMap): AppTxn => ({
  unnamed: t.counterparty === null,
  original: t.originalCounterparty ?? null,
  remote: t.remoteAccountNumber,
  source: t.categorySource ?? null,
  bank: bankLabel(t),
  purchases: appPurchases(t, items),
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
  items: RuleMap = {},
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
    txns: txns
      .toSorted((a, b) => b.date.localeCompare(a.date))
      .map((t) => appTxn(t, items)),
  };
}
