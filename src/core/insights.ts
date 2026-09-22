import { merchantOf } from "./select.ts";
import type { Categorized } from "./types.ts";

export const WEEKDAYS = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
] as const;

export type WeekdayName = (typeof WEEKDAYS)[number];

export interface WeekdayHabit {
  weekday: WeekdayName;
  count: number;
  total: number;
  share: number;
  topMerchant: string | null;
  topMerchantCount: number;
}

export interface ReturnPattern {
  medianDays: number;
  lowDays: number;
  highDays: number;
  expectedNext: string;
  active: boolean;
}

export interface MerchantHabit {
  merchant: string;
  count: number;
  activeDays: number;
  total: number;
  average: number;
  first: string | null;
  last: string | null;
  favoriteWeekday: WeekdayName | null;
  favoriteWeekdayCount: number;
  weekendVisitCount: number;
  topCategory: string;
  returnPattern: ReturnPattern | null;
}

export interface SpendingInsights {
  transactionCount: number;
  merchantCount: number;
  total: number;
  merchants: MerchantHabit[];
  topByTransactions: MerchantHabit[];
  topBySpend: MerchantHabit[];
  weekdays: WeekdayHabit[];
}

const toCents = (amount: number): number => Math.round(amount * 100);
const fromCents = (cents: number): number => cents / 100;
const ordinal = (date: string): number =>
  Math.floor(Date.parse(`${date}T00:00:00Z`) / 86_400_000);
const fromOrdinal = (day: number): string =>
  new Date(day * 86_400_000).toISOString().slice(0, 10);
const weekdayIndex = (date: string): number =>
  (new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7;
const median = (values: number[]): number => {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]!
    : Math.round((sorted[middle - 1]! + sorted[middle]!) / 2);
};
const percentile = (values: number[], position: number): number => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.round((sorted.length - 1) * position)]!;
};
const dominant = (counts: Map<string, number>): [string, number] =>
  [...counts.entries()].sort(
    ([a, countA], [b, countB]) => countB - countA || a.localeCompare(b),
  )[0]!;

interface MerchantAggregate {
  count: number;
  cents: number;
  dates: string[];
  categories: Map<string, number>;
}

export const spendingInsights = (
  txns: Categorized[],
  asOf?: string,
): SpendingInsights => {
  const spending = txns.filter((t) => !t.excluded && t.amount < 0);
  const timed = spending.filter((txn) => txn.card === true);
  const visits = [
    ...new Map(
      timed.map((txn) => [`${merchantOf(txn)}\u0000${txn.date}`, txn]),
    ).values(),
  ];
  const latest = timed.reduce(
    (date, txn) => (txn.date > date ? txn.date : date),
    "",
  );
  const byMerchant = new Map<string, MerchantAggregate>();
  const weekdayCounts = WEEKDAYS.map(() => 0);
  const weekdayCents = WEEKDAYS.map(() => 0);
  const weekdayMerchants = WEEKDAYS.map(() => new Map<string, number>());

  for (const txn of spending) {
    const merchant = merchantOf(txn);
    const cents = Math.abs(toCents(txn.amount));
    const current: MerchantAggregate = byMerchant.get(merchant) ?? {
      count: 0,
      cents: 0,
      dates: [],
      categories: new Map(),
    };
    current.count++;
    current.cents += cents;
    if (txn.card === true) current.dates.push(txn.date);
    current.categories.set(
      txn.category,
      (current.categories.get(txn.category) ?? 0) + 1,
    );
    byMerchant.set(merchant, current);
  }

  for (const txn of timed) {
    const weekday = weekdayIndex(txn.date);
    weekdayCents[weekday] += Math.abs(toCents(txn.amount));
  }

  for (const txn of visits) {
    const merchant = merchantOf(txn);
    const weekday = weekdayIndex(txn.date);
    weekdayCounts[weekday]++;
    weekdayMerchants[weekday]!.set(
      merchant,
      (weekdayMerchants[weekday]!.get(merchant) ?? 0) + 1,
    );
  }

  const merchants = [...byMerchant.entries()]
    .map(([merchant, aggregate]): MerchantHabit => {
      const dates = [...new Set(aggregate.dates)].sort();
      const gaps = dates
        .slice(1)
        .map((date, index) => ordinal(date) - ordinal(dates[index]!));
      const gap = gaps.length >= 2 ? median(gaps) : null;
      const first = dates[0] ?? null;
      const last = dates.at(-1) ?? null;
      const highGap = gaps.length >= 2 ? percentile(gaps, 0.75) : 0;
      const daysSinceLast =
        gap === null || last === null ? 0 : ordinal(latest) - ordinal(last);
      const active =
        gap !== null && daysSinceLast <= Math.max(gap * 3, highGap * 2);
      const cycles =
        gap === null || last === null
          ? 0
          : Math.max(
              1,
              Math.ceil((ordinal(asOf ?? latest) - ordinal(last)) / gap),
            );
      const weekdays = Map.groupBy(
        dates,
        (date) => WEEKDAYS[weekdayIndex(date)]!,
      );
      const [favoriteWeekday, favoriteWeekdayCount] = weekdays.size
        ? (dominant(
            new Map(
              [...weekdays].map(([weekday, weekdayDates]) => [
                weekday,
                weekdayDates.length,
              ]),
            ),
          ) as [WeekdayName, number])
        : [null, 0];
      return {
        merchant,
        count: aggregate.count,
        activeDays: dates.length,
        total: fromCents(aggregate.cents),
        average: fromCents(Math.round(aggregate.cents / aggregate.count)),
        first,
        last,
        favoriteWeekday,
        favoriteWeekdayCount,
        weekendVisitCount: dates.filter((date) => weekdayIndex(date) >= 4)
          .length,
        topCategory: dominant(aggregate.categories)[0],
        returnPattern:
          gap === null
            ? null
            : {
                medianDays: gap,
                lowDays: percentile(gaps, 0.25),
                highDays: highGap,
                expectedNext: fromOrdinal(ordinal(last!) + cycles * gap),
                active,
              },
      };
    })
    .sort(
      (a, b) =>
        b.count - a.count ||
        b.total - a.total ||
        a.merchant.localeCompare(b.merchant),
    );

  const weekdays = WEEKDAYS.map((weekday, index): WeekdayHabit => {
    const leaders = weekdayMerchants[index]!;
    const [topMerchant, topMerchantCount] = leaders.size
      ? dominant(leaders)
      : [null, 0];
    return {
      weekday,
      count: weekdayCounts[index]!,
      total: fromCents(weekdayCents[index]!),
      share: visits.length ? weekdayCounts[index]! / visits.length : 0,
      topMerchant,
      topMerchantCount,
    };
  });

  return {
    transactionCount: spending.length,
    merchantCount: merchants.length,
    total: fromCents(
      spending.reduce((sum, txn) => sum + Math.abs(toCents(txn.amount)), 0),
    ),
    merchants,
    topByTransactions: merchants.slice(0, 10),
    topBySpend: [...merchants]
      .sort(
        (a, b) =>
          b.total - a.total ||
          b.count - a.count ||
          a.merchant.localeCompare(b.merchant),
      )
      .slice(0, 10),
    weekdays,
  };
};
