import { useMemo, useState } from "react";
import { bulkChanges, bulkPlan, type BulkFile } from "../../core/bulkRules.ts";
import { plural } from "../../core/plural.ts";
import { merchantOf } from "../../core/select.ts";
import type { Categorized } from "../../core/types.ts";
import type { RulesApi } from "./data.ts";
import { rowLabel, splitPair } from "./format.ts";
import { FIELD, MatchTable, CategoryInput } from "./RuleFields.tsx";
import { Button } from "./ui/button.tsx";
import { Input } from "./ui/input.tsx";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "./ui/dialog.tsx";

const NAME_NOTE = "Match the imported payee name.";
const EXCLUDED_SKIP = " because of exclusions or missing payment details.";
const NAME_SKIP = " because they have no imported payee name.";

const COPY: Record<
  BulkFile,
  {
    title: string;
    target: string;
    field?: string;
    note: string;
    skip: string;
    saved: string;
    to: (value: string) => string;
  }
> = {
  payees: {
    title: "Give them one name",
    target: "one name",
    field: "New payee name",
    note: "Match the complete imported description, payee, and recipient account. New names take priority over existing payee patterns.",
    skip: ".",
    saved: "Payee names saved.",
    to: (value) => value,
  },
  categories: {
    title: "Choose one category",
    target: "one category",
    field: "New category",
    note: `${NAME_NOTE} New categories take priority over existing category patterns. Exclusions still apply.`,
    skip: EXCLUDED_SKIP,
    saved: "Categories saved.",
    to: (value) => rowLabel(...splitPair(value)),
  },
  countries: {
    title: "Choose one country",
    target: "one country",
    field: "New country",
    note: `${NAME_NOTE} New countries take priority over existing country patterns and the card name.`,
    skip: NAME_SKIP,
    saved: "Countries saved.",
    to: (value) => value,
  },
  family: {
    title: "Mark them as family",
    target: "family",
    note: `${NAME_NOTE} Money in becomes family deposits and money out becomes peer payments. Category and giro rules still take priority.`,
    skip: EXCLUDED_SKIP,
    saved: "Family rules saved.",
    to: () => "family",
  },
  subscriptions: {
    title: "Mark them as subscriptions",
    target: "subscription",
    note: `${NAME_NOTE} Not a subscription rules still take priority.`,
    skip: NAME_SKIP,
    saved: "Subscription rules saved.",
    to: () => "subscriptions",
  },
  "not-subscriptions": {
    title: "Mark them as not subscriptions",
    target: "not a subscription",
    note: `${NAME_NOTE} The rows leave Subscriptions & recurring.`,
    skip: NAME_SKIP,
    saved: "Not a subscription rules saved.",
    to: () => "not subscriptions",
  },
};

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
  const valued = COPY[file].field !== undefined;
  const [value, setValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [failed, setFailed] = useState(false);
  const plan = useMemo(
    () => bulkPlan(selected, all, file),
    [selected, all, file],
  );
  const changed = plan.matches.filter((t) =>
    bulkChanges(t, file, value.trim()),
  ).length;
  const stale = selected.some((t) => t.originalCounterparty === undefined);
  const query = new URLSearchParams({ file, value: value.trim() });
  for (const key of plan.keys) query.append("key", key);
  const tooLarge = query.toString().length > 7000;
  const ready =
    (!valued || value.trim()) &&
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
    <Dialog open onOpenChange={(o) => !o && close()}>
      <DialogContent className="max-h-[88dvh] overflow-y-auto pb-0 sm:max-w-3xl">
        <form
          className="min-w-0 space-y-4"
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
          <div className="space-y-1.5">
            <DialogDescription className="text-xs font-medium">
              Bulk edit · {selected.length} selected
            </DialogDescription>
            <DialogTitle className="text-lg font-semibold">
              {COPY[file].title}
            </DialogTitle>
          </div>
          {saved ? (
            <div role="status" className="border-y py-4 text-sm">
              <p className="font-semibold">{COPY[file].saved}</p>
              <p className="mt-1 wrap-anywhere">
                {plural(changed, "transaction")}{" "}
                {changed === 1 ? "changes" : "change"} to{" "}
                {COPY[file].to(value.trim())}
                .
              </p>
              <p className="mt-2 text-xs text-muted-foreground">
                Use rule history to undo this entire edit.
              </p>
            </div>
          ) : (
            <BulkPreview
              selected={selected}
              all={all}
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
          <div className="sticky bottom-0 -mx-4 flex flex-wrap justify-end gap-2 border-t bg-popover p-4">
            {saved ? (
              <>
                <Button
                  type="button"
                  variant="outline"
                  disabled={rules.busy}
                  onClick={() => {
                    rules.undo(file);
                    onClose();
                  }}
                >
                  Undo this edit
                </Button>
                <Button type="button" onClick={onClose}>
                  Done
                </Button>
              </>
            ) : (
              <>
                <Button
                  type="button"
                  variant="outline"
                  disabled={saving}
                  onClick={close}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={!ready}>
                  {saving
                    ? "Saving…"
                    : `Apply to ${plan.matches.length} transactions`}
                </Button>
              </>
            )}
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};

interface BulkPreviewProps extends Pick<
  BulkTransactionsProps,
  "selected" | "all" | "file" | "pairs" | "rules"
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
  all,
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
  const copy = COPY[file];
  const names = [...new Set(selected.map(merchantOf))];
  const options =
    file === "payees"
      ? Object.values(rules.data?.files.payees ?? {})
      : file === "countries"
        ? all.flatMap((t) => t.country ?? [])
        : [];
  return (
    <>
      <div>
        <p className="mb-2 text-xs text-muted-foreground">
          {plural(names.length, "payee name")} → {copy.target}
        </p>
        <div className="flex max-h-24 flex-wrap gap-1.5 overflow-y-auto">
          {names.map((name) => (
            <span
              key={name}
              className="max-w-full rounded-md border bg-background px-2 py-1 text-xs wrap-anywhere"
            >
              {name}
            </span>
          ))}
        </div>
      </div>
      {copy.field && (
        <label className="block space-y-1 text-sm">
          <span>{copy.field}</span>
          {file === "categories" ? (
            <fieldset disabled={saving}>
              <CategoryInput
                label={copy.field}
                value={value}
                pairs={pairs}
                onChange={setValue}
                className={FIELD}
              />
            </fieldset>
          ) : (
            <Input
              autoFocus
              className={`${FIELD} w-full`}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder={`Enter one ${file === "payees" ? "name" : "country"} for these payees`}
              list="bulk-options"
              disabled={saving}
            />
          )}
        </label>
      )}
      <datalist id="bulk-options">
        {[...new Set(options)].sort().map((name) => (
          <option key={name} value={name} />
        ))}
      </datalist>
      <div className="space-y-2 text-xs text-muted-foreground">
        <p>{copy.note}</p>
        <p>
          Save rules for matching past and future transactions. Filters do not
          limit these rules.
        </p>
        {plan.skipped > 0 && (
          <p>
            {plural(plan.skipped, "selected transaction")} cannot change
            {copy.skip}
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
        className="flex flex-wrap gap-x-5 gap-y-2 border-y py-3 text-sm tabular-nums"
        aria-live="polite"
      >
        <span>
          <strong>{plan.matches.length}</strong> matching
        </span>
        <span>
          <strong>{plan.outside}</strong> outside selection
        </span>
        <span>
          <strong>{!copy.field || value.trim() ? changed : 0}</strong> changes
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
