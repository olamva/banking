import { useMemo, useState, type ReactNode } from "react";
import { spendingInsights, type MerchantHabit } from "../../core/insights.ts";
import { matchesFilters, todayOslo, type Filters } from "../../core/select.ts";
import type { Categorized } from "../../core/types.ts";
import {
  Card,
  DataTable,
  Empty,
  Note,
  PickCell,
  StatTile,
  type Column,
} from "./Cards.tsx";
import {
  categoryColor,
  categoryLabel,
  fmtDate,
  fmtNOK,
  fmtPct,
} from "./format.ts";
import {
  CategoryIcon,
  CounterpartyIcon,
  InfoIcon,
  MonthlyIcon,
  RecurringIcon,
} from "./icons.ts";

type MerchantSort =
  "count" | "total" | "average" | "favoriteWeekday" | "medianDays" | "last";

interface RankingProps {
  title: string;
  rows: MerchantHabit[];
  metric: "count" | "total";
  onMerchant: (merchant: string, meta: boolean) => void;
}

const Ranking = ({ title, rows, metric, onMerchant }: RankingProps) => {
  const maximum = Math.max(...rows.map((row) => row[metric]), 1);
  return (
    <Card title={title} icon={CounterpartyIcon}>
      <ol className="space-y-1.5">
        {rows.map((row, index) => (
          <li
            key={row.merchant}
            className="flex min-w-0 items-center gap-2 text-xs"
          >
            <span className="w-4 shrink-0 text-right tabular-nums text-ink-muted">
              {index + 1}
            </span>
            <button
              type="button"
              onClick={(event) => onMerchant(row.merchant, event.metaKey)}
              className="relative flex h-7 min-w-0 flex-1 items-center overflow-hidden rounded-md px-2 text-left hover:bg-hover"
            >
              <span
                className="absolute inset-y-0 left-0 rounded-md bg-series-1-track"
                style={{ width: `${(row[metric] / maximum) * 100}%` }}
              />
              <span className="relative min-w-0 flex-1 truncate">
                {row.merchant}
              </span>
              <span className="relative ml-2 shrink-0 font-semibold tabular-nums">
                {metric === "count" ? `${row.count} txns` : fmtNOK(row.total)}
              </span>
            </button>
          </li>
        ))}
      </ol>
    </Card>
  );
};

interface WeekdayCardProps {
  insights: ReturnType<typeof spendingInsights>;
  onMerchant: (merchant: string, meta: boolean) => void;
}

const WeekdayCard = ({ insights, onMerchant }: WeekdayCardProps) => {
  const maximum = Math.max(...insights.weekdays.map((day) => day.count), 1);
  return (
    <Card title="Card visits by weekday" icon={MonthlyIcon}>
      <div className="overflow-x-auto">
        <div className="min-w-115 space-y-1">
          {insights.weekdays.map((day) => (
            <div
              key={day.weekday}
              className="grid grid-cols-[72px_1fr_82px_150px] items-center gap-2 text-[11px]"
            >
              <span>{day.weekday}</span>
              <span className="flex h-4 items-center">
                <span
                  className="h-4 min-w-px rounded bg-series-1"
                  style={{ width: `${(day.count / maximum) * 100}%` }}
                />
              </span>
              <span className="text-right font-semibold tabular-nums">
                {day.count} · {fmtPct(day.share)}
              </span>
              <span className="truncate text-ink-soft">
                {day.topMerchant ? (
                  <PickCell label={day.topMerchant} onPick={onMerchant} />
                ) : (
                  "No visits"
                )}
              </span>
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
};

interface ForecastProps {
  merchants: MerchantHabit[];
  onMerchant: (merchant: string, meta: boolean) => void;
}

const Forecast = ({ merchants, onMerchant }: ForecastProps) => {
  const forecast = merchants
    .filter((merchant) => merchant.returnPattern?.active)
    .sort((a, b) =>
      a.returnPattern!.expectedNext.localeCompare(
        b.returnPattern!.expectedNext,
      ),
    )
    .slice(0, 10);
  return (
    <Card title="Expected returns" icon={RecurringIcon}>
      {forecast.length === 0 ? (
        <Empty>At least three recent card visit days are needed.</Empty>
      ) : (
        <div className="space-y-1">
          {forecast.map((merchant) => (
            <button
              key={merchant.merchant}
              type="button"
              onClick={(event) => onMerchant(merchant.merchant, event.metaKey)}
              className="flex w-full items-center gap-3 rounded-md px-2 py-1.5 text-left text-xs hover:bg-hover"
            >
              <span className="min-w-0 flex-1 truncate">
                {merchant.merchant}
              </span>
              <span className="shrink-0 text-right">
                <span className="block font-semibold">
                  {fmtDate(merchant.returnPattern!.expectedNext)}
                </span>
                <span className="block text-[11px] text-ink-muted">
                  every {merchant.returnPattern!.medianDays} days
                </span>
              </span>
            </button>
          ))}
        </div>
      )}
    </Card>
  );
};

interface InsightsProps {
  rows: Categorized[];
  filters: Filters;
  onMerchant: (merchant: string, meta: boolean) => void;
  onCategory: (category: string, meta: boolean) => void;
}

export const Insights = ({
  rows,
  filters,
  onMerchant,
  onCategory,
}: InsightsProps) => {
  const shown = useMemo(
    () => rows.filter((txn) => matchesFilters(txn, filters)),
    [rows, filters],
  );
  const insights = useMemo(() => spendingInsights(shown, todayOslo()), [shown]);
  const [sort, setSort] = useState<MerchantSort>("count");
  const [descending, setDescending] = useState(true);

  if (insights.transactionCount === 0)
    return <Empty>No spending matches the current filters.</Empty>;

  const favoriteDay = [...insights.weekdays].sort(
    (a, b) => b.count - a.count,
  )[0]!;
  const mostTransactions = insights.topByTransactions[0]!;
  const sorted = [...insights.merchants].sort((a, b) => {
    const direction = descending ? -1 : 1;
    if (sort === "favoriteWeekday")
      return (
        direction *
        (a.favoriteWeekday ?? "").localeCompare(b.favoriteWeekday ?? "")
      );
    if (sort === "medianDays")
      return (
        direction *
        ((a.returnPattern?.medianDays ?? -1) -
          (b.returnPattern?.medianDays ?? -1))
      );
    if (sort === "last")
      return direction * (a.last ?? "").localeCompare(b.last ?? "");
    return direction * (a[sort] - b[sort]);
  });
  const changeSort = (next: MerchantSort) => {
    if (sort === next) setDescending((value) => !value);
    else {
      setSort(next);
      setDescending(true);
    }
  };
  const sortable = (label: string, key: MerchantSort, num = false): Column => ({
    label,
    num,
    onClick: () => changeSort(key),
    sort: sort === key ? (descending ? "desc" : "asc") : null,
  });
  const columns = [
    { label: "Merchant" },
    sortable("Transactions", "count", true),
    sortable("Spent", "total", true),
    sortable("Average", "average", true),
    sortable("Favorite time", "favoriteWeekday"),
    { label: "Main category" },
    sortable("Usual return", "medianDays", true),
    sortable("Last card visit", "last"),
    { label: "Expected next" },
  ];
  const tableRows: ReactNode[][] = sorted.map((merchant) => [
    <PickCell label={merchant.merchant} onPick={onMerchant} />,
    merchant.count,
    fmtNOK(merchant.total),
    fmtNOK(merchant.average),
    merchant.activeDays === 0
      ? "No card visits"
      : merchant.weekendVisitCount / merchant.activeDays > 0.5
        ? `Weekend (${fmtPct(merchant.weekendVisitCount / merchant.activeDays)})`
        : `${merchant.favoriteWeekday} (${fmtPct(merchant.favoriteWeekdayCount / merchant.activeDays)})`,
    <PickCell
      label={categoryLabel(merchant.topCategory)}
      value={merchant.topCategory}
      color={categoryColor(merchant.topCategory)}
      onPick={onCategory}
    />,
    merchant.returnPattern
      ? `${merchant.returnPattern.medianDays} days (${merchant.returnPattern.lowDays}–${merchant.returnPattern.highDays})`
      : "Not enough card visits",
    merchant.last ? fmtDate(merchant.last) : "No card visits",
    merchant.returnPattern?.active
      ? fmtDate(merchant.returnPattern.expectedNext)
      : "Inactive pattern",
  ]);

  return (
    <>
      <div className="mb-4 grid grid-cols-[repeat(auto-fit,minmax(min(160px,100%),1fr))] gap-3">
        <StatTile
          label="Spending transactions"
          value={String(insights.transactionCount)}
        />
        <StatTile label="Merchants" value={String(insights.merchantCount)} />
        <StatTile
          label="Most transactions"
          value={mostTransactions.merchant}
          sub={`${mostTransactions.count} txns · ${fmtNOK(mostTransactions.total)}`}
        />
        <StatTile
          label="Favorite card weekday"
          value={favoriteDay.count ? favoriteDay.weekday : "Not available"}
          sub={
            favoriteDay.count
              ? `${favoriteDay.count} merchant visits · ${fmtPct(favoriteDay.share)}`
              : "No card purchase dates"
          }
        />
      </div>

      <Note icon={InfoIcon} className="mb-4">
        Timing uses card purchase dates. Rankings use all spending transactions.
      </Note>

      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(300px,100%),1fr))] gap-4">
        <Ranking
          title="Most merchant transactions"
          rows={insights.topByTransactions}
          metric="count"
          onMerchant={onMerchant}
        />
        <Ranking
          title="Highest merchant spend"
          rows={insights.topBySpend}
          metric="total"
          onMerchant={onMerchant}
        />
        <Forecast merchants={insights.merchants} onMerchant={onMerchant} />
      </div>

      <div className="mt-5">
        <WeekdayCard insights={insights} onMerchant={onMerchant} />
      </div>

      <div className="mt-5">
        <Card title="Merchant habits" icon={CategoryIcon}>
          <DataTable columns={columns} rows={tableRows} scroll />
        </Card>
      </div>
    </>
  );
};
