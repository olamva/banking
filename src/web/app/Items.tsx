import { useDeferredValue, useMemo, useState, type ReactNode } from "react";
import {
  itemsOf,
  nameKey,
  packPrice,
  purchasesOf,
  topCategory,
  type Item,
} from "../../core/items.ts";
import {
  cycleFilter,
  matchesFilters,
  type Filters,
} from "../../core/select.ts";
import type { Categorized } from "../../core/types.ts";
import {
  DataTable,
  Empty,
  Note,
  Panel,
  StatTile,
  type Column,
} from "./Cards.tsx";
import { HorizontalBars, type BarItem } from "./Charts.tsx";
import { itemRules, type RulesApi } from "./data.ts";
import { fmtDate, fmtNOK, fmtNOKExact, fmtPct } from "./format.ts";
import { CategoryIcon, ChangesIcon, InfoIcon, ItemsIcon } from "./icons.ts";
import { SwitchField } from "./FilterBar.tsx";
import { fmtGap, fmtQty, ItemSheet } from "./ItemSheet.tsx";
import { PriceChart } from "./PriceChart.tsx";
import { SearchBox } from "./SearchBox.tsx";

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
        <button
          key={i.key}
          type="button"
          onClick={() => onPick(i.key)}
          className="-mx-2 flex w-[calc(100%+1rem)] items-center gap-3 rounded-md px-2 py-1.5 text-left text-xs hover:bg-muted/70"
        >
          <span className="min-w-0 flex-1">
            <span className="block truncate">{i.name}</span>
            <span className="block truncate text-[11px] text-muted-foreground">
              {fmtNOKExact(packPrice(i.purchases[0]!))}, usually{" "}
              {fmtNOKExact(i.usual!)}
            </span>
          </span>
          <span className="shrink-0 font-semibold tabular-nums">
            <Change change={i.change} />
          </span>
        </button>
      ))
    )}
  </section>
);

interface ItemsProps {
  rows: Categorized[];
  filters: Filters;
  rules: RulesApi;
  onFilters: (filters: Filters) => void;
}

export const Items = ({ rows, filters, rules, onFilters }: ItemsProps) => {
  const words = useDeferredValue(filters.search)
    .toLowerCase()
    .replace(/(\d),(\d)/g, "$1.$2")
    .split(/\s+/);
  const [bySize, setBySize] = useState(false);
  const names = itemRules(rules);
  const categories = itemRules(rules, "item-categories");
  const pickKind = (value: string, exclude: boolean) =>
    onFilters(cycleFilter(filters, "kinds", value, exclude));
  const purchases = useMemo(
    () =>
      purchasesOf(
        rows.filter((t) =>
          matchesFilters(t, {
            ...filters,
            search: "",
            items: [],
            itemsOut: [],
            kinds: [],
            kindsOut: [],
          }),
        ),
        names,
        filters.withoutDeposit,
        categories,
      ),
    [rows, filters, names, categories],
  );
  const items = useMemo(() => itemsOf(purchases, bySize), [purchases, bySize]);
  const picks = filters.items.map(nameKey);
  const drops = filters.itemsOut.map(nameKey);
  const shown = items.filter(({ key, category, purchases: [first] }) => {
    const kind = [topCategory(category), category];
    return (
      words.every((w) => key.includes(w)) &&
      (!picks.length || picks.includes(first!.key)) &&
      !drops.includes(first!.key) &&
      (!filters.kinds.length || kind.some((k) => filters.kinds.includes(k))) &&
      !kind.some((k) => filters.kindsOut.includes(k))
    );
  });
  const [sort, setSort] = useState<Sort>("count");
  const [descending, setDescending] = useState(true);
  const [picked, setPicked] = useState<string | null>(null);
  const open = items.find((i) => i.key === picked);

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
    className?: string,
  ): Column => ({
    label,
    num,
    className,
    onClick: () => {
      setDescending(
        sort === key ? !descending : key !== "name" && key !== "category",
      );
      setSort(key);
    },
    sort: sort === key ? (descending ? "desc" : "asc") : null,
  });

  const tableRows: ReactNode[][] = sorted.map((i) => [
    <span className="block max-w-[calc(100vw-15rem)] truncate sm:max-w-96">
      {i.name}
      <span className="text-muted-foreground max-sm:block max-sm:min-h-4 max-sm:truncate max-sm:text-xs">
        {i.sizes.length > 0 && (
          <>
            <span className="max-sm:hidden"> · </span>
            {i.sizes.length > 1 ? `${i.sizes.length} sizes` : i.sizes[0]}
          </>
        )}
      </span>
    </span>,
    topCategory(i.category),
    i.count,
    fmtQty(i.qty, i.unit),
    fmtNOK(i.spent),
    fmtNOKExact(i.price),
    <Change change={i.change} />,
    fmtGap(i.medianDays),
    fmtDate(i.last),
  ]);

  const swings = shown
    .filter((i) => i.change)
    .toSorted((a, b) => a.change! - b.change!);

  const bought = shown.reduce((n, i) => n + i.count, 0);
  const receipts = new Set(
    shown.flatMap((i) => i.purchases.map((p) => p.receipt)),
  ).size;

  return (
    <>
      <div className="mb-4 flex flex-wrap gap-2">
        <SearchBox
          value={filters.search}
          onChange={(search) => onFilters({ ...filters, search })}
          placeholder="Search items"
          hotkey
          className="flex-1"
        />
        <SwitchField
          label="Split by size"
          checked={bySize}
          onChange={setBySize}
          className="sm:h-auto sm:self-stretch"
        />
      </div>
      <div className="mb-4 grid grid-cols-[repeat(auto-fit,minmax(min(150px,100%),1fr))] gap-3 max-sm:grid-cols-2">
        <StatTile label="Items" value={String(shown.length)} />
        <StatTile label="Purchases" value={String(bought)} />
        <StatTile label="Shopping trips" value={String(receipts)} />
        <StatTile
          label="Spent"
          value={fmtNOK(shown.reduce((n, i) => n + i.spent, 0))}
        />
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
      {shown.length > 0 && (
        <Panel
          title="Spend by category"
          icon={CategoryIcon}
          description="Select a category to show only its items."
          className="mb-4"
        >
          <HorizontalBars
            items={categoryBars(shown)}
            onPick={pickKind}
            onPickSub={pickKind}
          />
        </Panel>
      )}
      {swings.length > 0 && (
        <Panel
          title="Biggest price changes"
          icon={ChangesIcon}
          description="The latest price against the median of earlier purchases of the same size."
          className="mb-4"
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
      {sorted.length > 0 && (
        <Panel
          title="Price over time"
          icon={ChangesIcon}
          description="The first five items in the table. Select a point to open its item."
          className="mb-4"
        >
          <PriceChart
            lines={sorted.slice(0, 5).map((i) => ({
              name: bySize && i.sizes[0] ? `${i.name} · ${i.sizes[0]}` : i.name,
              purchases: i.purchases,
            }))}
            onPick={(p) =>
              setPicked(sorted.find((i) => i.purchases.includes(p))!.key)
            }
          />
        </Panel>
      )}
      <Panel title="Bought items" icon={ItemsIcon}>
        {items.length === 0 ? (
          <Empty>No receipts with item lines match the current filters.</Empty>
        ) : shown.length === 0 ? (
          <Empty>
            {filters.search
              ? `No items match “${filters.search}”.`
              : "No items match the item or category filter."}
          </Empty>
        ) : (
          <DataTable
            scroll
            columns={[
              sortable("Item", "name"),
              sortable("Category", "category", false, "max-sm:hidden"),
              sortable("Purchases", "count", true),
              sortable("Quantity", "qty", true, "max-sm:hidden"),
              sortable("Spent", "spent", true),
              sortable("Average price", "price", true, "max-sm:hidden"),
              sortable("Price change", "change", true, "max-sm:hidden"),
              sortable("Usual gap", "medianDays", true, "max-sm:hidden"),
              sortable("Last bought", "last", false, "max-sm:hidden"),
            ]}
            rows={tableRows}
            onRow={(index) => setPicked(sorted[index]!.key)}
            rowClassName={(index) =>
              sorted[index]!.key === picked ? "bg-muted" : ""
            }
          />
        )}
      </Panel>
      <Note icon={InfoIcon} className="mt-4">
        Items come from receipts with item lines. The category comes from the
        product group on a REMA receipt, or from a rule in Item categories.
        Select an item to see each purchase and its receipt, or to rename it.
      </Note>
    </>
  );
};
