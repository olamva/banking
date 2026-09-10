import type { BulkFile } from "../../core/bulkRules.ts";
import type { Categorized } from "../../core/types.ts";
import { BUTTON } from "./Cards.tsx";

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
    <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg border border-line bg-surface p-3">
      <div
        className="min-w-0 basis-full text-xs sm:flex-1 sm:basis-auto"
        aria-live="polite"
      >
        <strong>
          {picked.length
            ? `${picked.length} selected`
            : `All ${txns.length} filtered transactions`}
        </strong>
        <p className="mt-1 text-ink-muted">
          {picked.length
            ? "Apply one change to the selected rows."
            : "Edit these results together, or select individual rows."}
        </p>
      </div>
      <button
        type="button"
        className={BUTTON}
        onClick={() => onBulk(targets, "payees")}
      >
        Rename payees
      </button>
      <button
        type="button"
        className={BUTTON}
        onClick={() => onBulk(targets, "preferences")}
      >
        Change category
      </button>
      <button
        type="button"
        className={BUTTON}
        onClick={() =>
          onSelect(picked.length === txns.length ? new Set() : new Set(txns))
        }
      >
        {picked.length === txns.length ? "Clear selection" : "Select all"}
      </button>
      {picked.length > 0 && picked.length < txns.length && (
        <button
          type="button"
          className={BUTTON}
          onClick={() => onSelect(new Set())}
        >
          Clear selection
        </button>
      )}
    </div>
  );
};
