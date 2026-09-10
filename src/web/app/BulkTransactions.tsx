import { useMemo, useState } from "react";
import { bulkPlan, type BulkFile } from "../../core/bulkRules.ts";
import { merchantOf } from "../../core/select.ts";
import type { Categorized } from "../../core/types.ts";
import type { RulesApi } from "./data.ts";
import { rowLabel, splitPair } from "./format.ts";
import { Modal } from "./Modal.tsx";
import { BUTTON, FIELD, MatchTable } from "./RuleFields.tsx";

interface BulkTransactionsProps {
  selected: Categorized[];
  all: Categorized[];
  file: BulkFile;
  pairs: string[];
  rules: RulesApi;
  onClose: () => void;
  onSaved: (file: BulkFile, value: string) => void;
}

export const BulkTransactions = ({
  selected,
  all,
  file,
  pairs,
  rules,
  onClose,
  onSaved,
}: BulkTransactionsProps) => {
  const rename = file === "payees";
  const [value, setValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [failed, setFailed] = useState(false);
  const plan = useMemo(
    () => bulkPlan(selected, all, file),
    [selected, all, file],
  );
  const changed = plan.matches.filter(
    (t) =>
      (rename
        ? merchantOf(t)
        : t.subcategory
          ? `${t.category}/${t.subcategory}`
          : t.category) !== value.trim(),
  ).length;
  const stale = selected.some((t) => t.originalCounterparty === undefined);
  const query = new URLSearchParams({ file, value: value.trim() });
  for (const key of plan.keys) query.append("key", key);
  const tooLarge = query.toString().length > 7000;
  const ready =
    value.trim() &&
    plan.keys.length > 0 &&
    changed > 0 &&
    !stale &&
    !tooLarge &&
    rules.data !== null &&
    !rules.busy &&
    !saving;
  const close = () => {
    if (!saving) onClose();
  };

  return (
    <Modal
      onClose={close}
      className="max-h-[88dvh] w-[min(900px,94vw)] overflow-y-auto"
    >
      <form
        className="min-w-0 space-y-4 p-4 sm:p-5"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!ready || saved) return;
          setSaving(true);
          setFailed(false);
          const ok = await rules.saveBulk(file, plan.keys, value.trim());
          setSaving(false);
          setSaved(ok);
          setFailed(!ok);
          if (ok) onSaved(file, value.trim());
        }}
      >
        <div>
          <p className="mb-1 text-xs font-medium text-ink-muted">
            Bulk edit · {selected.length} selected
          </p>
          <h2 className="text-lg font-semibold">
            {rename ? "Give them one name" : "Choose one category"}
          </h2>
        </div>
        {saved ? (
          <div
            role="status"
            className="rounded-lg border border-line bg-page p-4 text-sm"
          >
            <p className="font-semibold">
              {rename ? "Payee names saved." : "Categories saved."}
            </p>
            <p className="mt-1 wrap-anywhere">
              {changed} transaction(s) change to{" "}
              {rename ? value.trim() : rowLabel(...splitPair(value.trim()))}.
            </p>
            <p className="mt-2 text-xs text-ink-muted">
              Use rule history to undo this entire edit.
            </p>
          </div>
        ) : (
          <BulkPreview
            selected={selected}
            file={file}
            pairs={pairs}
            rules={rules}
            value={value}
            setValue={setValue}
            saving={saving}
            plan={plan}
            changed={changed}
            stale={stale}
            tooLarge={tooLarge}
            failed={failed}
          />
        )}
        <div className="sticky bottom-0 flex flex-wrap justify-end gap-2 bg-surface py-2">
          {saved ? (
            <>
              <button
                type="button"
                className={BUTTON}
                disabled={rules.busy}
                onClick={() => {
                  rules.undo(file);
                  onClose();
                }}
              >
                Undo this edit
              </button>
              <button type="button" className={BUTTON} onClick={onClose}>
                Done
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                className={BUTTON}
                disabled={saving}
                onClick={close}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!ready}
                className={`${BUTTON} bg-series-1 text-white`}
              >
                {saving
                  ? "Saving…"
                  : `Apply to ${plan.matches.length} transactions`}
              </button>
            </>
          )}
        </div>
      </form>
    </Modal>
  );
};

interface BulkPreviewProps extends Pick<
  BulkTransactionsProps,
  "selected" | "file" | "pairs" | "rules"
> {
  value: string;
  setValue: (value: string) => void;
  saving: boolean;
  plan: ReturnType<typeof bulkPlan>;
  changed: number;
  stale: boolean;
  tooLarge: boolean;
  failed: boolean;
}

const BulkPreview = ({
  selected,
  file,
  pairs,
  rules,
  value,
  setValue,
  saving,
  plan,
  changed,
  stale,
  tooLarge,
  failed,
}: BulkPreviewProps) => {
  const rename = file === "payees";
  const names = [...new Set(selected.map(merchantOf))];
  return (
    <>
      <div className="rounded-lg border border-line bg-page p-3">
        <p className="mb-2 text-xs text-ink-muted">
          {names.length} payee name(s) → one {rename ? "name" : "category"}
        </p>
        <div className="flex max-h-24 flex-wrap gap-1.5 overflow-y-auto">
          {names.map((name) => (
            <span
              key={name}
              className="max-w-full rounded border border-line px-2 py-1 text-xs wrap-anywhere"
            >
              {name}
            </span>
          ))}
        </div>
      </div>
      <label className="block space-y-1 text-sm">
        <span>{rename ? "New payee name" : "New category"}</span>
        {rename ? (
          <input
            autoFocus
            className={`${FIELD} w-full`}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="Enter one name for these payees"
            list="bulk-payees"
            disabled={saving}
          />
        ) : (
          <select
            autoFocus
            className={`${FIELD} w-full`}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            disabled={saving}
          >
            <option value="">Choose a category…</option>
            {pairs.map((pair) => (
              <option key={pair} value={pair}>
                {rowLabel(...splitPair(pair))}
              </option>
            ))}
          </select>
        )}
      </label>
      {rename && (
        <datalist id="bulk-payees">
          {[...new Set(Object.values(rules.data?.files.payees ?? {}))]
            .sort()
            .map((name) => (
              <option key={name} value={name} />
            ))}
        </datalist>
      )}
      <div className="space-y-2 text-xs text-ink-muted">
        <p>
          {rename
            ? "Match the complete imported description, payee, and recipient account. New names take priority over existing payee patterns."
            : "Match the imported payee, payment type, direction, and recipient account. Exclusions still apply."}
        </p>
        <p>
          Save rules for matching past and future transactions. Filters do not
          limit these rules.
        </p>
        {plan.skipped > 0 && (
          <p>
            {plan.skipped} selected transaction(s) cannot change
            {rename
              ? "."
              : " because of exclusions or missing payment details."}
          </p>
        )}
        {stale && (
          <p role="alert">
            Rebuild saved transactions from the Rules page before using bulk
            actions.
          </p>
        )}
        {tooLarge && (
          <p role="alert">
            This selection contains too many different conditions. Select fewer
            transactions for one edit.
          </p>
        )}
      </div>
      <div
        className="flex flex-wrap gap-x-5 gap-y-2 rounded-lg border border-line p-3 text-sm"
        aria-live="polite"
      >
        <span>
          <strong>{plan.matches.length}</strong> matching
        </span>
        <span>
          <strong>{plan.outside}</strong> outside selection
        </span>
        <span>
          <strong>{value.trim() ? changed : 0}</strong> changes
        </span>
      </div>
      {plan.outside > 0 && (
        <p className="text-sm">
          This also changes matching transactions outside your selection. Review
          all matches below.
        </p>
      )}
      <details>
        <summary className="cursor-pointer text-sm">
          Review {plan.matches.length} matching transactions
        </summary>
        <MatchTable txns={plan.matches} loading={false} />
      </details>
      {failed && (
        <p role="alert" className="text-sm">
          {rules.note ?? "The edit fails. Try again."}
        </p>
      )}
    </>
  );
};
