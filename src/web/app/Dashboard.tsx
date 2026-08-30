import { type Dispatch, type SetStateAction } from "react";
import {
  AXES,
  axisBounds,
  inRange,
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
  yearStats,
  type ExcludedSummary,
  type SubscriptionGroup,
} from "../../core/stats.ts";
import type { Categorized } from "../../core/types.ts";
import { Card, StatTile, deltaInfo } from "./Cards.tsx";
import {
  DivergingBars,
  HorizontalBars,
  visibleDeltas,
  type BarItem,
} from "./Charts.tsx";
import { SpendLines, type Bucket } from "./SpendLines.tsx";
import { SubscriptionsCard } from "./Transactions.tsx";
import { categoryLabel, fmtNOK, subcategoryLabel } from "./format.ts";
import {
  AccountIcon,
  CategoryIcon,
  ChangesIcon,
  CounterpartyIcon,
  Icon,
  InfoIcon,
  MonthlyIcon,
} from "./icons.ts";
import type { Grain } from "./url.ts";

const CARD_GRID =
  "grid grid-cols-[repeat(auto-fit,minmax(min(460px,100%),1fr))] gap-4 [&>*:last-child:nth-child(odd)]:col-span-full";

const CARD_GRID_3 =
  "grid grid-cols-[repeat(auto-fit,minmax(min(300px,100%),1fr))] gap-4 [&>*:last-child:nth-child(3n+1)]:col-span-full";

interface ExcludedNoteProps {
  excluded: ExcludedSummary;
  where: string;
}

export const ExcludedNote = ({ excluded, where }: ExcludedNoteProps) =>
  excluded.count === 0 ? null : (
    <div className="mt-3 flex items-start gap-1.5 text-[11px] text-ink-muted">
      <Icon aria-hidden icon={InfoIcon} size={13} className="mt-px shrink-0" />
      <span>
        {excluded.count} transaction(s) totalling {fmtNOK(excluded.total)}{" "}
        excluded {where} (internal transfers, card bill payments).
      </span>
    </div>
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

const GRAIN_LABEL: Record<Grain, string> = {
  running: "Running total",
  day: "Per day",
  month: "Per month",
};

interface GrainToggleProps {
  grain: Grain;
  offered: Grain[];
  onGrain: (grain: Grain) => void;
}

const GrainToggle = ({ grain, offered, onGrain }: GrainToggleProps) =>
  offered.length < 2 ? null : (
    <span className="inline-flex overflow-hidden rounded-md border border-line">
      {offered.map((g) => (
        <button
          key={g}
          type="button"
          aria-pressed={grain === g}
          onClick={() => onGrain(g)}
          className={`px-2 py-1 text-[11px] ${grain === g ? "bg-series-1 text-white" : "bg-page text-ink-soft"}`}
        >
          {GRAIN_LABEL[g]}
        </button>
      ))}
    </span>
  );

type Stats = ReturnType<typeof monthStats>;

interface TotalsProps {
  stats: Stats;
  prev: Stats;
  yearly: ReturnType<typeof yearStats> | null;
  vsLabel?: string;
}

const Totals = ({ stats, prev, yearly, vsLabel }: TotalsProps) => (
  <div className="mb-4 grid grid-cols-[repeat(auto-fit,minmax(min(160px,100%),1fr))] gap-3">
    {stats.totalOut > 0 && (
      <StatTile
        label="Spent"
        value={fmtNOK(stats.totalOut)}
        sub={
          yearly ? `${fmtNOK(yearly.averageMonth.totalOut)} / month` : undefined
        }
        vs={vsLabel}
        delta={
          vsLabel ? deltaInfo(stats.totalOut, prev.totalOut, false) : undefined
        }
      />
    )}
    {stats.totalIn > 0 && (
      <StatTile
        label="Income"
        value={fmtNOK(stats.totalIn)}
        sub={
          yearly ? `${fmtNOK(yearly.averageMonth.totalIn)} / month` : undefined
        }
        vs={vsLabel}
        delta={
          vsLabel ? deltaInfo(stats.totalIn, prev.totalIn, true) : undefined
        }
      />
    )}
    {stats.totalIn > 0 && stats.totalOut > 0 && (
      <StatTile
        label="Net"
        value={fmtNOK(stats.net)}
        sub={yearly ? `${fmtNOK(yearly.averageMonth.net)} / month` : undefined}
        vs={vsLabel}
        delta={vsLabel ? deltaInfo(stats.net, prev.net, true) : undefined}
      />
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
}

const Breakdowns = ({
  stats,
  groups,
  onFilters,
  single,
  grid,
  vsLabel,
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
  const acctBars = (list: Stats["accounts"]): BarItem[] =>
    list.map((a) => ({ label: a.account, total: a.total }));

  const cats = catBars(stats.categories, stats.subcategories);
  const cps = cpBars(stats.topCounterparties);
  const inCats = catBars(stats.incomeCategories, stats.incomeSubcategories);
  const inCps = cpBars(stats.topIncomeCounterparties);
  const accounts = acctBars(stats.accounts);
  const inAccounts = acctBars(stats.incomeAccounts);
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
  const onAccount = pick(onFilters, "accounts");

  return (
    <>
      <div className={grid}>
        {/* Three breakdowns per direction, named the same way on both sides:
            "<direction> by <axis>". The income half hides itself period by
            period, on exactly the same emptiness rules as the spending half. */}
        {!single && cats.length > 0 && (
          <Card title="Spending by category" icon={CategoryIcon}>
            <HorizontalBars
              items={cats}
              onPick={onCategory}
              onPickSub={onSubcategory}
              tone="spend"
            />
          </Card>
        )}

        {!single && deltas.length > 0 && (
          <Card title={`Biggest changes vs ${vsLabel}`} icon={ChangesIcon}>
            <DivergingBars deltas={deltas} onPick={onCategory} />
          </Card>
        )}

        {cps.length > 0 && (
          <Card title="Spending by merchant" icon={CounterpartyIcon}>
            <HorizontalBars items={cps} onPick={onMerchant} tone="spend" />
          </Card>
        )}

        {accounts.length > 1 && (
          <Card title="Spending by account" icon={AccountIcon}>
            <HorizontalBars items={accounts} onPick={onAccount} tone="spend" />
          </Card>
        )}

        {!single && inCats.length > 0 && (
          <Card title="Income by category" icon={CategoryIcon}>
            <HorizontalBars
              items={inCats}
              onPick={onCategory}
              onPickSub={onSubcategory}
              tone="income"
            />
          </Card>
        )}

        {inCps.length > 0 && (
          <Card title="Income by merchant" icon={CounterpartyIcon}>
            <HorizontalBars items={inCps} onPick={onMerchant} tone="income" />
          </Card>
        )}

        {inAccounts.length > 1 && (
          <Card title="Income by account" icon={AccountIcon}>
            <HorizontalBars
              items={inAccounts}
              onPick={onAccount}
              tone="income"
            />
          </Card>
        )}
      </div>

      {groups.length > 0 && (
        <div className="mt-4">
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

interface DashboardProps {
  txns: Categorized[];
  all: Categorized[];
  filters: Filters;
  onFilters: SetFilters;
  period: Period;
  grain: Grain;
  offered: Grain[];
  onGrain: (grain: Grain) => void;
}

export const Dashboard = ({
  txns,
  all,
  filters,
  onFilters,
  period: p,
  grain,
  offered,
  onGrain,
}: DashboardProps) => {
  // `all` is the period. `txns` is the record, and only the comparison period
  // needs it, because that period sits outside this one.
  const shown = all.filter((t) => matchesFilters(t, filters));

  if (shown.length === 0)
    return (
      <>
        <div className="py-10 text-center text-ink-muted">
          No transactions match the current filters.
        </div>
        <ExcludedNote excluded={totals(all).excluded} where="in this period" />
      </>
    );

  const vs =
    p.prev && txns.some((t) => inRange(t, p.prev!.from, p.prev!.to))
      ? p.prev
      : null;

  const previous = vs
    ? txns
        .filter((t) => inRange(t, vs.from, vs.to))
        .filter((t) => matchesFilters(t, filters))
    : [];

  const stats = monthStats(p.label, shown, vs ? previous : undefined);
  const prev = monthStats("previous", previous);

  const months = byMonth(shown);
  const yearly = months.length > 1 ? yearStats(p.label, months) : null;

  const running = grain === "running";
  const bucket: Bucket = grain === "month" ? "month" : "day";

  const { from, to } = axisBounds(all, p);

  const build = (rows: Categorized[], a: string, b: string) => {
    const raw =
      bucket === "day" ? dailySeries(rows, a, b) : monthlySeries(rows);
    return running ? cumulative(raw) : raw;
  };

  const series = build(shown, from, to);
  const compare = vs ? build(previous, vs.from, vs.to) : [];

  const single = filters.categories.length === 1;

  const anyIncome = series.some((s) => s.totalIn > 0);
  const anySpend = series.some((s) => s.totalOut > 0);

  const band = running || bucket === "month";

  return (
    <>
      <Totals stats={stats} prev={prev} yearly={yearly} vsLabel={vs?.label} />

      {/* Outside the grid, not a `col-span-full` inside it. `nth-child` counts
          DOM children, but a full-width card owns a whole row on its own — so
          one sitting in the grid shifts what "odd" means for everything after
          it, and the last card is left alone in half a row exactly when the
          rule below exists to prevent that. */}
      {series.length > 1 && (
        <div className="mb-4">
          <Card
            title={`${anyIncome ? (anySpend ? "Income & spend" : "Income") : "Spending"}${
              running
                ? ", running total"
                : grain === "day"
                  ? " by day"
                  : " by month"
            }`}
            icon={MonthlyIcon}
            action={
              <GrainToggle grain={grain} offered={offered} onGrain={onGrain} />
            }
          >
            <SpendLines
              series={series}
              bucket={bucket}
              income={anyIncome}
              spend={anySpend}
              band={band}
              trend={!running && anySpend}
              compare={compare}
              compareLabel={vs?.label}
            />
          </Card>
        </div>
      )}

      <Breakdowns
        stats={stats}
        groups={subscriptionGroups(shown)}
        onFilters={onFilters}
        single={single}
        grid={p.kind === "all" ? CARD_GRID_3 : CARD_GRID}
        vsLabel={vs?.label}
      />

      <ExcludedNote excluded={totals(all).excluded} where="in this period" />
    </>
  );
};
