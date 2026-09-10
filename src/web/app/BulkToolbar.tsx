import type { BulkFile } from "../../core/bulkRules.ts";
import type { Categorized } from "../../core/types.ts";

const LINK = "hover:text-ink hover:underline";

interface BulkToolbarProps {
  txns: Categorized[];
  picked: Categorized[];
  onBulk: (txns: Categorized[], file: BulkFile) => void;
  onSelect: (selected: Set<Categorized>) => void;
}

export const BulkToolbar = ({
  txns,
  picked,
  onBulk,
  onSelect,
}: BulkToolbarProps) => {
  const targets = picked.length > 0 ? picked : txns;
  return (
    <span className="ml-auto flex flex-wrap items-center justify-end gap-x-3 gap-y-1 text-xs font-normal text-ink-soft">
      <span aria-live="polite" className="text-ink-muted">
        {picked.length > 0 && `${picked.length} selected`}
      </span>
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
      <button
        type="button"
        className={LINK}
        onClick={() =>
          onSelect(picked.length === txns.length ? new Set() : new Set(txns))
        }
      >
        {picked.length === txns.length ? "Clear selection" : "Select all"}
      </button>
      {picked.length > 0 && picked.length < txns.length && (
        <button
          type="button"
          className={LINK}
          onClick={() => onSelect(new Set())}
        >
          Clear selection
        </button>
      )}
    </span>
  );
};
