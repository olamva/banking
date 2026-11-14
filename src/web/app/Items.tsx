import {
  useDeferredValue,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  itemPattern,
  itemsOf,
  nameKey,
  packPrice,
  purchasesOf,
  type Item,
} from "../../core/items.ts";
import { matchesFilters, type Filters } from "../../core/select.ts";
import type { Categorized } from "../../core/types.ts";
import {
  DataTable,
  Empty,
  Note,
  Panel,
  StatTile,
  type Column,
} from "./Cards.tsx";
import { itemRules, type RulesApi } from "./data.ts";
import { fmtDate, fmtNOK, fmtNOKExact } from "./format.ts";
import {
  ChangesIcon,
  DropdownIcon,
  Icon,
  InfoIcon,
  ItemsIcon,
} from "./icons.ts";
import { SwitchField } from "./FilterBar.tsx";
import { PriceChart, unitText } from "./PriceChart.tsx";
import { Slip } from "./ReceiptLines.tsx";
import { SearchBox } from "./SearchBox.tsx";
import { Button } from "./ui/button.tsx";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "./ui/sheet.tsx";

type Sort =
  "name" | "count" | "qty" | "spent" | "price" | "medianDays" | "last";

const QTY = new Intl.NumberFormat("nb-NO", { maximumFractionDigits: 3 });

const fmtQty = (qty: number, unit?: "kg") =>
  `${QTY.format(qty)}${unit ? " kg" : ""}`;

const fmtGap = (days: number | null) =>
  days === null ? "" : `${Math.round(days)} days`;

const value = (item: Item, sort: Sort) =>
  sort === "medianDays" ? (item.medianDays ?? -1) : item[sort];

interface ItemSheetProps {
  item: Item;
  names: string[];
  rules: RulesApi;
  onRename: (name: string) => void;
  onClose: () => void;
}

const ItemSheet = ({
  item,
  names,
  rules,
  onRename,
  onClose,
}: ItemSheetProps) => {
  const [name, setName] = useState(item.name);
  const [shown, setShown] = useState<number | null>(null);
  useEffect(() => {
    document
      .querySelector("[data-marked]")
      ?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [shown]);
  const facts: [string, string][] = [
    ["Purchases", String(item.count)],
    ["Quantity", fmtQty(item.qty, item.unit)],
    ["Spent", fmtNOKExact(item.spent)],
    ["Average price", fmtNOKExact(item.price)],
    ["Usual gap", fmtGap(item.medianDays) || "–"],
    ["Last bought", fmtDate(item.last)],
  ];
  const next = name.trim();

  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent
        onOpenAutoFocus={(e) => e.preventDefault()}
        className="gap-0 overflow-y-auto data-[side=right]:w-full data-[side=right]:sm:max-w-md"
      >
        <SheetHeader className="gap-3 border-b pr-12">
          <div className="min-w-0">
            <SheetTitle className="text-lg font-semibold wrap-break-word">
              {item.name}
            </SheetTitle>
            <SheetDescription className="mt-1 text-xs">
              {item.sizes.join(" · ") || "No size on the receipt"}
            </SheetDescription>
          </div>
          <dl className="grid grid-cols-3 gap-x-3 gap-y-2 text-xs">
            {facts.map(([label, fact]) => (
              <div key={label} className="min-w-0">
                <dt className="text-muted-foreground">{label}</dt>
                <dd className="font-medium tabular-nums">{fact}</dd>
              </div>
            ))}
          </dl>
        </SheetHeader>
        <div className="space-y-5 p-4">
          <section>
            <h3 className="mb-1 text-xs font-medium text-muted-foreground">
              Price
            </h3>
            <PriceChart
              lines={[
                ...Map.groupBy(item.purchases.toReversed(), (p) => p.sizeKey),
              ].map(([, list]) => ({
                name: list[0]!.size ?? "No size",
                purchases: list,
              }))}
              onPick={(p) => setShown(item.purchases.indexOf(p))}
            />
          </section>
          <form
            className="space-y-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (!next || next === item.name) return;
              onRename(next);
              void rules.saveBulk(
                "items",
                [...new Set(item.purchases.map((p) => itemPattern(p.raw)))],
                next,
              );
            }}
          >
            <label
              htmlFor="item-name"
              className="block text-xs font-medium text-muted-foreground"
            >
              Name
            </label>
            <div className="flex gap-2">
              <input
                id="item-name"
                value={name}
                list="item-names"
                onChange={(e) => setName(e.target.value)}
                className="min-h-8 min-w-0 flex-1 rounded-lg border border-input bg-transparent px-2.5 py-1.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
              />
              <Button
                type="submit"
                variant="outline"
                disabled={!next || next === item.name || rules.busy}
              >
                Rename
              </Button>
            </div>
            <datalist id="item-names">
              {names.map((n) => (
                <option key={n} value={n} />
              ))}
            </datalist>
            <p className="text-xs text-muted-foreground">
              Give two items the same name to show them as one item.
            </p>
          </form>
          <section>
            <h3 className="mb-1 text-xs font-medium text-muted-foreground">
              Purchases
            </h3>
            <ul className="divide-y text-[13px]">
              {item.purchases.map((p, i) => (
                <li key={i}>
                  <button
                    type="button"
                    aria-expanded={shown === i}
                    onClick={() => setShown(shown === i ? null : i)}
                    className="flex w-full items-center gap-3 py-2 text-left hover:bg-muted/60"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate">
                        {fmtDate(p.date)} · {p.store}
                      </span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {[
                          p.size,
                          `${fmtQty(p.qty, p.unit)} × ${fmtNOKExact(packPrice(p))}`,
                          unitText(p),
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    </span>
                    <span className="shrink-0 tabular-nums">
                      {fmtNOKExact(p.amount)}
                    </span>
                    <Icon
                      icon={DropdownIcon}
                      size={14}
                      className={`shrink-0 text-muted-foreground transition-transform ${shown === i ? "rotate-180" : ""}`}
                    />
                  </button>
                  {shown === i && (
                    <div className="pb-3">
                      <Slip receipt={p.receipt} marked={p.raw} />
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </section>
        </div>
      </SheetContent>
    </Sheet>
  );
};

interface ItemsProps {
  rows: Categorized[];
  filters: Filters;
  rules: RulesApi;
  onSearch: (search: string) => void;
}

export const Items = ({ rows, filters, rules, onSearch }: ItemsProps) => {
  const words = useDeferredValue(filters.search)
    .toLowerCase()
    .replace(/(\d),(\d)/g, "$1.$2")
    .split(/\s+/);
  const [bySize, setBySize] = useState(false);
  const names = itemRules(rules);
  const purchases = useMemo(
    () =>
      purchasesOf(
        rows.filter((t) =>
          matchesFilters(t, {
            ...filters,
            search: "",
            items: [],
            itemsOut: [],
          }),
        ),
        names,
      ),
    [rows, filters, names],
  );
  const items = useMemo(() => itemsOf(purchases, bySize), [purchases, bySize]);
  const picks = filters.items.map(nameKey);
  const drops = filters.itemsOut.map(nameKey);
  const shown = items.filter(
    ({ key, purchases: [first] }) =>
      words.every((w) => key.includes(w)) &&
      (!picks.length || picks.includes(first!.key)) &&
      !drops.includes(first!.key),
  );
  const [sort, setSort] = useState<Sort>("count");
  const [descending, setDescending] = useState(true);
  const [picked, setPicked] = useState<string | null>(null);
  const open = items.find((i) => i.key === picked);

  const sorted = shown.toSorted((a, b) => {
    const [x, y] = [value(a, sort), value(b, sort)];
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
      setDescending(sort === key ? !descending : key !== "name");
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
    i.count,
    fmtQty(i.qty, i.unit),
    fmtNOK(i.spent),
    fmtNOKExact(i.price),
    fmtGap(i.medianDays),
    fmtDate(i.last),
  ]);

  const bought = shown.reduce((n, i) => n + i.count, 0);
  const receipts = new Set(
    shown.flatMap((i) => i.purchases.map((p) => p.receipt)),
  ).size;

  return (
    <>
      <div className="mb-4 flex gap-2">
        <SearchBox
          value={filters.search}
          onChange={onSearch}
          placeholder="Search items"
          hotkey
          className="flex-1"
        />
        <SwitchField
          label="Split by size"
          checked={bySize}
          onChange={setBySize}
          className="h-auto self-stretch"
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
              : "No items match the item filter."}
          </Empty>
        ) : (
          <DataTable
            scroll
            columns={[
              sortable("Item", "name"),
              sortable("Purchases", "count", true),
              sortable("Quantity", "qty", true, "max-sm:hidden"),
              sortable("Spent", "spent", true),
              sortable("Average price", "price", true, "max-sm:hidden"),
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
        Items come from store receipts with item lines. Email receipts have no
        item lines. Select an item to see each purchase and its receipt, or to
        rename it.
      </Note>
    </>
  );
};
