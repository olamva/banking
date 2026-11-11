import type { RuleFile } from "../../core/ruleFiles.ts";
import { merchantOf } from "../../core/select.ts";
import type { Categorized } from "../../core/types.ts";
import {
  ID_FIELD,
  bankLabel,
  categoryColor,
  fmtDate,
  fmtNOKExact,
  rowLabel,
  txnFields,
} from "./format.ts";
import { CategoryIcon, EditIcon, Icon } from "./icons.ts";
import { ReceiptLines } from "./ReceiptLines.tsx";
import { Badge } from "./ui/badge.tsx";
import { Button } from "./ui/button.tsx";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "./ui/sheet.tsx";

interface TxnDialogProps {
  txn: Categorized;
  onClose: () => void;
  onFile?: (file: RuleFile) => void;
}

const TXN_RULE_ACTIONS: [RuleFile, string][] = [
  ["categories", "Category rule…"],
  ["payees", "Rename payee…"],
  ["family", "Mark as family…"],
];

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

const ROW = "flex items-baseline justify-between gap-4 py-2";

export const TxnDialog = ({ txn, onClose, onFile }: TxnDialogProps) => {
  const bank = bankLabel(txn);

  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="gap-0 overflow-y-auto data-[side=right]:w-full data-[side=right]:sm:max-w-md">
        <SheetHeader className="gap-3 border-b pr-12">
          <div className="min-w-0">
            <SheetTitle className="truncate text-lg font-semibold">
              {merchantOf(txn)}
            </SheetTitle>
            <SheetDescription className="mt-1 flex flex-wrap items-center gap-x-1.5 text-xs">
              <span
                className="font-medium"
                style={{ color: categoryColor(txn.category) }}
              >
                {rowLabel(txn.category, txn.subcategory)}
              </span>
              <span aria-hidden>·</span>
              <span>{txn.account}</span>
              <span aria-hidden>·</span>
              <span>{fmtDate(txn.date)}</span>
            </SheetDescription>
          </div>
          <div
            className={`text-3xl font-semibold tracking-tight tabular-nums ${txn.amount > 0 ? "text-good" : ""}`}
          >
            {fmtNOKExact(txn.amount)}
          </div>
          {(txn.excluded ||
            txn.isSubscription ||
            txn.isRecurring ||
            txn.isPending ||
            txn.country) && (
            <div className="flex flex-wrap gap-1.5">
              {txn.country &&
                (onFile ? (
                  <Badge variant="outline" asChild>
                    <button type="button" onClick={() => onFile("countries")}>
                      {txn.country}
                      <Icon icon={EditIcon} size={11} />
                    </button>
                  </Badge>
                ) : (
                  <Badge variant="outline">{txn.country}</Badge>
                ))}
              {txn.excluded && <Badge variant="secondary">Excluded</Badge>}
              {txn.isSubscription && (
                <Badge variant="secondary">Subscription</Badge>
              )}
              {txn.isRecurring && <Badge variant="secondary">Recurring</Badge>}
              {txn.isPending && (
                <Badge variant="outline" className="border-dashed">
                  Pending
                </Badge>
              )}
            </div>
          )}
        </SheetHeader>
        <div className="space-y-5 p-4">
          {onFile && (
            <section>
              <h3 className="mb-2 text-xs font-medium text-muted-foreground">
                Rules
              </h3>
              <div className="flex flex-wrap gap-1.5">
                {[
                  ...TXN_RULE_ACTIONS,
                  txn.isSubscription
                    ? (["not-subscriptions", "Not a subscription…"] as const)
                    : (["subscriptions", "Mark as subscription…"] as const),
                ].map(([file, label]) => (
                  <Button
                    key={file}
                    variant="outline"
                    size="sm"
                    onClick={() => onFile(file)}
                  >
                    <Icon icon={CategoryIcon} size={14} />
                    {label}
                  </Button>
                ))}
              </div>
            </section>
          )}
          {txn.receipt && <ReceiptLines receipt={txn.receipt} />}
          <dl className="divide-y text-xs">
            {txn.categorySource && (
              <div className={ROW}>
                <dt className="shrink-0 text-muted-foreground">
                  Classification
                </dt>
                <dd className="min-w-0 text-right">{txn.categorySource}</dd>
              </div>
            )}
            {bank && (
              <div className={ROW}>
                <dt className="shrink-0 text-muted-foreground">
                  Bank category
                </dt>
                <dd className="min-w-0 text-right">
                  <div className="text-sm wrap-break-word">{bank[0]}</div>
                  <div className="font-mono text-[11px] break-all text-muted-foreground">
                    {bank[1]}
                  </div>
                </dd>
              </div>
            )}
            {txnFields(txn, SHOWN_ABOVE).map(([name, value]) => (
              <div key={name} className={ROW}>
                <dt className="shrink-0 text-muted-foreground">{name}</dt>
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
      </SheetContent>
    </Sheet>
  );
};
