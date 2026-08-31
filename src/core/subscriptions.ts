import { merchantOf } from "./select.ts";
import type { Categorized } from "./types.ts";
import type { MonthStats } from "./stats.ts";

const toCents = (amount: number) => Math.round(amount * 100);
const fromCents = (cents: number) => cents / 100;
const byDate = (a: Categorized, b: Categorized) => a.date.localeCompare(b.date);

export type SubscriptionGroup = {
  name: string;
  category: string;
  count: number;
  total: number;
  // NOK charged on `last`, not the average. This is the current price.
  // ponytail: assumes a monthly price. A yearly bill shows its yearly amount.
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
