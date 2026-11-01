import type { BulkFile } from "../../core/bulkRules.ts";
import { merchantOf } from "../../core/select.ts";
import type { Categorized } from "../../core/types.ts";
import { fmtNOKExact } from "./format.ts";
import { CategoryIcon, CloseIcon, EditIcon, Icon } from "./icons.ts";
import { Button } from "./ui/button.tsx";
import { Checkbox } from "./ui/checkbox.tsx";

interface BulkToolbarProps {
  txns: Categorized[];
  picked: Categorized[];
  onBulk: (txns: Categorized[], file: BulkFile) => void;
  onClear: () => void;
}

interface BulkSelectAllProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
}

export const BulkSelectAll = ({ checked, onChange }: BulkSelectAllProps) => (
  <Checkbox
    aria-label="Select all transactions"
    checked={checked}
    onCheckedChange={(c) => onChange(c === true)}
    className="align-middle"
  />
);

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
  txns,
  picked,
  onBulk,
  onClear,
}: BulkToolbarProps) => {
  const targets = picked.length > 0 ? picked : txns;
  return (
    <div className="flex flex-wrap items-center justify-end gap-1">
      {picked.length > 0 && (
        <Button
          variant="secondary"
          size="sm"
          aria-live="polite"
          onClick={onClear}
        >
          {picked.length} selected
          <Icon icon={CloseIcon} size={12} />
        </Button>
      )}
      <Button
        variant="ghost"
        size="sm"
        onClick={() => onBulk(targets, "payees")}
      >
        <Icon icon={EditIcon} size={14} />
        Rename payees
      </Button>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => onBulk(targets, "preferences")}
      >
        <Icon icon={CategoryIcon} size={14} />
        Change category
      </Button>
    </div>
  );
};
