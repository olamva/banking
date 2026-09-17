import type { BulkFile } from "../../core/bulkRules.ts";
import { merchantOf } from "../../core/select.ts";
import type { Categorized } from "../../core/types.ts";
import { fmtNOKExact } from "./format.ts";

const LINK = "hover:text-ink hover:underline";

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
  <label className="flex items-center">
    <input
      type="checkbox"
      className="size-3.5 accent-series-1"
      aria-label="Select all transactions"
      checked={checked}
      onChange={(e) => onChange(e.target.checked)}
    />
  </label>
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
  <label
    className="flex cursor-pointer items-center"
    onClick={(e) => e.stopPropagation()}
  >
    <input
      type="checkbox"
      className="size-3.5 accent-series-1"
      aria-label={`Select ${merchantOf(txn)} on ${txn.date}, ${fmtNOKExact(txn.amount)}`}
      checked={selected.has(txn)}
      onChange={(e) => {
        const next = new Set(selected);
        if (e.target.checked) next.add(txn);
        else next.delete(txn);
        onSelect(next);
      }}
    />
  </label>
);

export const BulkToolbar = ({
  txns,
  picked,
  onBulk,
  onClear,
}: BulkToolbarProps) => {
  const targets = picked.length > 0 ? picked : txns;
  return (
    <span className="ml-auto flex flex-wrap items-center justify-end gap-x-3 gap-y-1 text-xs font-normal text-ink-soft">
      {picked.length > 0 && (
        <button
          type="button"
          aria-live="polite"
          className={`text-ink-muted ${LINK}`}
          onClick={onClear}
        >
          {picked.length} selected ×
        </button>
      )}
      <button
        type="button"
        className={LINK}
        onClick={() => onBulk(targets, "payees")}
      >
        Rename payees
      </button>
      <button
        type="button"
        className={LINK}
        onClick={() => onBulk(targets, "preferences")}
      >
        Change category
      </button>
    </span>
  );
};
