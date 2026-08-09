/**
 * Pure aggregation over `Categorized[]` — no I/O, no database import, no
 * network. Everything here is exported types the dashboard builds against
 * directly: keep the shape flat and treat it as a contract.
 *
 * This is the *only* implementation of the money aggregation. The React app
 * imports this module and Vite bundles it, so the browser re-filters with the
 * exact code `node --test` pins rather than a hand-synced copy that drifts the
 * first time a rule changes. Keep it free of `node:` imports for that reason.
 */
import { merchantOf } from './select.ts';
import type { Categorized } from './types.ts';

export type CategoryTotal = {
  category: string;
  /** NOK, magnitude spent (never negative). */
  total: number;
  /** 0-1. Every category's share in one aggregate sums to 1 (or 0 if nothing was spent). */
  share: number;
};

export type CounterpartyTotal = {
  counterparty: string;
  /** NOK, magnitude spent. */
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
  /** NOK, sum of |amount| across excluded rows — not netted, so a matched transfer pair still shows the volume that moved. */
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
  /** Top 10 by spend. Card rows have no counterparty and are never in this list. */
  topCounterparties: CounterpartyTotal[];
  subscriptions: Categorized[];
  recurring: Categorized[];
  categoryDeltas: CategoryDelta[];
  /** null when no previous month was supplied. */
  delta: MonthDelta | null;
  excluded: ExcludedSummary;
  /** 0-1 share of totalOut that came from card rows — the blind spot, surfaced rather than buried in `categories`. */
  cardShare: number;
};

export type MonthSummary = {
  month: string;
  totalIn: number;
  totalOut: number;
  net: number;
  cardShare: number;
  excluded: ExcludedSummary;
};

export type YearStats = {
  year: string;
  /** One entry per input month, sorted ascending — a series ready for charting. */
  months: MonthSummary[];
  categories: CategoryTotal[];
  averageMonth: {
    totalIn: number;
    totalOut: number;
    net: number;
  };
  excluded: ExcludedSummary;
  cardShare: number;
};

const toCents = (amount: number) => Math.round(amount * 100);
const fromCents = (cents: number) => cents / 100;
const round4 = (n: number) => Math.round(n * 10000) / 10000;
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

function categoriesFromCents(byCategory: Map<string, number>): CategoryTotal[] {
  const categories = [...byCategory.keys()];
  const cents = categories.map((c) => byCategory.get(c)!);
  const shares = allocateShares(cents);
  return categories
    .map((category, i) => ({ category, total: fromCents(cents[i]), share: shares[i] }))
    .sort((a, b) => b.total - a.total);
}

type CentsAgg = {
  inCents: number;
  outCents: number;
  cardCents: number;
  categoryCents: Map<string, number>;
  excludedCount: number;
  excludedCents: number;
};

function aggregateCents(txns: Categorized[]): CentsAgg {
  const agg: CentsAgg = {
    inCents: 0,
    outCents: 0,
    cardCents: 0,
    categoryCents: new Map(),
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
    if (cents > 0) agg.inCents += cents;
    if (cents < 0) {
      const spend = -cents;
      agg.outCents += spend;
      agg.categoryCents.set(t.category, (agg.categoryCents.get(t.category) ?? 0) + spend);
      if (t.source === 'card') agg.cardCents += spend;
    }
  }
  return agg;
}

export type Totals = {
  totalIn: number;
  totalOut: number;
  net: number;
  excluded: ExcludedSummary;
};

/**
 * What a set of rows adds up to, and nothing else. `monthStats` carries the same
 * four numbers, but building one to read them sorts categories and
 * counterparties nobody asked for — and a date range has no month to name.
 */
export function totals(txns: Categorized[]): Totals {
  const agg = aggregateCents(txns);
  return {
    totalIn: fromCents(agg.inCents),
    totalOut: fromCents(agg.outCents),
    net: fromCents(agg.inCents - agg.outCents),
    excluded: { count: agg.excludedCount, total: fromCents(agg.excludedCents) },
  };
}

function topCounterparties(txns: Categorized[], limit = 10): CounterpartyTotal[] {
  const byCp = new Map<string, { cents: number; count: number }>();
  for (const t of txns) {
    if (t.excluded || t.amount >= 0 || t.counterparty === null) continue;
    const entry = byCp.get(t.counterparty) ?? { cents: 0, count: 0 };
    entry.cents += -toCents(t.amount);
    entry.count++;
    byCp.set(t.counterparty, entry);
  }
  return [...byCp.entries()]
    .map(([counterparty, { cents, count }]) => ({ counterparty, total: fromCents(cents), count }))
    .sort((a, b) => b.total - a.total)
    .slice(0, limit);
}

export function monthStats(month: string, txns: Categorized[], previous?: Categorized[]): MonthStats {
  const agg = aggregateCents(txns);
  const prevAgg = previous ? aggregateCents(previous) : null;

  const categoryDeltas: CategoryDelta[] = [];
  if (prevAgg) {
    const names = new Set([...agg.categoryCents.keys(), ...prevAgg.categoryCents.keys()]);
    for (const category of names) {
      const current = fromCents(agg.categoryCents.get(category) ?? 0);
      const prev = fromCents(prevAgg.categoryCents.get(category) ?? 0);
      categoryDeltas.push({ category, current, previous: prev, delta: current - prev });
    }
    categoryDeltas.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
  }

  return {
    month,
    totalIn: fromCents(agg.inCents),
    totalOut: fromCents(agg.outCents),
    net: fromCents(agg.inCents - agg.outCents),
    categories: categoriesFromCents(agg.categoryCents),
    topCounterparties: topCounterparties(txns),
    subscriptions: txns.filter((t) => !t.excluded && t.isSubscription).sort(byDate),
    recurring: txns.filter((t) => !t.excluded && t.isRecurring).sort(byDate),
    categoryDeltas,
    delta: prevAgg
      ? {
          totalIn: fromCents(agg.inCents - prevAgg.inCents),
          totalOut: fromCents(agg.outCents - prevAgg.outCents),
          net: fromCents(agg.inCents - agg.outCents - (prevAgg.inCents - prevAgg.outCents)),
        }
      : null,
    excluded: { count: agg.excludedCount, total: fromCents(agg.excludedCents) },
    cardShare: agg.outCents > 0 ? round4(agg.cardCents / agg.outCents) : 0,
  };
}

/**
 * Spending that still has no merchant — card rows from a month no statement
 * export covers. Reported rather than assumed: the card bucket stopped being
 * wholly opaque when the export landed, so "amount and date only" is now a
 * claim that has to be checked against the rows in hand.
 */
export function blindSpot(txns: Categorized[]): ExcludedSummary {
  let count = 0;
  let cents = 0;
  for (const t of txns) {
    if (t.excluded || t.amount >= 0 || t.counterparty !== null) continue;
    count++;
    cents += -toCents(t.amount);
  }
  return { count, total: fromCents(cents) };
}

/** Groups by booking month, ready for `yearStats`. */
export function byMonth(txns: Categorized[]): { month: string; txns: Categorized[] }[] {
  const buckets = new Map<string, Categorized[]>();
  for (const t of txns) {
    const month = t.date.slice(0, 7);
    const bucket = buckets.get(month);
    if (bucket) bucket.push(t);
    else buckets.set(month, [t]);
  }
  return [...buckets.entries()].sort().map(([month, txns]) => ({ month, txns }));
}

export function yearStats(year: string, monthsTxns: { month: string; txns: Categorized[] }[]): YearStats {
  const sorted = [...monthsTxns].sort((a, b) => a.month.localeCompare(b.month));

  const months: MonthSummary[] = sorted.map(({ month, txns }) => {
    const agg = aggregateCents(txns);
    return {
      month,
      totalIn: fromCents(agg.inCents),
      totalOut: fromCents(agg.outCents),
      net: fromCents(agg.inCents - agg.outCents),
      cardShare: agg.outCents > 0 ? round4(agg.cardCents / agg.outCents) : 0,
      excluded: { count: agg.excludedCount, total: fromCents(agg.excludedCents) },
    };
  });

  const agg = aggregateCents(sorted.flatMap((m) => m.txns));
  const n = months.length || 1;

  return {
    year,
    months,
    categories: categoriesFromCents(agg.categoryCents),
    averageMonth: {
      totalIn: fromCents(Math.round(agg.inCents / n)),
      totalOut: fromCents(Math.round(agg.outCents / n)),
      net: fromCents(Math.round((agg.inCents - agg.outCents) / n)),
    },
    excluded: { count: agg.excludedCount, total: fromCents(agg.excludedCents) },
    cardShare: agg.outCents > 0 ? round4(agg.cardCents / agg.outCents) : 0,
  };
}

/**
 * The dashboard shows subscriptions and recurring rows as one list, and the two
 * overlap. Deduplicated on `(source, id)`, the database's own key.
 */
export type SubscriptionGroup = {
  /** `merchantOf` — the same string the tables and the bars offer as a filter. */
  name: string;
  category: string;
  count: number;
  /** NOK, magnitude spent across the group. A refund inside it nets off. */
  total: number;
  /**
   * NOK charged on `last` — what it costs a month, on the assumption that the
   * last payment is the current price and that the price is monthly.
   *
   * The first half is the point: an old price averaged in tells you what the
   * subscription *has* cost, and the question a subscription list answers is
   * what it costs now. The second half is where it can be wrong — a yearly bill
   * reads as its yearly amount, and nothing on the row says otherwise. Dividing
   * by an inferred cadence needs more than one charge to infer from, which the
   * new subscriptions that most want checking are exactly the ones without.
   */
  latest: number;
  /** Latest booking date in the group — how long since it last took anything. */
  last: string;
};

/**
 * A subscription is one thing charging monthly, not eleven unrelated rows that
 * happen to share a name — so the card lists what is subscribed to, and the
 * charges are what each line adds up from.
 *
 * The category is the latest row's, because a recategorised subscription is
 * that category now; the old rows are history, not a second opinion. Everything
 * booked on that same date counts as one payment, so a charge split over two
 * rows is one price and a same-day refund comes off it.
 */
export function subscriptionGroups(txns: Categorized[]): SubscriptionGroup[] {
  type Acc = { cents: number; latestCents: number; count: number; last: string; category: string };
  const byName = new Map<string, Acc>();
  for (const t of txns) {
    const name = merchantOf(t);
    const cents = -toCents(t.amount);
    const group = byName.get(name) ?? { cents: 0, latestCents: 0, count: 0, last: t.date, category: t.category };
    group.cents += cents;
    group.count++;
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
      const key = `${t.source}:${t.id}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort(byDate);
}
