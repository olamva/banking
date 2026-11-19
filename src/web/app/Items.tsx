import { useDeferredValue, useMemo, useState, type ReactNode } from "react";
import {
  itemsOf,
  nameKey,
  shelfPrice,
  topCategory,
  type Item,
} from "../../core/items.ts";
import {
  cycleFilter,
  filteredPurchases,
  keepsItemsOnly,
  type Filters,
} from "../../core/select.ts";
import { plural } from "../../core/plural.ts";
import type { Categorized } from "../../core/types.ts";
import { Empty, InfoTip, Panel } from "./Cards.tsx";
import { DataTable, type Column } from "./DataTable.tsx";
import { HorizontalBars, type BarItem } from "./Charts.tsx";
import { mapRules, type RulesApi } from "./data.ts";
import { fmtNOK, fmtNOKExact, fmtPct, fmtShortDate } from "./format.ts";
import { CategoryIcon, ChangesIcon, Icon, ItemsIcon } from "./icons.ts";
import { SwitchField } from "./FilterBar.tsx";
import {
  fmtGap,
  fmtQty,
  ItemBody,
  ItemFacts,
  ItemSheet,
  itemSummary,
} from "./ItemSheet.tsx";
import { Button } from "./ui/button.tsx";
import { cn } from "./ui/utils.ts";

const MIN_SWING = 0.05;

type Sort =
  | "name"
  | "category"
  | "count"
  | "qty"
  | "spent"
  | "price"
  | "change"
  | "medianDays"
  | "last";

const subLabel = (pair: string) => pair.slice(pair.indexOf("/") + 1);

const categoryBars = (items: Item[]): BarItem[] =>
  [...Map.groupBy(items, (i) => topCategory(i.category))]
    .map(([top, list]) => ({
      label: top,
      total: list.reduce((n, i) => n + i.spent, 0),
      subs: [...Map.groupBy(list, (i) => i.category)]
        .filter(([pair]) => pair !== top)
        .map(([pair, subs]) => ({
          label: subLabel(pair),
          key: pair,
          total: subs.reduce((n, i) => n + i.spent, 0),
        }))
        .sort((a, b) => b.total - a.total),
    }))
    .sort((a, b) => b.total - a.total);

const Change = ({ change }: { change: number | null }) =>
  change !== null && (
    <span
      className={
        change < 0 ? "text-income" : change > 0 ? "text-destructive" : ""
      }
    >
      {`${change > 0 ? "+" : ""}${fmtPct(change)}`}
    </span>
  );

const value = (item: Item, sort: Sort) => item[sort];

interface SwingsProps {
  title: string;
  items: Item[];
  onPick: (key: string) => void;
}

const Swings = ({ title, items, onPick }: SwingsProps) => (
  <section className="min-w-0">
    <h3 className="mb-1 text-xs font-medium text-muted-foreground">{title}</h3>
    {items.length === 0 ? (
      <p className="py-1.5 text-xs text-muted-foreground">None</p>
    ) : (
      items.map((i) => (
        <Button
          key={i.key}
          variant="ghost"
          onClick={() => onPick(i.key)}
          className="-mx-2 h-auto w-[calc(100%+1rem)] justify-start gap-3 rounded-md px-2 py-1.5 text-left text-xs font-normal"
        >
          <span className="min-w-0 flex-1">
            <span className="block truncate">{i.name}</span>
            <span className="block truncate text-[11px] text-muted-foreground">
              {fmtNOKExact(shelfPrice(i.purchases[0]!))}, usually{" "}
              {fmtNOKExact(i.usual!)}
            </span>
          </span>
          <span className="shrink-0 font-semibold tabular-nums">
            <Change change={i.change} />
          </span>
        </Button>
      ))
    )}
  </section>
);

interface ItemsProps {
  rows: Categorized[];
  filters: Filters;
  rules: RulesApi;
  onFilters: (filters: Filters) => void;
  grid: string;
  className?: string;
}

export const Items = ({
  rows,
  filters,
  rules,
  onFilters,
  grid,
  className,
}: ItemsProps) => {
  const search = useDeferredValue(filters.search).toLowerCase();
  const words = search.replace(/(\d),(\d)/g, "$1.$2").split(/\s+/);
  const [bySize, setBySize] = useState(false);
  const names = mapRules(rules, "items");
  const categories = mapRules(rules, "item-categories");
  const pickKind = (value: string, exclude: boolean) =>
    onFilters(cycleFilter(filters, "kinds", value, exclude));
  const purchases = useMemo(
    () => filteredPurchases(rows, { ...filters, search }, names, categories),
    [rows, filters, search, names, categories],
  );
  const whole = useMemo(() => itemsOf(purchases), [purchases]);
  const items = useMemo(
    () => (bySize ? itemsOf(purchases, true) : whole),
    [purchases, bySize, whole],
  );
  const keep = ({ key, purchases: list }: Item) =>
    words.every((w) => key.includes(w)) ||
    list.some((p) => p.store.toLowerCase().includes(search));
  const shown = items.filter(keep);
  const kept = whole.filter(keep);
  const [sort, setSort] = useState<Sort>("count");
  const [descending, setDescending] = useState(true);
  const [picked, setPicked] = useState<string | null>(null);
  const open = [...items, ...whole].find((i) => i.key === picked);

  const sorted = shown.toSorted((a, b) => {
    const [x, y] = [value(a, sort), value(b, sort)];
    if (x === null || y === null)
      return Number(x === null) - Number(y === null) || b.count - a.count;
    const order =
      typeof x === "string" ? x.localeCompare(String(y)) : x - Number(y);
    return (descending ? -order : order) || b.count - a.count;
  });

  const sortable = (
    label: string,
    key: Sort,
    num = false,
    phone?: Column["phone"],
  ): Column => ({
    label,
    num,
    phone,
    onClick: () => {
      setDescending(
        sort === key ? !descending : key !== "name" && key !== "category",
      );
      setSort(key);
    },
    sort: sort === key ? (descending ? "desc" : "asc") : null,
  });

  const tableRows: ReactNode[][] = sorted.map((i) => [
    <span className="block truncate sm:max-w-96">
      {i.name}
      {i.sizes.length > 0 && (
        <span className="text-muted-foreground">
          {" · "}
          {i.sizes.length > 1 ? `${i.sizes.length} sizes` : i.sizes[0]}
        </span>
      )}
    </span>,
    topCategory(i.category),
    i.count,
    fmtQty(i.qty, i.unit),
    fmtNOK(i.spent),
    fmtNOKExact(i.price),
    i.change !== null && <Change change={i.change} />,
    fmtGap(i.medianDays),
    fmtShortDate(i.last),
  ]);

  const swings = kept
    .filter((i) => i.change !== null && Math.abs(i.change) >= MIN_SWING)
    .toSorted((a, b) => a.change! - b.change!);

  const bought = kept.reduce((n, i) => n + i.count, 0);
  const receipts = new Set(
    kept.flatMap((i) => i.purchases.map((p) => p.receipt)),
  ).size;

  if (items.length === 0) return null;

  const lone = keepsItemsOnly(filters) && whole.length === 1 ? whole[0]! : null;
  if (lone)
    return (
      <section className={className}>
        <Panel
          title={lone.name}
          icon={ItemsIcon}
          description={itemSummary(lone)}
        >
          <ItemFacts item={lone} className="mb-5 sm:grid-cols-6" />
          <ItemBody
            key={lone.key}
            item={lone}
            names={[]}
            rules={rules}
            onRename={(name) =>
              onFilters({
                ...filters,
                items: filters.items.map((i) =>
                  nameKey(i) === lone.key ? name : i,
                ),
              })
            }
          />
        </Panel>
      </section>
    );

  return (
    <section className={className}>
      <div className="mb-5">
        <h2 className="flex items-center gap-2 text-base font-semibold">
          <Icon icon={ItemsIcon} size={16} className="text-muted-foreground" />
          Items from receipts
          <InfoTip label="About items from receipts">
            Items come from receipts with item lines. The category comes from
            the product group on a REMA receipt, or from a rule in Item
            categories. Select an item to see each purchase, its price over time
            and its receipt, or to rename it.
          </InfoTip>
        </h2>
        <p className="mt-0.5 text-xs text-muted-foreground tabular-nums">
          {plural(receipts, "receipt")} · {plural(bought, "purchase")} ·{" "}
          {fmtNOK(kept.reduce((n, i) => n + i.spent, 0))}
        </p>
      </div>
      {open && (
        <ItemSheet
          key={open.key}
          item={open}
          names={items.map((i) => i.name)}
          rules={rules}
          onRename={(name) =>
            setPicked(open.key.replace(/^[^\n]*/, () => nameKey(name)))
          }
          onClose={() => setPicked(null)}
        />
      )}
      {kept.length > 0 && (
        <div className={cn(grid, "mb-8")}>
          <Panel
            title="Spending by item category"
            icon={CategoryIcon}
            description="Select a category to show only its items."
          >
            <HorizontalBars
              items={categoryBars(kept)}
              onPick={pickKind}
              onPickSub={pickKind}
            />
          </Panel>
          {swings.length > 0 && (
            <Panel
              title="Biggest price changes"
              icon={ChangesIcon}
              description="The latest price against the usual price."
              info="The usual price is the median of earlier purchases of the same size. Both prices are shelf prices, so discounts at checkout, such as app offers, do not count. Changes under 5% are left out."
            >
              <div className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
                <Swings
                  title="Cheaper now"
                  items={swings.filter((i) => i.change! < 0).slice(0, 5)}
                  onPick={setPicked}
                />
                <Swings
                  title="More expensive now"
                  items={swings
                    .filter((i) => i.change! > 0)
                    .toReversed()
                    .slice(0, 5)}
                  onPick={setPicked}
                />
              </div>
            </Panel>
          )}
        </div>
      )}
      <Panel
        title="Bought items"
        icon={ItemsIcon}
        action={
          <SwitchField
            label="Split by size"
            checked={bySize}
            onChange={setBySize}
          />
        }
      >
        {shown.length === 0 ? (
          <Empty>
            {filters.search
              ? `No items match “${filters.search}”.`
              : "No items match the item or category filter."}
          </Empty>
        ) : (
          <DataTable
            scroll
            columns={[
              sortable("Item", "name", false, "title"),
              sortable("Category", "category", false, "meta"),
              sortable("Purchases", "count", true, "labeled"),
              sortable("Quantity", "qty", true),
              sortable("Spent", "spent", true, "end"),
              sortable("Average price", "price", true),
              sortable("Price change", "change", true, "labeled"),
              sortable("Usual gap", "medianDays", true),
              sortable("Last bought", "last", false, "labeled"),
            ]}
            rows={tableRows}
            onRow={(index) => setPicked(sorted[index]!.key)}
            rowClassName={(index) =>
              sorted[index]!.key === picked ? "bg-muted" : ""
            }
          />
        )}
      </Panel>
    </section>
  );
};
