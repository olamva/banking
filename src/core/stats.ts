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

/** The same split, by the account the money left rather than what it was for. */
export type AccountTotal = {
  /** `Txn.account` — what `rules/accounts.json` calls it. */
  account: string;
  total: number;
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
  /** The second level of `categories`, shares within each parent. */
  subcategories: SubcategoryTotal[];
  /** Top 10 by spend. */
  topCounterparties: CounterpartyTotal[];
  subscriptions: Categorized[];
  recurring: Categorized[];
  categoryDeltas: CategoryDelta[];
  /** null when no previous month was supplied. */
  delta: MonthDelta | null;
  excluded: ExcludedSummary;
  /** Spending per account, biggest first. Shares sum to 1, like `categories`. */
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

/** Totals and shares for one grouping, biggest first. The label is the caller's to name. */
function slices(byKey: Map<string, number>): { key: string; total: number; share: number }[] {
  const keys = [...byKey.keys()];
  const cents = keys.map((k) => byKey.get(k)!);
  const shares = allocateShares(cents);
  return keys
    .map((key, i) => ({ key, total: fromCents(cents[i]), share: shares[i] }))
    .sort((a, b) => b.total - a.total);
}

const categoriesFromCents = (byCategory: Map<string, number>): CategoryTotal[] =>
  slices(byCategory).map(({ key, total, share }) => ({ category: key, total, share }));

/**
 * A subcategory's spending, and its share **of its own category** rather than of
 * everything.
 *
 * Within the parent, because that is the number a drill-down is asking for: two
 * thirds of what you spend on eating out went on fastfood is worth reading, and
 * `0.09 of all spending` is the same fact told worse. It also keeps
 * `categories` untouched — its shares still sum to 1 across the page, and
 * nothing that already draws it has to change.
 */
export type SubcategoryTotal = {
  category: string;
  /** null where neither the bank nor a rule named a second level. */
  subcategory: string | null;
  total: number;
  /** Of the parent category, so each parent's subcategories sum to 1. */
  share: number;
};

/** The `/` cannot collide: no bank slug contains one, and `splitCategory` would have split it. */
const SUB_KEY = (category: string, sub: string | null) => `${category}/${sub ?? ''}`;

/**
 * Grouped by parent and shared within it, so every parent's slices sum to 1.
 *
 * Sorted by category total first so a caller can walk it in the same order as
 * `categories` without re-sorting, then by subcategory total inside each.
 */
function subcategoriesFromCents(bySub: Map<string, number>): SubcategoryTotal[] {
  const byParent = new Map<string, Map<string, number>>();
  for (const [key, cents] of bySub) {
    const cut = key.indexOf('/');
    const category = key.slice(0, cut);
    (byParent.get(category) ?? byParent.set(category, new Map()).get(category)!).set(key.slice(cut + 1), cents);
  }
  const out: SubcategoryTotal[] = [];
  for (const [category, subs] of byParent) {
    for (const { key, total, share } of slices(subs)) {
      out.push({ category, subcategory: key === '' ? null : key, total, share });
    }
  }
  const parentTotal = (c: string) => out.reduce((n, x) => n + (x.category === c ? x.total : 0), 0);
  return out.sort(
    (a, b) => parentTotal(b.category) - parentTotal(a.category) || b.total - a.total,
  );
}

const accountsFromCents = (byAccount: Map<string, number>): AccountTotal[] =>
  slices(byAccount).map(({ key, total, share }) => ({ account: key, total, share }));

type CentsAgg = {
  inCents: number;
  outCents: number;
  categoryCents: Map<string, number>;
  subCents: Map<string, number>;
  accountCents: Map<string, number>;
  excludedCount: number;
  excludedCents: number;
};

function aggregateCents(txns: Categorized[]): CentsAgg {
  const agg: CentsAgg = {
    inCents: 0,
    outCents: 0,
    categoryCents: new Map(),
    subCents: new Map(),
    accountCents: new Map(),
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
      const sub = SUB_KEY(t.category, t.subcategory);
      agg.subCents.set(sub, (agg.subCents.get(sub) ?? 0) + spend);
      agg.accountCents.set(t.account, (agg.accountCents.get(t.account) ?? 0) + spend);
    }
  }
  return agg;
}

/**
 * Norway's CPI, year on year, as SSB's annual average change (table 03013),
 * keyed by the **later** year of the pair.
 *
 * One number per year is all this ever needs: `period()` compares every window
 * against the same window a year back — a month against that month last year, a
 * year against the year before — so an adjustment here is always exactly twelve
 * months of it, and the key is always the year in view.
 *
 * The figures are the published annual averages, not a July-to-July index, so
 * they are the right size and not the exact one. Keep it that way — the number
 * this moves is a comparison, and a monthly index would be twelve times the
 * table for a difference no tile can show.
 */
const CPI: Record<string, number> = {
  '2022': 0.058,
  '2023': 0.055,
  '2024': 0.031,
  '2025': 0.03,
  '2026': 0.03,
};

/**
 * The rate used for a year the table does not name — including the current one
 * before SSB has published it, and any year the table falls behind.
 *
 * ponytail: flat 3%; add the year to `CPI` when the real figure lands.
 */
const CPI_DEFAULT = 0.03;

/**
 * The previous window's rows, restated in the money of the year in view, so a
 * delta beside them measures what changed rather than what the krone did.
 *
 * A copy, never a mutation: the caller still holds the real rows, and
 * everything downstream — the tiles, the category deltas, the faint comparison
 * line — reads the same adjusted set, so no two numbers on the page can end up
 * on different money.
 *
 * Only the amount moves. The date stays the date it was, which is what keeps
 * `dailySeries` plotting the comparison window where it actually happened.
 */
export function inflate(txns: Categorized[], year: string): Categorized[] {
  const rate = CPI[year] ?? CPI_DEFAULT;
  // Rounded to the øre, like every other amount that reaches `toCents`.
  return txns.map((t) => ({ ...t, amount: fromCents(Math.round(toCents(t.amount) * (1 + rate))) }));
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
    subcategories: subcategoriesFromCents(agg.subCents),
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
    accounts: accountsFromCents(agg.accountCents),
  };
}

/** Groups by month, ready for `yearStats`. */
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

/**
 * One point on the spending chart. The bucket is whatever the caller grouped
 * by — a day or a month — so `at` is `YYYY-MM-DD` or `YYYY-MM` and the series
 * is the only thing that knows which.
 */
export type SeriesPoint = {
  at: string;
  totalIn: number;
  totalOut: number;
};

const point = (at: string, txns: Categorized[]): SeriesPoint => {
  const agg = aggregateCents(txns);
  return { at, totalIn: fromCents(agg.inCents), totalOut: fromCents(agg.outCents) };
};

/**
 * Every date from `from` to `to`, both ends inclusive.
 *
 * The bound is compared as a string, exactly as `inRange` does, and for the
 * same reason: `period()` hands out `YYYY-MM-31` as a month's upper bound, and
 * no calendar has a 31st of February. Lexically every March date sorts above
 * it, so the walk stops on the real last day of the month without anyone
 * having to know which day that is.
 */
const eachDay = (from: string, to: string): string[] => {
  const out: string[] = [];
  const cursor = new Date(`${from}T00:00:00Z`);
  for (let at = from; at <= to; ) {
    out.push(at);
    cursor.setUTCDate(cursor.getUTCDate() + 1);
    at = cursor.toISOString().slice(0, 10);
  }
  return out;
};

/**
 * One point per calendar day across the whole range, spending or not.
 *
 * Unlike the monthly series this one is **dense, and its holes are zeros**. A
 * month missing from `data/raw/` is an absence — nothing was ever synced for
 * it — but a day inside a synced month with no transactions on it is a real
 * day on which nothing was spent, and drawing that as a gap would claim the
 * record stops every weekend. The range comes from the period rather than from
 * the rows, so a filter narrows the lines without shortening the axis.
 */
export function dailySeries(txns: Categorized[], from: string, to: string): SeriesPoint[] {
  const buckets = new Map<string, Categorized[]>();
  for (const t of txns) {
    const bucket = buckets.get(t.date);
    if (bucket) bucket.push(t);
    else buckets.set(t.date, [t]);
  }
  return eachDay(from, to).map((at) => point(at, buckets.get(at) ?? []));
}

/** One point per month that has rows; `withGaps` puts the missing ones back as holes. */
export function monthlySeries(txns: Categorized[]): SeriesPoint[] {
  return byMonth(txns).map(({ month, txns }) => point(month, txns));
}

/**
 * The series as running totals from its own start.
 *
 * Daily spending is spiky and two thirds of days carry no income at all, so
 * drawn raw the income line sits on the axis most of the week and the band
 * between the two reads as overspending on nearly every day of every month —
 * the band is a statement about a whole period and does not survive being cut
 * into days. Accumulated, both lines are monotonic, the gap between them is
 * the running surplus, and where they cross is the day the period went under.
 *
 * Summed in cents, so a year of additions cannot drift the way repeated
 * float addition of kroner would.
 */
export function cumulative(series: SeriesPoint[]): SeriesPoint[] {
  let inCents = 0;
  let outCents = 0;
  return series.map((p) => {
    inCents += toCents(p.totalIn);
    outCents += toCents(p.totalOut);
    return { at: p.at, totalIn: fromCents(inCents), totalOut: fromCents(outCents) };
  });
}

export type YearStats = {
  year: string;
  /** One entry per input month, sorted ascending — a series ready for charting. */
  months: MonthSummary[];
  categories: CategoryTotal[];
  /** The second level of `categories`, shares within each parent. */
  subcategories: SubcategoryTotal[];
  averageMonth: {
    totalIn: number;
    totalOut: number;
    net: number;
  };
  excluded: ExcludedSummary;
};

/** `2026-08` -> a single sortable number, so month arithmetic needs no Date and no year wrap. */
const monthIndex = (month: string): number => {
  const [y, m] = month.split('-').map(Number);
  return y! * 12 + (m! - 1);
};

/**
 * The series with every calendar month from the first to the last, and `null`
 * where there is no month.
 *
 * `monthlySeries` only emits months that have rows, so a chart drawing that
 * array straight joins May to August as though nothing sat between them — the
 * line slopes across the hole and reads as a real trend. A gap in the record is
 * not a value, and it is not zero either: filling it with 0 would claim a month
 * of no spending. It has to be a hole the chart can see and break across.
 *
 * Months only. The daily series is dense to begin with and its empty days are
 * genuine zeros — see `dailySeries`.
 *
 * Order-independent and Date-free: months are keyed by index and the span is
 * read off the extremes, so an unsorted series cannot spin this.
 */
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

export function yearStats(year: string, monthsTxns: { month: string; txns: Categorized[] }[]): YearStats {
  const sorted = [...monthsTxns].sort((a, b) => a.month.localeCompare(b.month));

  const months: MonthSummary[] = sorted.map(({ month, txns }) => {
    const agg = aggregateCents(txns);
    return {
      month,
      totalIn: fromCents(agg.inCents),
      totalOut: fromCents(agg.outCents),
      net: fromCents(agg.inCents - agg.outCents),
      excluded: { count: agg.excludedCount, total: fromCents(agg.excludedCents) },
    };
  });

  const agg = aggregateCents(sorted.flatMap((m) => m.txns));
  const n = months.length || 1;

  return {
    year,
    months,
    categories: categoriesFromCents(agg.categoryCents),
    subcategories: subcategoriesFromCents(agg.subCents),
    averageMonth: {
      totalIn: fromCents(Math.round(agg.inCents / n)),
      totalOut: fromCents(Math.round(agg.outCents / n)),
      net: fromCents(Math.round((agg.inCents - agg.outCents) / n)),
    },
    excluded: { count: agg.excludedCount, total: fromCents(agg.excludedCents) },
  };
}

/**
 * The dashboard shows subscriptions and recurring rows as one list, and the two
 * overlap. Deduplicated on `id`, the database's own key.
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
 * What is subscribed to, one line each — not one line per charge.
 *
 * Takes **every** row in view, not only the flagged ones, and keeps the payees
 * that carry at least one flag. The flag is per row and the bank sets it
 * unevenly: it marked one of twelve identical monthly rent payments, so a
 * standing 6 100 kr/month read as a single 6 000 kr charge in June 2024 while
 * the transactions table right below it showed all twelve. A subscription is a
 * property of the payee, not of the individual charge — one flag anywhere is
 * the bank telling us this payee recurs, and the rest of its rows are the same
 * subscription whether or not the flag stuck to them.
 *
 * On the real data that promotes 15 rows across 36 payees, and nothing runs
 * away with it: the bank's wrong guesses land on payees seen once or twice, so
 * no everyday merchant is dragged in by a single stray flag.
 *
 * The category is the latest row's, because a recategorised subscription is
 * that category now; the old rows are history, not a second opinion. Everything
 * booked on that same date counts as one payment, so a charge split over two
 * rows is one price and a same-day refund comes off it.
 */
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
