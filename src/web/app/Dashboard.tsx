import {
  Fragment,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react";
import {
  AXES,
  axisBounds,
  groupsOf,
  inRange,
  itemSpend,
  keepsItemsOnly,
  matchesFilters,
  type Axis,
  type Filters,
  type Period,
} from "../../core/select.ts";
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
  type ExcludedSummary,
  type SeriesPoint,
  type SubscriptionGroup,
} from "../../core/stats.ts";
import { plural } from "../../core/plural.ts";
import type { Categorized } from "../../core/types.ts";
import { InfoTip, NoMatches, Panel, StatTile, deltaInfo } from "./Cards.tsx";
import { DivergingBars, HorizontalBars } from "./Charts.tsx";
import {
  GRAIN_LABEL,
  GRAIN_SUFFIX,
  GROUP_LABEL,
  chartSubject,
  useChartGroup,
} from "./chartGroup.ts";
import { mapRules, type RulesApi } from "./data.ts";
import { Items } from "./Items.tsx";
import { SpendLines } from "./SpendLines.tsx";
import type { Bucket } from "./axis.ts";
import { SubscriptionsCard } from "./Transactions.tsx";
import { categoryLabel, fmtNOK, perMonth, subcategoryLabel } from "./format.ts";
import {
  CategoryIcon,
  ChangesIcon,
  CounterpartyIcon,
  MonthlyIcon,
  RefundIcon,
} from "./icons.ts";
import { ChoiceToggle } from "./ChoiceToggle.tsx";
import type { Grain } from "./url.ts";

const CARD_GRID =
  "grid grid-cols-[repeat(auto-fit,minmax(min(420px,100%),1fr))] gap-x-10 gap-y-8 [&>*:last-child:nth-child(odd)]:col-span-full";

const CARD_GRID_3 =
  "grid grid-cols-[repeat(auto-fit,minmax(min(300px,100%),1fr))] gap-x-10 gap-y-8 [&>*:last-child:nth-child(3n+1)]:col-span-full";

interface ExcludedInfoProps {
  excluded: ExcludedSummary;
  shown: boolean;
}

export const ExcludedInfo = ({ excluded, shown }: ExcludedInfoProps) =>
  shown || excluded.count === 0 ? null : (
    <InfoTip label="About internal transfers" className="-my-1">
      {plural(excluded.count, "transaction")} for {fmtNOK(excluded.total)} in
      this period are internal transfers or card bill payments. They are not
      counted. Turn on Show internal transfers in Filter to see them.
    </InfoTip>
  );

type SetFilters = Dispatch<SetStateAction<Filters>>;

export const pick =
  (onFilters: SetFilters, key: Axis) =>
  (value: string, exclude = false) =>
    onFilters((f) => {
      const outKey = AXES[key];
      const values: string[] = f[key];
      const out: string[] = f[outKey];
      const without = (list: string[]) => list.filter((v) => v !== value);

      if (exclude)
        return {
          ...f,
          [key]: without(values),
          [outKey]: out.includes(value) ? without(out) : [...out, value],
        };
      const only = values.length === 1 && values[0] === value;
      return { ...f, [key]: only ? [] : [value], [outKey]: without(out) };
    });

const slugsByLabel = (slugs: string[]) =>
  new Map(slugs.map((s) => [categoryLabel(s), s]));

type Stats = ReturnType<typeof monthStats>;

interface TotalsProps {
  stats: Stats;
  prev: Stats;
  yearly: ReturnType<typeof yearStats> | null;
  vsLabel?: string;
  info?: ReactNode;
}

// Spent and Income each hide when that side of the period is empty. Net needs
// both sides, or it only repeats the one tile above it.
const TILES = [
  ["totalOut", "Spent", false],
  ["totalIn", "Income", true],
  ["net", "Net", true],
] as const;

const tileSub = (
  key: (typeof TILES)[number][0],
  stats: Stats,
  yearly: TotalsProps["yearly"],
) =>
  [
    key === "totalOut" && stats.refunded > 0
      ? `after ${fmtNOK(stats.refunded)} refunded`
      : "",
    yearly ? perMonth(yearly.averageMonth[key]) : "",
  ]
    .filter(Boolean)
    .join(" · ") || undefined;

const Totals = ({ stats, prev, yearly, vsLabel, info }: TotalsProps) => (
  <div className="mb-8 grid grid-cols-[repeat(auto-fit,minmax(min(150px,100%),1fr))] gap-x-10 gap-y-5 max-sm:grid-cols-2 max-sm:[&>*:last-child:nth-child(odd)]:col-span-full">
    {TILES.map(([key, label, goodIfUp]) =>
      (
        key === "net"
          ? stats.totalIn > 0 && stats.totalOut !== 0
          : stats[key] !== 0
      )
        ? [
            <StatTile
              key={key}
              label={label}
              value={fmtNOK(stats[key])}
              sub={tileSub(key, stats, yearly)}
              info={key === "totalOut" && info}
              vs={vsLabel}
              delta={
                vsLabel ? deltaInfo(stats[key], prev[key], goodIfUp) : undefined
              }
            />,
          ]
        : [],
    )}
  </div>
);

interface BreakdownsProps {
  stats: Stats;
  groups: SubscriptionGroup[];
  onFilters: SetFilters;
  single: boolean;
  grid: string;
  vsLabel?: string;
  minBars: number;
}

const Breakdowns = ({
  stats,
  groups,
  onFilters,
  single,
  grid,
  vsLabel,
  minBars,
}: BreakdownsProps) => {
  const catBars = (
    categories: Stats["categories"],
    subcategories: Stats["subcategories"],
  ) =>
    categories.map((c) => {
      const subs = subcategories
        .filter((sub) => sub.category === c.category)
        .map((sub) => ({
          key: `${sub.category}/${sub.subcategory ?? ""}`,
          label: subcategoryLabel(sub.category, sub.subcategory),
          total: sub.total,
        }));
      const lone =
        subs.length === 1 && subs[0]!.key.split("/")[1] !== ""
          ? subs[0]!
          : null;
      return {
        key: lone?.key ?? c.category,
        label: lone?.label ?? categoryLabel(c.category),
        total: c.total,
        subs,
      };
    });
  const cpBars = (list: Stats["topCounterparties"]) =>
    list.map((c) => ({
      label: c.counterparty,
      total: c.total,
      count: c.count,
    }));
  const cats = catBars(stats.categories, stats.subcategories);
  const cps = cpBars(stats.topCounterparties);
  const inCats = catBars(stats.incomeCategories, stats.incomeSubcategories);
  const inCps = cpBars(stats.topIncomeCounterparties);
  const refunds = cpBars(stats.topRefundCounterparties);
  const deltas = visibleDeltas(stats.categoryDeltas).map((d) => ({
    ...d,
    category: categoryLabel(d.category),
  }));

  const slugOf = slugsByLabel([
    ...stats.categories.map((c) => c.category),
    ...stats.categoryDeltas.map((d) => d.category),
  ]);
  const onCategory = (slugOrLabel: string, meta: boolean) =>
    pick(onFilters, "categories")(slugOf.get(slugOrLabel) ?? slugOrLabel, meta);
  const onSubcategory = pick(onFilters, "categories");
  const onMerchant = pick(onFilters, "merchants");

  const sides = [
    { tone: "spend", side: "Spending", cats, cps },
    { tone: "income", side: "Income", cats: inCats, cps: inCps },
  ] as const;

  return (
    <>
      <div className={grid}>
        {sides.map(({ tone, side, cats, cps }) => (
          // A fragment adds no DOM child, so the grid still counts the cards.
          <Fragment key={tone}>
            {!single &&
              (cats.length >= minBars ||
                (cats[0]?.subs.length ?? 0) >= minBars) && (
                <Panel title={`${side} by category`} icon={CategoryIcon}>
                  <HorizontalBars
                    items={cats}
                    onPick={onCategory}
                    onPickSub={onSubcategory}
                    tone={tone}
                  />
                </Panel>
              )}

            {tone === "spend" && !single && deltas.length >= minBars && (
              <Panel title={`Biggest changes vs ${vsLabel}`} icon={ChangesIcon}>
                <DivergingBars deltas={deltas} onPick={onCategory} />
              </Panel>
            )}

            {cps.length >= minBars && (
              <Panel title={`${side} by merchant`} icon={CounterpartyIcon}>
                <HorizontalBars items={cps} onPick={onMerchant} tone={tone} />
              </Panel>
            )}

            {tone === "spend" && refunds.length > 0 && (
              <Panel
                title="Refunds by merchant"
                icon={RefundIcon}
                description="Money back that lowers spending in its category."
              >
                <HorizontalBars
                  items={refunds}
                  onPick={onMerchant}
                  tone="income"
                />
              </Panel>
            )}
          </Fragment>
        ))}
      </div>

      {groups.length > 0 && (
        <div className="mt-8">
          <SubscriptionsCard
            groups={groups}
            onMerchant={onMerchant}
            onCategory={pick(onFilters, "categories")}
          />
        </div>
      )}
    </>
  );
};

const alignTo = (series: SeriesPoint[], compare: SeriesPoint[], p: Period) =>
  p.kind === "recent"
    ? compare.map((c, i) => ({ ...c, at: series[i]?.at ?? c.at }))
    : compare;

const chartBounds = (
  shown: Categorized[],
  all: Categorized[],
  f: Filters,
  p: Period,
  compared: boolean,
) => {
  if (f.countries.length !== 1 || compared) return axisBounds(all, p);
  const dates = shown.map((t) => t.date).sort();
  return { from: dates[0]!, to: dates.at(-1)! };
};

const oneCategory = (f: Filters) => f.categories.length === 1 && !f.or.length;

const sparse = (rows: Categorized[]) =>
  rows.length * 12 < withGaps(monthlySeries(rows)).length;

const timeline = (points: unknown[], rows: Categorized[]) =>
  points.length > 1 && !sparse(rows);

const minBarsOf = (f: Filters) =>
  keepsItemsOnly(f) ||
  f.accounts.length > 0 ||
  (f.or.length > 0 && groupsOf(f).every((g) => g.merchants.length > 0))
    ? 2
    : 1;

interface DashboardProps {
  txns: Categorized[];
  all: Categorized[];
  filters: Filters;
  onFilters: SetFilters;
  rules: RulesApi;
  period: Period;
  onPeriod: (period: string) => void;
  grain: Grain;
  offered: Grain[];
  onGrain: (grain: Grain) => void;
}

export const Dashboard = ({
  txns,
  all,
  filters,
  onFilters,
  rules,
  period: p,
  onPeriod,
  grain,
  offered,
  onGrain,
}: DashboardProps) => {
  const names = mapRules(rules, "items");
  const kinds = mapRules(rules, "item-categories");
  const matching = (rows: Categorized[]) => {
    const kept = rows.filter((t) => matchesFilters(t, filters));
    return keepsItemsOnly(filters)
      ? itemSpend(kept, filters, names, kinds)
      : kept;
  };
  const shown = matching(all);
  const { by, offered: groupsOffered, top, setGroup } = useChartGroup(shown);

  if (shown.length === 0)
    return <NoMatches elsewhere={matching(txns)} onPeriod={onPeriod} />;

  const previous = p.prev
    ? matching(txns.filter((t) => inRange(t, p.prev!.from, p.prev!.to)))
    : [];
  const vs = previous.length > 0 ? p.prev : null;

  const stats = monthStats(p.label, shown, vs ? previous : undefined);
  const prev = monthStats("previous", previous);

  const months = byMonth(shown);
  const yearly = timeline(months, shown) ? yearStats(p.label, months) : null;

  const running = grain === "running";
  const bucket: Bucket = grain === "month" ? "month" : "day";

  const { from, to } = chartBounds(shown, all, filters, p, vs !== null);

  const build = (rows: Categorized[], a: string, b: string) => {
    const raw =
      bucket === "day" ? dailySeries(rows, a, b) : monthlySeries(rows);
    return running ? cumulative(raw) : raw;
  };

  const series = build(shown, from, to);
  const compare = vs ? alignTo(series, build(previous, vs.from, vs.to), p) : [];

  const single = oneCategory(filters);

  const anyIncome = series.some((s) => s.totalIn > 0);
  const anySpend = series.some((s) => s.totalOut > 0);

  const groups = top.map((g) => ({
    name: g.name,
    series: build(g.txns, from, to),
  }));

  const marks =
    by === "total"
      ? {
          income: anyIncome,
          spend: anySpend,
          band: running || bucket === "month",
          trend: !running && anySpend,
          compare,
        }
      : { income: false, spend: false, band: false, trend: false, compare: [] };

  const byItem = keepsItemsOnly(filters);
  const items = (
    <Items
      rows={all}
      filters={filters}
      rules={rules}
      onFilters={onFilters}
      grid={CARD_GRID}
      className="my-10"
    />
  );

  return (
    <>
      <Totals
        stats={stats}
        prev={prev}
        yearly={yearly}
        vsLabel={vs?.label}
        info={
          <ExcludedInfo
            excluded={totals(all).excluded}
            shown={filters.showExcluded}
          />
        }
      />

      {timeline(series, shown) && (
        <div className="mb-8">
          <Panel
            title={`${chartSubject(by, anyIncome, anySpend)}${GRAIN_SUFFIX[grain]}`}
            icon={MonthlyIcon}
            action={
              <div className="flex flex-wrap justify-end gap-2">
                <ChoiceToggle
                  value={by}
                  offered={groupsOffered}
                  labels={GROUP_LABEL}
                  name="Group the chart by"
                  onChange={setGroup}
                />
                <ChoiceToggle
                  value={grain}
                  offered={offered}
                  labels={GRAIN_LABEL}
                  name="Chart grain"
                  onChange={onGrain}
                />
              </div>
            }
          >
            <SpendLines
              series={series}
              bucket={bucket}
              {...marks}
              compareLabel={vs?.label}
              groups={groups}
            />
          </Panel>
        </div>
      )}

      {byItem && items}

      <Breakdowns
        stats={stats}
        groups={subscriptionGroups(shown)}
        onFilters={onFilters}
        single={single}
        grid={p.kind === "all" ? CARD_GRID_3 : CARD_GRID}
        vsLabel={vs?.label}
        minBars={minBarsOf(filters)}
      />

      {!byItem && items}
    </>
  );
};
