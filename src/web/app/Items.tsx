import { useDeferredValue, useMemo, useState, type ReactNode } from "react";
import { itemsOf, purchasesOf, type Item } from "../../core/items.ts";
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
import { fmtDate, fmtNOK, fmtNOKExact } from "./format.ts";
import { CloseIcon, Icon, InfoIcon, ItemsIcon, ReceiptIcon } from "./icons.ts";
import { SearchBox } from "./SearchBox.tsx";
import { Button } from "./ui/button.tsx";

type Sort =
  "name" | "count" | "qty" | "spent" | "price" | "medianDays" | "last";

const QTY = new Intl.NumberFormat("nb-NO", { maximumFractionDigits: 3 });

const fmtQty = (qty: number, unit?: "kg") =>
  `${QTY.format(qty)}${unit ? " kg" : ""}`;

const value = (item: Item, sort: Sort) =>
  sort === "medianDays" ? (item.medianDays ?? -1) : item[sort];

const History = ({ item, onClose }: { item: Item; onClose: () => void }) => (
  <Panel
    title={item.name}
    icon={ReceiptIcon}
    description={`${item.count} purchases · ${fmtQty(item.qty, item.unit)} bought · ${fmtNOKExact(item.spent)}`}
    action={
      <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close">
        <Icon icon={CloseIcon} size={16} />
      </Button>
    }
    className="mb-4"
  >
    <DataTable
      scroll
      columns={[
        { label: "Date" },
        { label: "Store" },
        { label: "Size" },
        { label: "Quantity", num: true },
        { label: "Unit price", num: true },
        { label: "Paid", num: true },
      ]}
      rows={item.purchases.map((p) => [
        fmtDate(p.date),
        p.store,
        p.size ?? "",
        fmtQty(p.qty, p.unit),
        fmtNOKExact(p.qty ? p.amount / p.qty : 0),
        fmtNOKExact(p.amount),
      ])}
    />
  </Panel>
);

interface ItemsProps {
  rows: Categorized[];
  filters: Filters;
  onSearch: (search: string) => void;
}

export const Items = ({ rows, filters, onSearch }: ItemsProps) => {
  const search = useDeferredValue(filters.search).toLowerCase().trim();
  const items = useMemo(
    () =>
      itemsOf(
        purchasesOf(
          rows.filter((t) => matchesFilters(t, { ...filters, search: "" })),
        ),
      ),
    [rows, filters],
  );
  const shown = items.filter((i) => i.key.includes(search));
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

  const sortable = (label: string, key: Sort, num = false): Column => ({
    label,
    num,
    onClick: () => {
      setDescending(sort === key ? !descending : key !== "name");
      setSort(key);
    },
    sort: sort === key ? (descending ? "desc" : "asc") : null,
  });

  const tableRows: ReactNode[][] = sorted.map((i) => [
    <span className="block max-w-[45vw] truncate sm:max-w-96">
      {i.name}
      {i.size && <span className="text-muted-foreground"> · {i.size}</span>}
    </span>,
    i.count,
    fmtQty(i.qty, i.unit),
    fmtNOK(i.spent),
    fmtNOKExact(i.price),
    i.medianDays === null ? "" : `${Math.round(i.medianDays)} days`,
    fmtDate(i.last),
  ]);

  const purchases = shown.reduce((n, i) => n + i.count, 0);
  const receipts = new Set(
    shown.flatMap((i) => i.purchases.map((p) => p.receipt)),
  ).size;

  return (
    <>
      <SearchBox
        value={filters.search}
        onChange={onSearch}
        placeholder="Search items"
        hotkey
        className="mb-4"
      />
      <div className="mb-4 grid grid-cols-[repeat(auto-fit,minmax(min(150px,100%),1fr))] gap-3 max-sm:grid-cols-2">
        <StatTile label="Items" value={String(shown.length)} />
        <StatTile label="Purchases" value={String(purchases)} />
        <StatTile label="Shopping trips" value={String(receipts)} />
        <StatTile
          label="Spent"
          value={fmtNOK(shown.reduce((n, i) => n + i.spent, 0))}
        />
      </div>
      {open && <History item={open} onClose={() => setPicked(null)} />}
      <Panel title="Bought items" icon={ItemsIcon}>
        {items.length === 0 ? (
          <Empty>No receipts with item lines match the current filters.</Empty>
        ) : shown.length === 0 ? (
          <Empty>No items match “{filters.search}”.</Empty>
        ) : (
          <DataTable
            scroll
            columns={[
              sortable("Item", "name"),
              sortable("Purchases", "count", true),
              sortable("Quantity", "qty", true),
              sortable("Spent", "spent", true),
              sortable("Average price", "price", true),
              sortable("Usual gap", "medianDays", true),
              sortable("Last bought", "last"),
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
        item lines. Select a row to see each purchase.
      </Note>
    </>
  );
};
