import { useMemo, useState } from "react";
import {
  preferenceKey,
  preferenceLabel,
  reviewGroups,
} from "../../core/preferences.ts";
import type { RuleMap } from "../../core/ruleFiles.ts";
import type { Categorized } from "../../core/types.ts";
import { Empty } from "./Cards.tsx";
import type { RulesApi } from "./data.ts";
import { rowLabel, splitPair } from "./format.ts";
import { Modal } from "./Modal.tsx";
import { BUTTON, FIELD, MatchTable, RemoveButton } from "./RuleFields.tsx";
import { History } from "./RuleHistory.tsx";
import { SearchBox } from "./SearchBox.tsx";

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
    <Modal
      onClose={onClose}
      className="max-h-[85dvh] w-[min(960px,92vw)] overflow-y-auto"
    >
      <form
        className="min-w-0 space-y-4 p-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (!ready || key === null) return;
          rules.save("preferences", key, value.trim());
          onClose();
        }}
      >
        <h2 className="text-base font-semibold">Remember category</h2>
        {stale ? (
          <div className="space-y-3 text-sm">
            <p>Rebuild saved transactions to use the original payee text.</p>
            <button
              type="button"
              className={BUTTON}
              disabled={rules.busy}
              onClick={rules.rebuild}
            >
              Rebuild saved transactions
            </button>
          </div>
        ) : txn.excluded ? (
          <p className="text-sm">Excluded transactions keep their exclusion.</p>
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
            <p className="break-words text-xs text-ink-muted [overflow-wrap:anywhere]">
              {preferenceLabel(key)}
            </p>
            <p className="text-xs text-ink-muted">
              The imported payee, payment type, direction, and recipient account
              must match exactly. Display names do not affect matching.
            </p>
            <label className="block space-y-1 text-sm">
              <span>Category</span>
              <select
                aria-label="Category"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                className={`${FIELD} w-full`}
              >
                {[...new Set([value, ...pairs])].map((pair) => (
                  <option key={pair} value={pair}>
                    {rowLabel(...splitPair(pair))}
                  </option>
                ))}
              </select>
            </label>
            <p className="text-xs">
              {matches.length} matching transaction(s). {changed} category
              change(s).
            </p>
            <p className="text-xs text-ink-muted">
              This choice overrides category patterns. Exclusions still apply.
              Undo is available under Remembered categories.
            </p>
            <MatchTable txns={matches} loading={false} />
          </>
        )}
        <div className="sticky bottom-0 flex flex-wrap justify-end gap-2 bg-surface py-2">
          <button type="button" className={BUTTON} onClick={onClose}>
            Cancel
          </button>
          <button
            type="submit"
            disabled={!ready}
            className={`${BUTTON} bg-series-1 text-white`}
          >
            Remember category
          </button>
        </div>
      </form>
    </Modal>
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
      <p className="text-sm text-ink-muted">
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
      <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="lg:order-2">
          <History file="preferences" rules={rules} />
        </div>
        <div className="min-w-0 lg:order-1">
          <h2 className="mb-2 text-sm font-semibold">
            Remembered categories ({entries.length})
          </h2>
          {entries.length === 0 && (
            <Empty>No matching remembered categories.</Empty>
          )}
          <ul className="mb-5">
            {entries.map(([key, value]) => (
              <li
                key={key}
                className="flex min-w-0 flex-wrap items-center gap-2 border-b border-line py-3"
              >
                <p className="min-w-0 flex-1 basis-60 break-words text-xs [overflow-wrap:anywhere]">
                  {preferenceLabel(key)}
                  <br />
                  {rowLabel(...splitPair(value))}
                </p>
                <button
                  type="button"
                  className={BUTTON}
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
                </button>
                <RemoveButton
                  label={preferenceLabel(key)}
                  size={14}
                  disabled={rules.busy}
                  onClick={() => rules.remove("preferences", key)}
                />
              </li>
            ))}
          </ul>
          <h2 className="mb-2 text-sm font-semibold">
            Bank categories and estimates ({shown.length} groups)
          </h2>
          <p className="mb-2 text-xs text-ink-muted">
            These groups have no confirmed category rule. Review is optional.
            The newest groups appear first.
          </p>
          {shown.length === 0 && <Empty>No matching groups need review.</Empty>}
          <ul>
            {shown.slice(0, limit).map((group) => {
              const t = group[0]!;
              return (
                <li
                  key={preferenceKey(t)}
                  className="flex min-w-0 items-center gap-3 border-b border-line py-3"
                >
                  <div className="min-w-0 flex-1 text-xs [overflow-wrap:anywhere]">
                    <p className="font-medium">
                      {t.counterparty ?? t.description}
                    </p>
                    <p className="text-ink-muted">
                      {t.typeText} · {t.amount < 0 ? "Money out" : "Money in"}
                    </p>
                    <p>
                      {rowLabel(t.category, t.subcategory)} · {group.length}{" "}
                      transaction(s) · {t.date}
                    </p>
                  </div>
                  <button
                    type="button"
                    className={BUTTON}
                    disabled={rules.busy}
                    onClick={() => setSelected(t)}
                  >
                    Review
                  </button>
                </li>
              );
            })}
          </ul>
          {shown.length > limit && (
            <button
              type="button"
              className={`${BUTTON} mt-3`}
              onClick={() => setLimit(limit + 30)}
            >
              Show more groups
            </button>
          )}
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
