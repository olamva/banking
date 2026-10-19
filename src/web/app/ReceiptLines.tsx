import type { ReactNode } from "react";
import type { Receipt, ReceiptLine, Saving } from "../../core/receipts.ts";
import { fmtDateTime } from "./format.ts";
import { ExternalLinkIcon, Icon, ReceiptIcon } from "./icons.ts";

const ORE = new Intl.NumberFormat("nb-NO", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const QTY = new Intl.NumberFormat("nb-NO", { maximumFractionDigits: 3 });

const total = (items: { amount: number }[]) =>
  items.reduce((sum, i) => sum + i.amount, 0);

const byLabel = (savings: Saving[]): Saving[] =>
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
  <div className={`flex items-baseline gap-2 ${className}`}>
    <span className="min-w-0 flex-1 wrap-break-word">{children}</span>
    <span className="w-16 shrink-0 text-right">{ORE.format(amount)}</span>
  </div>
);

const Rule = () => (
  <div className="my-2 border-t border-dashed border-ink-muted/60" />
);

const Item = ({ line }: { line: ReceiptLine }) => (
  <div className="py-0.5">
    <div className="uppercase wrap-break-word">{line.name}</div>
    <Row
      amount={line.amount + total(line.discounts ?? []) - (line.deposit ?? 0)}
      className="pl-3"
    >
      <span className="flex flex-wrap justify-between gap-x-3 text-ink-muted">
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
  </div>
);

const Slip = ({ receipt }: { receipt: Receipt }) => {
  const lines = merged(receipt.lines);
  const saved = total(lines.flatMap((l) => l.discounts ?? []));
  return (
    <div className="mx-auto max-w-[380px] rounded-md border border-line bg-page px-4 py-3 font-mono text-[11px] leading-relaxed tabular-nums">
      <div className="text-center font-semibold uppercase">{receipt.store}</div>
      <div className="text-center text-ink-muted">
        {fmtDateTime(receipt.at)}
      </div>
      <Rule />
      {lines.map((l, i) => (
        <Item key={i} line={l} />
      ))}
      <Rule />
      <Row
        amount={receipt.total ?? total(lines)}
        className="text-xs font-semibold"
      >
        SUM
      </Row>
      <div className="flex justify-between gap-3 text-ink-muted">
        <span>
          {total(
            lines
              .filter((l) => l.amount > 0)
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

export const ReceiptLines = ({ receipt }: { receipt: Receipt }) => (
  <section className="mb-4 text-xs">
    <h3 className="flex flex-wrap items-baseline gap-x-1.5 border-b border-line pb-1.5 font-semibold">
      <Icon
        icon={ReceiptIcon}
        size={14}
        className="shrink-0 self-center text-ink-soft"
      />
      Receipt
      {receipt.source === "gmail" && (
        <span className="font-normal text-ink-soft">
          {receipt.store} · {fmtDateTime(receipt.at)}
        </span>
      )}
    </h3>
    {receipt.source === "gmail" ? (
      <div className="flex items-center justify-between gap-3 py-2">
        <span className="min-w-0 wrap-break-word">
          {receipt.title || "(no subject)"}
        </span>
        <a
          href={`https://mail.google.com/mail/u/0/#all/${receipt.id}`}
          target="_blank"
          rel="noreferrer"
          className="flex shrink-0 items-center gap-1.5 rounded-md border border-line bg-page px-2.5 py-1.5 text-ink-soft hover:bg-hover hover:text-ink hover:underline"
        >
          Open in Gmail
          <Icon icon={ExternalLinkIcon} size={12} />
        </a>
      </div>
    ) : (
      <div className="pt-3">
        <Slip receipt={receipt} />
      </div>
    )}
  </section>
);
