import { useMemo, useState } from "react";
import {
  preferenceKey,
  preferenceLabel,
  reviewGroups,
} from "../../core/preferences.ts";
import type { RuleMap } from "../../core/ruleFiles.ts";
import type { Categorized } from "../../core/types.ts";
import { Empty, Panel } from "./Cards.tsx";
import type { RulesApi } from "./data.ts";
import { rowLabel, splitPair } from "./format.ts";
import {
  CategoryInput,
  FIELD,
  MatchTable,
  RemoveButton,
} from "./RuleFields.tsx";
import { History } from "./RuleHistory.tsx";
import { SearchBox } from "./SearchBox.tsx";
import { Badge } from "./ui/badge.tsx";
import { Button } from "./ui/button.tsx";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "./ui/dialog.tsx";

interface RememberDialogProps {
  txn: Categorized;
  txns: Categorized[];
  pairs: string[];
  rules: RulesApi;
  onClose: () => void;
}

export const RememberDialog = ({
  txn: selected,
  txns,
  pairs,
  rules,
  onClose,
}: RememberDialogProps) => {
  const txn =
    txns.find((t) => t.id === selected.id && t.account === selected.account) ??
    selected;
  const key = preferenceKey(txn);
  const [value, setValue] = useState(
    txn.subcategory ? `${txn.category}/${txn.subcategory}` : txn.category,
  );
  const matches = useMemo(
    () =>
      key === null
        ? []
        : txns.filter((t) => !t.excluded && preferenceKey(t) === key),
    [txns, key],
  );
  const stale = txns.some((t) => t.originalCounterparty === undefined);
  const ready =
    !stale &&
    !txn.excluded &&
    key !== null &&
    value.trim() &&
    !rules.busy &&
    rules.data !== null;
  const changed = matches.filter(
    (t) =>
      (t.subcategory ? `${t.category}/${t.subcategory}` : t.category) !==
      value.trim(),
  ).length;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[88dvh] overflow-y-auto pb-0 sm:max-w-3xl">
        <form
          className="min-w-0 space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (!ready || key === null) return;
            rules.save("preferences", key, value.trim());
            onClose();
          }}
        >
          <DialogTitle>Remember category</DialogTitle>
          <DialogDescription className="sr-only">
            Save a category for an exact payee and payment context.
          </DialogDescription>
          {stale ? (
            <div className="space-y-3 text-sm">
              <p>Rebuild saved transactions to use the original payee text.</p>
              <Button
                type="button"
                variant="outline"
                disabled={rules.busy}
                onClick={rules.rebuild}
              >
                Rebuild saved transactions
              </Button>
            </div>
          ) : txn.excluded ? (
            <p className="text-sm">
              Excluded transactions keep their exclusion.
            </p>
          ) : key === null ? (
            <p className="text-sm">
              This transaction lacks a payee or payment type. Use a category
              pattern instead.
            </p>
          ) : (
            <>
              <p className="text-sm">
                Apply this category to matching past and future transactions.
              </p>
              <p className="break-words text-xs text-muted-foreground [overflow-wrap:anywhere]">
                {preferenceLabel(key)}
              </p>
              <p className="text-xs text-muted-foreground">
                The imported payee, payment type, direction, and recipient
                account must match exactly. Display names do not affect
                matching.
              </p>
              <label className="block space-y-1.5 text-xs font-medium">
                <span>Category</span>
                <CategoryInput
                  label="Category"
                  value={value}
                  pairs={pairs}
                  onChange={setValue}
                  className={`${FIELD} font-normal`}
                />
              </label>
              <p className="text-xs">
                {matches.length} matching transaction(s). {changed} category
                change(s).
              </p>
              <p className="text-xs text-muted-foreground">
                This choice overrides category patterns. Exclusions still apply.
                Undo is available under Remembered categories.
              </p>
              <MatchTable txns={matches} loading={false} />
            </>
          )}
          <div className="sticky bottom-0 -mx-4 flex flex-wrap justify-end gap-2 border-t bg-popover p-4">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={!ready}>
              Remember category
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};

interface PreferencesViewProps {
  rules: RulesApi;
  txns: Categorized[];
  pairs: string[];
}

export const PreferencesView = ({
  rules,
  txns,
  pairs,
}: PreferencesViewProps) => {
  const [search, setSearch] = useState("");
  const [limit, setLimit] = useState(30);
  const [selected, setSelected] = useState<Categorized | null>(null);
  const remembered = (rules.data?.files.preferences ?? {}) as RuleMap;
  const groups = useMemo(
    () => reviewGroups(txns, remembered),
    [txns, remembered],
  );
  const needle = search.trim().toLowerCase();
  const entries = Object.entries(remembered).filter(([key, value]) =>
    `${preferenceLabel(key)} ${value}`.toLowerCase().includes(needle),
  );
  const shown = groups.filter((g) =>
    `${preferenceLabel(preferenceKey(g[0]!)!)} ${g[0]!.counterparty ?? ""}`
      .toLowerCase()
      .includes(needle),
  );
  return (
    <section className="min-w-0 space-y-4">
      <p className="text-sm text-muted-foreground">
        Review matching transactions once and remember their category. No
        pattern is required.
      </p>
      <SearchBox
        value={search}
        onChange={(value) => {
          setSearch(value);
          setLimit(30);
        }}
        placeholder="Find a payee…"
      />
      <div className="grid min-w-0 items-start gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="lg:order-2">
          <History file="preferences" rules={rules} />
        </div>
        <div className="min-w-0 space-y-4 lg:order-1">
          <Panel
            title="Remembered categories"
            description={`${entries.length} saved`}
          >
            {entries.length === 0 && (
              <Empty>No matching remembered categories.</Empty>
            )}
            <ul>
              {entries.map(([key, value]) => (
                <li
                  key={key}
                  className="flex min-w-0 flex-wrap items-center gap-2 border-b py-2.5 last:border-0"
                >
                  <div className="min-w-0 flex-1 basis-60 space-y-1 text-xs [overflow-wrap:anywhere]">
                    <p>{preferenceLabel(key)}</p>
                    <Badge variant="secondary">
                      {rowLabel(...splitPair(value))}
                    </Badge>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={
                      rules.busy ||
                      !txns.some((t) => !t.excluded && preferenceKey(t) === key)
                    }
                    onClick={() =>
                      setSelected(
                        txns.find(
                          (t) => !t.excluded && preferenceKey(t) === key,
                        ) ?? null,
                      )
                    }
                  >
                    Review
                  </Button>
                  <RemoveButton
                    label={preferenceLabel(key)}
                    size={14}
                    disabled={rules.busy}
                    onClick={() => rules.remove("preferences", key)}
                  />
                </li>
              ))}
            </ul>
          </Panel>
          <Panel
            title="Bank categories and estimates"
            description={`${shown.length} groups have no confirmed category rule. Review is optional. The newest groups appear first.`}
          >
            {shown.length === 0 && (
              <Empty>No matching groups need review.</Empty>
            )}
            <ul>
              {shown.slice(0, limit).map((group) => {
                const t = group[0]!;
                return (
                  <li
                    key={preferenceKey(t)}
                    className="flex min-w-0 items-center gap-3 border-b py-2.5 last:border-0"
                  >
                    <div className="min-w-0 flex-1 space-y-0.5 text-xs [overflow-wrap:anywhere]">
                      <p className="text-sm font-medium">
                        {t.counterparty ?? t.description}
                      </p>
                      <p className="text-muted-foreground">
                        {t.typeText} · {t.amount < 0 ? "Money out" : "Money in"}
                      </p>
                      <p>
                        {rowLabel(t.category, t.subcategory)} · {group.length}{" "}
                        transaction(s) · {t.date}
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={rules.busy}
                      onClick={() => setSelected(t)}
                    >
                      Review
                    </Button>
                  </li>
                );
              })}
            </ul>
            {shown.length > limit && (
              <Button
                variant="outline"
                className="mt-3 self-center"
                onClick={() => setLimit(limit + 30)}
              >
                Show more groups
              </Button>
            )}
          </Panel>
        </div>
      </div>
      {selected && (
        <RememberDialog
          txn={selected}
          txns={txns}
          pairs={pairs}
          rules={rules}
          onClose={() => setSelected(null)}
        />
      )}
    </section>
  );
};
