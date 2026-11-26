import { Fragment, useState, type ReactNode } from "react";
import { isBought } from "../../core/items.ts";
import type { Receipt, ReceiptLine, Entry } from "../../core/receipts.ts";
import { fmtDate, fmtDateTime } from "./format.ts";
import {
  ChangesIcon,
  ExcludeIcon,
  ExternalLinkIcon,
  FilterIcon,
  Icon,
  type IconSvgElement,
} from "./icons.ts";
import { Button } from "./ui/button.tsx";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu.tsx";

const ORE = new Intl.NumberFormat("nb-NO", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const QTY = new Intl.NumberFormat("nb-NO", { maximumFractionDigits: 3 });

const total = (items: { amount: number }[]) =>
  items.reduce((sum, i) => sum + i.amount, 0);

const byLabel = (savings: Entry[]): Entry[] =>
  [...Map.groupBy(savings, (s) => s.label)].map(([label, same]) => ({
    label,
    amount: total(same),
  }));

const merged = (lines: ReceiptLine[]): ReceiptLine[] =>
  [
    ...Map.groupBy(lines, (l, i) =>
      l.unit ? i : `${l.name}\n${l.size}\n${l.price}`,
    ).values(),
  ].map((same) => ({
    ...same[0]!,
    qty: total(same.map((l) => ({ amount: l.qty }))),
    amount: total(same),
    discounts: byLabel(same.flatMap((l) => l.discounts ?? [])),
    deposit: total(same.map((l) => ({ amount: l.deposit ?? 0 }))),
  }));

const Row = ({
  amount,
  className = "",
  children,
}: {
  amount: number;
  className?: string;
  children: ReactNode;
}) => (
  <span className={`flex items-baseline gap-2 ${className}`}>
    <span className="min-w-0 flex-1 wrap-break-word">{children}</span>
    <span className="w-16 shrink-0 text-right">{ORE.format(amount)}</span>
  </span>
);

const Rule = () => (
  <div className="my-2 border-t border-dashed border-muted-foreground/60" />
);

export type ItemAction = "details" | "only" | "hide";

const ITEM_ACTIONS: [ItemAction, string, IconSvgElement][] = [
  ["details", "Item details", ChangesIcon],
  ["only", "Filter by this item", FilterIcon],
  ["hide", "Exclude this item", ExcludeIcon],
];

interface ItemProps {
  line: ReceiptLine;
  marked: boolean;
  struck?: boolean;
  onItem?: (raw: string, action: ItemAction) => void;
}

const Item = ({ line, marked, struck, onItem }: ItemProps) => {
  const [open, setOpen] = useState(false);
  const body = (
    <span
      className={`block ${struck ? "text-muted-foreground line-through" : ""}`}
    >
      <ItemBody line={line} />
    </span>
  );
  if (!onItem)
    return (
      <div
        data-marked={marked || undefined}
        className={`py-0.5 ${marked ? "-mx-1.5 rounded-sm bg-muted px-1.5 font-semibold" : ""}`}
      >
        {body}
      </div>
    );
  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger
        asChild
        onPointerDown={(e) => {
          if (e.pointerType !== "mouse") e.preventDefault();
        }}
        onClick={() => setOpen(true)}
      >
        <Button
          variant="ghost"
          data-marked={marked || undefined}
          className={`-mx-1.5 flex h-auto w-[calc(100%+0.75rem)] flex-col items-stretch gap-0 rounded-sm px-1.5 py-0.5 text-left text-[length:inherit] leading-[inherit] whitespace-normal active:not-aria-[haspopup]:translate-y-0 ${marked ? "bg-muted font-semibold" : "font-normal"}`}
        >
          {body}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        <DropdownMenuLabel className="truncate">{line.name}</DropdownMenuLabel>
        {ITEM_ACTIONS.map(([action, label, icon]) => (
          <Fragment key={action}>
            {action === "hide" && <DropdownMenuSeparator />}
            <DropdownMenuItem
              variant={action === "hide" ? "destructive" : "default"}
              onSelect={() => onItem(line.name, action)}
            >
              <Icon icon={icon} size={15} />
              {label}
            </DropdownMenuItem>
          </Fragment>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

const ItemBody = ({ line }: { line: ReceiptLine }) => (
  <>
    <span className="block uppercase wrap-break-word">{line.name}</span>
    <Row
      amount={line.amount + total(line.discounts ?? []) - (line.deposit ?? 0)}
      className="pl-3"
    >
      <span className="flex flex-wrap justify-between gap-x-3 text-muted-foreground">
        {line.size && <span>{line.size}</span>}
        {line.price > 0 && (
          <span className="ml-auto">
            {line.unit
              ? `${QTY.format(line.qty)} kg × ${ORE.format(line.price)}/kg`
              : `${QTY.format(line.qty)} × ${ORE.format(line.price)}`}
          </span>
        )}
      </span>
    </Row>
    {line.discounts?.map((d) => (
      <Row key={d.label} amount={-d.amount} className="pl-3">
        Rabatt{d.label && `: ${d.label}`}
      </Row>
    ))}
    {!!line.deposit && (
      <Row amount={line.deposit} className="pl-3">
        Pant
      </Row>
    )}
  </>
);

interface SlipProps {
  receipt: Receipt;
  marked?: string[];
  struck?: string[];
  onItem?: ItemProps["onItem"];
}

export const Slip = ({ receipt, marked, struck, onItem }: SlipProps) => {
  const lines = merged(receipt.lines);
  const saved = total(lines.flatMap((l) => l.discounts ?? []));
  return (
    <div className="mx-auto max-w-[380px] rounded-md border border-border bg-background px-4 py-3 font-mono text-[11px] leading-relaxed tabular-nums">
      <div className="text-center font-semibold uppercase">{receipt.store}</div>
      <div className="text-center text-muted-foreground">
        {receipt.source === "price"
          ? fmtDate(new Date(receipt.at).toISOString().slice(0, 10))
          : fmtDateTime(receipt.at)}
      </div>
      <Rule />
      {lines.map((l, i) => (
        <Item
          key={i}
          line={l}
          marked={!!marked?.includes(l.name)}
          struck={!!struck?.includes(l.name)}
          {...(isBought(l) && { onItem })}
        />
      ))}
      <Rule />
      <Row
        amount={receipt.total ?? total(lines)}
        className="text-xs font-semibold"
      >
        SUM{receipt.currency && ` ${receipt.currency}`}
      </Row>
      <div className="flex justify-between gap-3 text-muted-foreground">
        <span>
          {total(
            lines
              .filter((l) => l.amount > 0 && !l.fee)
              .map((l) => ({ amount: l.unit ? 1 : l.qty })),
          )}{" "}
          varer
        </span>
        {saved > 0 && <span>Du sparte {ORE.format(saved)}</span>}
      </div>
      {!!receipt.payments?.length && (
        <div className="mt-2">
          {receipt.payments.map((p) => (
            <Row key={p.label} amount={p.amount}>
              {p.label}
            </Row>
          ))}
        </div>
      )}
    </div>
  );
};

export const ReceiptLines = ({
  receipt,
  marked,
  struck,
  onItem,
}: SlipProps) => (
  <section className="text-xs">
    <h3 className="flex flex-wrap items-baseline gap-x-1.5 font-medium text-muted-foreground">
      Receipt
      {receipt.source === "price" && (
        <span className="font-normal">guessed from the price</span>
      )}
      {receipt.source === "gmail" && !receipt.lines.length && (
        <span className="font-normal">
          {receipt.store} · {fmtDateTime(receipt.at)}
        </span>
      )}
    </h3>
    {receipt.source === "gmail" && (
      <div className="flex items-center justify-between gap-3 py-2">
        <span className="min-w-0 wrap-break-word">
          {receipt.title || "(no subject)"}
        </span>
        <Button variant="outline" size="sm" asChild>
          <a
            href={`https://mail.google.com/mail/u/0/#all/${receipt.id}`}
            target="_blank"
            rel="noreferrer"
          >
            Open in Gmail
            <Icon icon={ExternalLinkIcon} size={12} />
          </a>
        </Button>
      </div>
    )}
    {!!receipt.lines.length && (
      <div className={receipt.source === "gmail" ? "pt-1" : "pt-2"}>
        <Slip
          receipt={receipt}
          marked={marked}
          struck={struck}
          onItem={onItem}
        />
      </div>
    )}
  </section>
);
