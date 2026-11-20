import { useState, type ComponentProps, type ReactNode } from "react";
import type { RuleFile } from "../../core/ruleFiles.ts";
import { merchantOf, subcategoryOf, type Axis } from "../../core/select.ts";
import type { Categorized } from "../../core/types.ts";
import { Caret } from "./Cards.tsx";
import {
  ID_FIELD,
  bankLabel,
  categoryColor,
  flagOf,
  fmtDate,
  fmtNOKExact,
  rowLabel,
  txnFields,
} from "./format.ts";
import { CardIcon, EditIcon, ExcludeIcon, FilterIcon, Icon } from "./icons.ts";
import { ReceiptLines, type ItemAction } from "./ReceiptLines.tsx";
import { Badge } from "./ui/badge.tsx";
import { Button } from "./ui/button.tsx";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "./ui/collapsible.tsx";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu.tsx";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "./ui/sheet.tsx";
import { cn } from "./ui/utils.ts";

interface TxnDialogProps {
  txn: Categorized;
  marked?: string[];
  struck?: string[];
  onClose: () => void;
  onPick?: (axis: Axis, value: string, exclude: boolean) => void;
  onFile?: (file: RuleFile) => void;
  onItem?: (raw: string, action: ItemAction) => void;
}

const SHOWN_ABOVE = [
  "date",
  "amount",
  "description",
  "counterparty",
  "country",
  "account",
  "typeText",
  "category",
  "subcategory",
  "excluded",
  "reason",
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

interface FactProps {
  label: string;
  sub?: ReactNode;
  edit?: ReactNode;
  children: ReactNode;
}

const Fact = ({ label, sub, edit, children }: FactProps) => (
  <div className="flex min-h-12 items-center gap-3 py-2">
    <dt className="w-24 shrink-0 text-xs text-muted-foreground">{label}</dt>
    <dd className="min-w-0 flex-1">
      <div className="wrap-break-word">{children}</div>
      {sub && (
        <div className="text-xs wrap-break-word text-muted-foreground">
          {sub}
        </div>
      )}
    </dd>
    {edit}
  </div>
);

interface PickMenuProps {
  noun: string;
  label: string;
  onPick?: (exclude: boolean) => void;
  children: ReactNode;
}

const PickMenu = ({ noun, label, onPick, children }: PickMenuProps) => {
  const [open, setOpen] = useState(false);
  if (!onPick) return children;
  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger
        asChild
        onPointerDown={(e) => {
          if (e.pointerType !== "mouse" || e.metaKey) e.preventDefault();
        }}
        onClick={(e) => (e.metaKey ? onPick(true) : setOpen(true))}
      >
        <Button
          variant="ghost"
          className="-mx-1.5 -my-0.5 flex h-auto w-fit max-w-[calc(100%+0.75rem)] justify-start rounded-sm border-0 px-1.5 py-0.5 text-left text-[length:inherit] leading-[inherit] font-[inherit] whitespace-normal active:not-aria-[haspopup]:translate-y-0"
        >
          {children}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        <DropdownMenuLabel className="truncate">{label}</DropdownMenuLabel>
        <DropdownMenuItem onSelect={() => onPick(false)}>
          <Icon icon={FilterIcon} size={15} />
          Filter by this {noun}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onSelect={() => onPick(true)}>
          <Icon icon={ExcludeIcon} size={15} />
          Exclude this {noun}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

const EditButton = ({
  label,
  ...props
}: { label: string } & Omit<ComponentProps<typeof Button>, "children">) => (
  <Button
    variant="ghost"
    size="icon-sm"
    aria-label={label}
    title={label}
    className="shrink-0 text-muted-foreground"
    {...props}
  >
    <Icon icon={EditIcon} size={15} />
  </Button>
);

export const TxnDialog = ({
  txn,
  marked,
  struck,
  onClose,
  onPick,
  onFile,
  onItem,
}: TxnDialogProps) => {
  const bank = bankLabel(txn);
  const fields = txnFields(txn, SHOWN_ABOVE);
  const [advanced, setAdvanced] = useState(false);
  const edit = (file: RuleFile, label: string) =>
    onFile && <EditButton label={label} onClick={() => onFile(file)} />;
  const pickOf = (axis: Axis, value: string) =>
    onPick && ((exclude: boolean) => onPick(axis, value, exclude));

  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          (e.currentTarget as HTMLElement).focus();
          document
            .querySelector("[data-marked]")
            ?.scrollIntoView({ block: "center" });
        }}
        className="gap-0 overflow-y-auto outline-none data-[side=right]:w-full data-[side=right]:sm:max-w-md"
      >
        <SheetHeader className="gap-0 px-5 pt-5 pr-12 pb-6">
          <SheetTitle className="truncate text-base font-medium">
            {merchantOf(txn)}
          </SheetTitle>
          <div
            className={cn(
              "mt-1 text-4xl font-semibold tracking-tight tabular-nums",
              txn.amount > 0 && "text-good",
            )}
          >
            {fmtNOKExact(txn.amount)}
          </div>
          <SheetDescription asChild>
            <div className="mt-3 flex flex-wrap items-center gap-1.5 text-xs">
              <span className="mr-1">{fmtDate(txn.date)}</span>
              {txn.isPending && (
                <Badge
                  variant="outline"
                  className="border-dashed border-muted-foreground/60"
                >
                  Pending
                </Badge>
              )}
              {txn.isRecurring && <Badge variant="secondary">Recurring</Badge>}
              {txn.excluded && <Badge variant="secondary">Excluded</Badge>}
            </div>
          </SheetDescription>
        </SheetHeader>
        <div className="space-y-8 px-5 pb-8">
          <dl className="divide-y border-y text-sm">
            <Fact
              label="Payee"
              sub={
                txn.description !== merchantOf(txn) && (
                  <span className="font-mono text-[11px]">
                    {txn.description}
                  </span>
                )
              }
              edit={edit("payees", "Rename payee")}
            >
              <PickMenu
                noun="payee"
                label={merchantOf(txn)}
                onPick={pickOf("merchants", merchantOf(txn))}
              >
                {merchantOf(txn)}
              </PickMenu>
            </Fact>
            <Fact
              label="Category"
              sub={txn.categorySource && `From ${txn.categorySource}`}
              edit={
                onFile && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <EditButton label="Change category" />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onSelect={() => onFile("categories")}>
                        Category rule…
                      </DropdownMenuItem>
                      <DropdownMenuItem onSelect={() => onFile("family")}>
                        Mark as family…
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )
              }
            >
              <PickMenu
                noun="category"
                label={rowLabel(txn.category, txn.subcategory)}
                onPick={pickOf("categories", subcategoryOf(txn))}
              >
                <span
                  className="font-medium"
                  style={{ color: categoryColor(txn.category) }}
                >
                  {rowLabel(txn.category, txn.subcategory)}
                </span>
              </PickMenu>
            </Fact>
            <Fact label="Account">
              <PickMenu
                noun="account"
                label={txn.account}
                onPick={pickOf("accounts", txn.account)}
              >
                <span className="inline-flex items-center gap-1.5">
                  {txn.card && (
                    <Icon
                      icon={CardIcon}
                      size={14}
                      className="text-muted-foreground"
                    />
                  )}
                  {txn.account}
                </span>
              </PickMenu>
            </Fact>
            {txn.country && (
              <Fact label="Country" edit={edit("countries", "Change country")}>
                <PickMenu
                  noun="country"
                  label={txn.country}
                  onPick={pickOf("countries", txn.country)}
                >
                  <span className="inline-flex items-center gap-2">
                    <span aria-hidden>{flagOf(txn.country)}</span>
                    {txn.country}
                  </span>
                </PickMenu>
              </Fact>
            )}
            {txn.typeText && <Fact label="Type">{txn.typeText}</Fact>}
            <Fact
              label="Subscription"
              edit={
                txn.isSubscription
                  ? edit("not-subscriptions", "Not a subscription")
                  : edit("subscriptions", "Mark as subscription")
              }
            >
              {txn.isSubscription ? "Yes" : "No"}
            </Fact>
            {txn.excluded && txn.reason && (
              <Fact label="Excluded">{txn.reason}</Fact>
            )}
          </dl>
          {txn.receipt && (
            <ReceiptLines
              receipt={txn.receipt}
              marked={marked}
              struck={struck}
              onItem={onItem}
            />
          )}
          <Collapsible open={advanced} onOpenChange={setAdvanced}>
            <CollapsibleTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="-ml-2 text-xs text-muted-foreground aria-expanded:bg-transparent"
              >
                <Caret open={advanced} />
                Advanced
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent asChild>
              <dl className="mt-1 divide-y border-t text-xs">
                {bank && (
                  <div className={ROW}>
                    <dt className="shrink-0 text-muted-foreground">
                      Bank category
                    </dt>
                    <dd className="min-w-0 text-right">
                      <div className="wrap-break-word">{bank[0]}</div>
                      <div className="font-mono text-[11px] break-all text-muted-foreground">
                        {bank[1]}
                      </div>
                    </dd>
                  </div>
                )}
                {fields.map(([name, value]) => (
                  <div key={name} className={ROW}>
                    <dt className="shrink-0 text-muted-foreground">{name}</dt>
                    <dd
                      className={cn(
                        "min-w-0 text-right",
                        name === ID_FIELD ? "truncate" : "wrap-break-word",
                      )}
                      title={name === ID_FIELD ? value : undefined}
                    >
                      {value}
                    </dd>
                  </div>
                ))}
              </dl>
            </CollapsibleContent>
          </Collapsible>
        </div>
      </SheetContent>
    </Sheet>
  );
};
