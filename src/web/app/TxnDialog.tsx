import type { ReactNode } from "react";
import type { Receipt } from "../../core/receipts.ts";
import type { RuleFile } from "../../core/ruleFiles.ts";
import { merchantOf } from "../../core/select.ts";
import type { Categorized } from "../../core/types.ts";
import {
  ID_FIELD,
  bankLabel,
  categoryColor,
  fmtDate,
  fmtDateTime,
  fmtNOKExact,
  rowLabel,
  txnFields,
} from "./format.ts";
import {
  CategoryIcon,
  CloseIcon,
  EditIcon,
  ExternalLinkIcon,
  Icon,
  ReceiptIcon,
} from "./icons.ts";
import { Modal } from "./Modal.tsx";

interface TxnDialogProps {
  txn: Categorized;
  onClose: () => void;
  onFile?: (file: RuleFile) => void;
}

const TXN_RULE_ACTIONS: [RuleFile, string][] = [
  ["preferences", "Remember category…"],
  ["categories", "Category pattern…"],
  ["payees", "Rename payee…"],
  ["family", "Mark as family…"],
];

const Chip = ({
  children,
  onClick,
  dashed,
}: {
  children: ReactNode;
  onClick?: () => void;
  dashed?: boolean;
}) => {
  const Element = onClick ? "button" : "span";
  return (
    <Element
      type={onClick ? "button" : undefined}
      onClick={onClick}
      className={`inline-flex items-center gap-1 flex-row rounded-full border px-2 py-0.5 text-[11px] text-ink-soft ${dashed ? "border-dashed border-ink-muted" : "border-line"} ${onClick ? "hover:bg-hover hover:text-ink" : ""}`}
    >
      {children}
    </Element>
  );
};

const SHOWN_ABOVE = [
  "date",
  "amount",
  "counterparty",
  "country",
  "account",
  "category",
  "subcategory",
  "excluded",
  "isSubscription",
  "isRecurring",
  "isPending",
  "bankCategory",
  "bankSub",
  "bankCategoryName",
  "bankSubName",
  "bankConfidence",
  "categorySource",
  "receipt",
];

const DOT = (
  <span aria-hidden className="text-ink-muted">
    ·
  </span>
);

const ROW =
  "flex items-baseline justify-between gap-4 border-b border-line py-1.5 last:border-0";

const ReceiptLines = ({ receipt }: { receipt: Receipt }) => (
  <section className="mb-4 text-xs">
    <h3 className="flex flex-wrap items-baseline gap-x-1.5 border-b border-line pb-1.5 font-semibold">
      <Icon
        icon={ReceiptIcon}
        size={14}
        className="shrink-0 self-center text-ink-soft"
      />
      Receipt
      <span className="font-normal text-ink-soft">
        {receipt.store} · {fmtDateTime(receipt.at)}
      </span>
    </h3>
    {receipt.source === "gmail" ? (
      <a
        href={`https://mail.google.com/mail/u/0/#all/${receipt.id}`}
        target="_blank"
        rel="noreferrer"
        className={`${ROW} hover:underline`}
      >
        <span className="min-w-0 wrap-break-word">
          {receipt.title || "(no subject)"}
        </span>
        <span className="flex shrink-0 items-center gap-1 text-ink-soft">
          Open in Gmail
          <Icon icon={ExternalLinkIcon} size={12} />
        </span>
      </a>
    ) : (
      <ul>
        {receipt.lines.map((line, i) => (
          <li key={i} className={ROW}>
            <span className="min-w-0 wrap-break-word">
              {line.qty > 1 && (
                <span className="text-ink-soft">{line.qty} × </span>
              )}
              {line.name}
            </span>
            <span className="shrink-0 tabular-nums">
              {fmtNOKExact(line.amount)}
            </span>
          </li>
        ))}
      </ul>
    )}
  </section>
);

export const TxnDialog = ({ txn, onClose, onFile }: TxnDialogProps) => {
  const bank = bankLabel(txn);

  return (
    <Modal
      onClose={onClose}
      className="max-h-[80vh] w-[min(560px,92vw)] overflow-y-auto"
    >
      <div className="sticky top-0 z-10 flex items-start gap-3 border-b border-line bg-surface px-5 py-4">
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-base font-semibold">
            {merchantOf(txn)}
          </h2>
          <div className="mt-1 flex flex-wrap items-center gap-x-1.5 text-xs text-ink-soft">
            <span
              className="font-medium"
              style={{ color: categoryColor(txn.category) }}
            >
              {rowLabel(txn.category, txn.subcategory)}
            </span>
            {DOT}
            <span>{txn.account}</span>
            {DOT}
            <span>{fmtDate(txn.date)}</span>
          </div>
        </div>
        <div
          className={`text-xl font-semibold tabular-nums whitespace-nowrap ${txn.amount > 0 ? "text-good" : ""}`}
        >
          {fmtNOKExact(txn.amount)}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="-m-1 shrink-0 rounded p-1 text-ink-muted hover:bg-hover hover:text-ink"
        >
          <Icon icon={CloseIcon} size={16} />
        </button>
      </div>
      <div className="px-5 py-4">
        {onFile && (
          <div className="mb-3 flex flex-wrap gap-1.5">
            {[
              ...TXN_RULE_ACTIONS,
              txn.isSubscription
                ? (["not-subscriptions", "Not a subscription…"] as const)
                : (["subscriptions", "Mark as subscription…"] as const),
            ].map(([file, label]) => (
              <button
                key={file}
                type="button"
                onClick={() => onFile(file)}
                className="flex items-center gap-1.5 rounded-md border border-line bg-page px-2.5 py-1.5 text-xs text-ink-soft"
              >
                <Icon icon={CategoryIcon} size={14} />
                {label}
              </button>
            ))}
          </div>
        )}
        {(txn.excluded ||
          txn.isSubscription ||
          txn.isRecurring ||
          txn.isPending ||
          txn.country) && (
          <div className="mb-3 flex flex-wrap gap-1.5">
            {txn.country && (
              <Chip onClick={onFile ? () => onFile("countries") : undefined}>
                {txn.country}
                {onFile && <Icon icon={EditIcon} size={11} />}
              </Chip>
            )}
            {txn.excluded && <Chip>Excluded</Chip>}
            {txn.isSubscription && <Chip>Subscription</Chip>}
            {txn.isRecurring && <Chip>Recurring</Chip>}
            {txn.isPending && <Chip dashed>Pending</Chip>}
          </div>
        )}
        {txn.receipt && <ReceiptLines receipt={txn.receipt} />}
        <dl className="text-xs">
          {txn.categorySource && (
            <div className={ROW}>
              <dt className="shrink-0 text-ink-soft">Classification</dt>
              <dd className="min-w-0 text-right">{txn.categorySource}</dd>
            </div>
          )}
          {bank && (
            <div className={ROW}>
              <dt className="shrink-0 text-ink-soft">Bank category</dt>
              <dd className="min-w-0 text-right">
                <div className="text-sm wrap-break-word">{bank[0]}</div>
                <div className="font-mono text-[11px] break-all text-ink-muted">
                  {bank[1]}
                </div>
              </dd>
            </div>
          )}
          {txnFields(txn, SHOWN_ABOVE).map(([name, value]) => (
            <div key={name} className={ROW}>
              <dt className="shrink-0 text-ink-soft">{name}</dt>
              <dd
                className={`min-w-0 text-right ${name === ID_FIELD ? "truncate" : "wrap-break-word"}`}
                title={name === ID_FIELD ? value : undefined}
              >
                {value}
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </Modal>
  );
};
