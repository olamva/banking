import type { BulkFile } from "../../core/bulkRules.ts";
import { merchantOf } from "../../core/select.ts";
import type { Categorized } from "../../core/types.ts";
import { fmtNOKExact } from "./format.ts";
import {
  type IconSvgElement,
  CategoryIcon,
  CloseIcon,
  CountryIcon,
  EditIcon,
  ExcludeIcon,
  FilterIcon,
  HideIcon,
  Icon,
  MoreIcon,
  PeopleIcon,
  RecurringIcon,
} from "./icons.ts";
import { Button } from "./ui/button.tsx";
import { Checkbox } from "./ui/checkbox.tsx";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu.tsx";

const MORE: [BulkFile, IconSvgElement, string][] = [
  ["countries", CountryIcon, "Change country…"],
  ["family", PeopleIcon, "Mark as family…"],
  ["subscriptions", RecurringIcon, "Mark as subscription…"],
  ["not-subscriptions", ExcludeIcon, "Not a subscription…"],
];

interface BulkToolbarProps {
  picked: Categorized[];
  onBulk: (txns: Categorized[], file: BulkFile) => void;
  onPayees?: (payees: string[], hide: boolean) => void;
  onClear: () => void;
}

interface BulkSelectAllProps {
  label: string;
  txns: Categorized[];
  selected: Set<Categorized>;
  onSelect: (selected: Set<Categorized>) => void;
}

export const BulkSelectAll = ({
  label,
  txns,
  selected,
  onSelect,
}: BulkSelectAllProps) => {
  const count = txns.filter((t) => selected.has(t)).length;
  return (
    <Checkbox
      aria-label={label}
      checked={
        count > 0 && count === txns.length
          ? true
          : count > 0
            ? "indeterminate"
            : false
      }
      onCheckedChange={(c) => {
        const next = new Set(selected);
        for (const t of txns) {
          if (c === true) next.add(t);
          else next.delete(t);
        }
        onSelect(next);
      }}
      className="align-middle"
    />
  );
};

interface BulkCheckboxProps {
  txn: Categorized;
  selected: Set<Categorized>;
  onSelect: (selected: Set<Categorized>) => void;
}

export const BulkCheckbox = ({
  txn,
  selected,
  onSelect,
}: BulkCheckboxProps) => (
  <Checkbox
    aria-label={`Select ${merchantOf(txn)} on ${txn.date}, ${fmtNOKExact(txn.amount)}`}
    checked={selected.has(txn)}
    onClick={(e) => e.stopPropagation()}
    onCheckedChange={(c) => {
      const next = new Set(selected);
      if (c === true) next.add(txn);
      else next.delete(txn);
      onSelect(next);
    }}
    className="align-middle"
  />
);

export const BulkToolbar = ({
  picked,
  onBulk,
  onPayees,
  onClear,
}: BulkToolbarProps) => {
  if (picked.length === 0) return null;
  const payees = [...new Set(picked.map(merchantOf))];
  return (
    <div className="flex flex-wrap items-center gap-1 max-sm:order-last max-sm:basis-full">
      <Button
        variant="secondary"
        size="sm"
        aria-live="polite"
        onClick={onClear}
      >
        {picked.length} selected
        <Icon icon={CloseIcon} size={12} />
      </Button>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => onBulk(picked, "payees")}
      >
        <Icon icon={EditIcon} size={14} />
        Rename<span className="max-sm:hidden">payees</span>
      </Button>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => onBulk(picked, "categories")}
      >
        <Icon icon={CategoryIcon} size={14} />
        <span className="sm:hidden">Category</span>
        <span className="max-sm:hidden">Change category</span>
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-sm" aria-label="More bulk actions">
            <Icon icon={MoreIcon} size={14} />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-max">
          {MORE.map(([file, icon, label]) => (
            <DropdownMenuItem key={file} onSelect={() => onBulk(picked, file)}>
              <Icon icon={icon} size={14} />
              {label}
            </DropdownMenuItem>
          ))}
          {onPayees && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => onPayees(payees, false)}>
                <Icon icon={FilterIcon} size={14} />
                Show only {payees.length === 1 ? "this payee" : "these payees"}
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => onPayees(payees, true)}>
                <Icon icon={HideIcon} size={14} />
                Hide {payees.length === 1 ? "this payee" : "these payees"}
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
};
