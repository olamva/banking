import { useEffect, useState } from "react";
import { itemPattern, packPrice, type Item } from "../../core/items.ts";
import type { RulesApi } from "./data.ts";
import { fmtDate, fmtNOKExact } from "./format.ts";
import { DropdownIcon, Icon } from "./icons.ts";
import { PriceChart, unitText } from "./PriceChart.tsx";
import { Slip } from "./ReceiptLines.tsx";
import { Button } from "./ui/button.tsx";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "./ui/sheet.tsx";

const QTY = new Intl.NumberFormat("nb-NO", { maximumFractionDigits: 3 });

export const fmtQty = (qty: number, unit?: "kg") =>
  `${QTY.format(qty)}${unit ? " kg" : ""}`;

export const fmtGap = (days: number | null) =>
  days === null ? "" : `${Math.round(days)} days`;

interface ItemSheetProps {
  item: Item;
  names: string[];
  rules: RulesApi;
  onRename: (name: string) => void;
  onClose: () => void;
}

export const ItemSheet = ({
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
              {item.category.replace("/", " · ")} ·{" "}
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
