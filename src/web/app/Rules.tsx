import { useDeferredValue, useMemo, useState } from "react";
import { haystackOf } from "../../core/match.ts";
import { overlaps } from "../../core/narrowings.ts";
import {
  CATEGORY_VALUED,
  isMapFile,
  type RuleFile,
  type Rules,
  type RuleMap,
} from "../../core/ruleFiles.ts";
import type { Categorized } from "../../core/types.ts";
import { Empty, Loading } from "./Cards.tsx";
import { SearchBox } from "./SearchBox.tsx";
import type { RulesApi } from "./data.ts";
import { AddedIcon, BackIcon, Icon } from "./icons.ts";
import { Modal } from "./Modal.tsx";
import { PreferencesView, RememberDialog } from "./Preferences.tsx";

export const RULE_LABEL: Record<RuleFile, string> = {
  categories: "Categories",
  preferences: "Remembered categories",
  giro: "Giro",
  payees: "Payee names",
  countries: "Countries",
  labels: "Category names",
  family: "Family",
  subscriptions: "Subscriptions",
  "not-subscriptions": "Not subscriptions",
};

const RULE_NOTE: Record<RuleFile, string> = {
  categories:
    "Patterns set categories unless an exclusion or a remembered category applies.",
  preferences: "Save a category for an exact payee and payment context.",
  giro: "Pattern to category, on a lump only. A giro or a plain Overførsel, never an instant payment.",
  payees:
    "Pattern to the name on the page. A rename can never move money, so this file is safe to edit.",
  countries:
    "Pattern to the country on the row. It beats the country the code reads off the card name.",
  labels: "Slug to the name on the page. Write the slug as category/sub.",
  family:
    "A relative, by name or by account number. Money in is from family. Money out is a repayment.",
  subscriptions: "A pattern that makes a subscription certain.",
  "not-subscriptions": "A pattern that denies the guess the bank made.",
};

export const entriesOf = (rules: Rules): [string, string | null][] =>
  Array.isArray(rules)
    ? rules.map((key) => [key, null])
    : Object.entries(rules);

import {
  AddForm,
  BUTTON,
  CELL,
  CategoryInput,
  Entry,
  FIELD,
  KEY_LABEL,
  MatchNote,
  PatternField,
  RemoveButton,
  VALUE_LABEL,
  rowsFor,
} from "./RuleFields.tsx";
const GROUP_FIELD =
  "min-w-20 max-w-full flex-1 bg-transparent px-2 py-1 font-mono text-xs text-ink outline-none";

const GROUPED = new Set<RuleFile>([
  "categories",
  "giro",
  "payees",
  "countries",
]);

const groupsOf = (entries: [string, string | null][]) => {
  const groups = new Map<string, string[]>();
  for (const [key, value] of entries) {
    if (value === null) continue;
    const keys = groups.get(value) ?? [];
    keys.push(key);
    groups.set(value, keys);
  }
  return [...groups];
};

interface GroupEntryProps {
  file: RuleFile;
  value: string;
  keys: string[];
  pairs: string[];
  rules: RulesApi;
}

const GroupEntry = ({ file, value, keys, pairs, rules }: GroupEntryProps) => {
  const [next, setNext] = useState(value);
  const [adding, setAdding] = useState(false);
  const [pattern, setPattern] = useState("");
  const commit = (changed: string) => {
    if (changed && changed !== value) rules.saveGroup(file, keys, changed);
  };

  return (
    <li className="grid gap-2 border-b border-line py-2 last:border-0 sm:grid-cols-[1fr_1.4fr] sm:items-start">
      {CATEGORY_VALUED.has(file) ? (
        <CategoryInput
          value={next}
          pairs={pairs}
          label={VALUE_LABEL[file]}
          onChange={setNext}
          onCommit={commit}
          className={CELL}
        />
      ) : (
        <input
          value={next}
          aria-label={VALUE_LABEL[file]}
          onChange={(e) => setNext(e.target.value)}
          onBlur={(e) => commit(e.target.value.trim())}
          onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
          className={`${CELL} w-full text-ink-soft`}
        />
      )}
      <div className="flex min-w-0 flex-wrap gap-1.5">
        {keys.map((key) => (
          <span
            key={key}
            className="flex min-w-0 max-w-full items-center rounded-md border border-line bg-page"
          >
            <PatternField
              defaultValue={key}
              aria-label={KEY_LABEL[file]}
              onBlur={(e) => {
                const changed = e.target.value.trim();
                if (changed && changed !== key)
                  rules.save(file, changed, value, key);
              }}
              className={GROUP_FIELD}
            />
            <RemoveButton
              onClick={() => rules.remove(file, key)}
              disabled={rules.busy}
              label={key}
              size={12}
            />
          </span>
        ))}
        {adding ? (
          <form
            className="flex min-w-0 max-w-full rounded-md border border-series-1 bg-page"
            onSubmit={(e) => {
              e.preventDefault();
              const key = pattern.trim();
              if (!key) return;
              rules.save(file, key, value);
              setPattern("");
              setAdding(false);
            }}
          >
            <PatternField
              autoFocus
              value={pattern}
              onChange={(e) => setPattern(e.target.value)}
              onBlur={() => setAdding(false)}
              onKeyDown={(e) => {
                if (e.key === "Escape") setAdding(false);
              }}
              placeholder={KEY_LABEL[file]}
              aria-label={`New ${KEY_LABEL[file]}`}
              className={GROUP_FIELD}
            />
            <button
              type="submit"
              // Keep the focus in the field, or the blur above collapses the
              // form before the click lands.
              onMouseDown={(e) => e.preventDefault()}
              disabled={!pattern.trim() || rules.busy}
              className="shrink-0 rounded px-2 text-xs text-ink-soft disabled:opacity-40"
            >
              Add
            </button>
          </form>
        ) : (
          <button
            type="button"
            onClick={() => setAdding(true)}
            disabled={rules.busy}
            aria-label={`Add ${KEY_LABEL[file]}`}
            title={`Add ${KEY_LABEL[file]}`}
            className="relative rounded-md border border-dashed border-line px-2 py-1.5 text-ink-muted before:absolute before:-inset-1 hover:border-series-1 hover:text-ink"
          >
            <Icon icon={AddedIcon} size={12} />
          </button>
        )}
      </div>
    </li>
  );
};

import { History } from "./RuleHistory.tsx";

export interface RulesViewProps {
  rules: RulesApi;
  txns: Categorized[];
  pairs: string[];
  // App owns this, because the page-wide arrows and the tabs in the header
  // both step it.
  file: RuleFile;
}

export const RulesView = ({
  rules,
  txns,
  pairs,
  file: chosen,
}: RulesViewProps) => {
  // The largest rule file draws two fields for each entry. A held arrow steps
  // through the eight tabs faster than that draws. The deferred value lets the
  // tabs answer at once and the body follow one step behind.
  // ponytail: no windowing. One file still draws whole. Window the list like
  // DataTable when one of these files reaches a few thousand lines.
  const file = useDeferredValue(chosen);
  const [find, setFind] = useState("");
  const haystacks = useMemo(() => txns.map(haystackOf), [txns]);
  const data = rules.data;
  const categoryRules = data?.files.categories as RuleMap | undefined;
  const payeeRules = data?.files.payees as RuleMap | undefined;
  const categoryConflicts = useMemo(
    () => overlaps(txns, categoryRules ?? {}),
    [txns, categoryRules],
  );
  const payeeConflicts = useMemo(
    () => overlaps(txns, payeeRules ?? {}, true),
    [txns, payeeRules],
  );
  const conflicts = (
    file === "payees"
      ? payeeConflicts
      : file === "categories"
        ? categoryConflicts
        : []
  ).filter((c) => !c.harmless);
  const stale = txns.some((t) => t.originalCounterparty === undefined);
  const entries = data ? entriesOf(data.files[file]) : [];
  const needle = find.trim().toLowerCase();
  const shown = needle
    ? entries.filter(
        ([k, v]) =>
          k.toLowerCase().includes(needle) ||
          (v ?? "").toLowerCase().includes(needle),
      )
    : entries;
  const grouped = GROUPED.has(file);
  const shownGroups = groupsOf(entries).filter(
    ([value, keys]) =>
      !needle ||
      value.toLowerCase().includes(needle) ||
      keys.some((key) => key.toLowerCase().includes(needle)),
  );
  const hasMatches = grouped ? shownGroups.length > 0 : shown.length > 0;

  if (stale)
    return (
      <section className="space-y-3 text-sm">
        <p>
          Rebuild saved transactions to use the original payee text. This does
          not contact the bank.
        </p>
        <button
          type="button"
          className={BUTTON}
          disabled={rules.busy}
          onClick={rules.rebuild}
        >
          Rebuild saved transactions
        </button>
      </section>
    );
  if (file === "preferences")
    return <PreferencesView rules={rules} txns={txns} pairs={pairs} />;

  return (
    <section className="flex min-w-0 flex-col">
      <p className="mb-3 text-sm text-ink-muted">{RULE_NOTE[file]}</p>
      {conflicts.length > 0 && (
        <details className="mb-4 min-w-0 rounded-md border border-line p-3 text-xs">
          <summary className="cursor-pointer text-critical">
            Conflicting rules ({conflicts.length})
          </summary>
          <p className="my-2">
            These rules assign different values to the same transactions. The
            first matching rule wins.
          </p>
          <ul className="space-y-3">
            {conflicts.map((c) => (
              <li
                key={`${c.winner}|${c.loser}`}
                className="break-words [overflow-wrap:anywhere]"
              >
                <p>
                  <code>{c.winner}</code> → {c.winnerValue}
                </p>
                <p>
                  Overrides <code>{c.loser}</code> → {c.loserValue}
                </p>
                <p>{c.rows} matching transaction(s).</p>
              </li>
            ))}
          </ul>
        </details>
      )}

      {data === null ? (
        <Loading />
      ) : (
        <div className="lg:grid lg:grid-cols-[minmax(min(460px,100%),1fr)_20rem] lg:items-start lg:gap-6">
          <div className="min-w-0">
            <AddForm
              file={file}
              rules={rules}
              txns={txns}
              haystacks={haystacks}
              pairs={pairs}
            />

            <SearchBox
              value={find}
              onChange={setFind}
              placeholder="Find a rule…"
            />

            {!hasMatches ? (
              <Empty>
                {entries.length === 0
                  ? "No rules in this file yet."
                  : "No rule matches that."}
              </Empty>
            ) : (
              <>
                <div
                  className={`mt-3 hidden border-b border-line pb-1 text-[11px] text-ink-muted ${grouped ? "sm:grid sm:grid-cols-[1fr_1.4fr] sm:gap-2" : rowsFor(isMapFile(file))}`}
                >
                  {grouped ? (
                    <>
                      <span className="px-2">{VALUE_LABEL[file]}</span>
                      <span className="px-2">{KEY_LABEL[file]}s</span>
                    </>
                  ) : (
                    <>
                      <span className="px-2">{KEY_LABEL[file]}</span>
                      {isMapFile(file) && (
                        <span className="px-2">{VALUE_LABEL[file]}</span>
                      )}
                      <span className="w-6" />
                    </>
                  )}
                </div>
                <ul>
                  {grouped
                    ? shownGroups.map(([value, keys]) => (
                        <GroupEntry
                          key={value}
                          file={file}
                          value={value}
                          keys={keys}
                          pairs={pairs}
                          rules={rules}
                        />
                      ))
                    : shown.map(([k, v]) => (
                        <Entry
                          key={k}
                          file={file}
                          entryKey={k}
                          value={v}
                          rules={rules}
                        />
                      ))}
                </ul>
              </>
            )}
          </div>

          <History file={file} rules={rules} />
        </div>
      )}
    </section>
  );
};

// The card row carries the city and the country after a comma. The first
// segment is the merchant, and that is the pattern a reader wants.
export const suggestPattern = (t: Categorized): string =>
  (t.description.split(",")[0] ?? t.description).trim().toLowerCase();

export interface FileDialogProps {
  txn: Categorized;
  file: RuleFile;
  rules: RulesApi;
  txns: Categorized[];
  pairs: string[];
  onClose: () => void;
}

const PatternDialog = ({
  txn,
  file,
  rules,
  txns,
  pairs,
  onClose,
}: FileDialogProps) => {
  const [pattern, setPattern] = useState(() => suggestPattern(txn));
  const map = isMapFile(file);
  const [value, setValue] = useState(() => {
    if (CATEGORY_VALUED.has(file))
      return txn.subcategory
        ? `${txn.category}/${txn.subcategory}`
        : txn.category;
    if (file === "payees") return txn.counterparty ?? "";
    if (file === "countries") return txn.country ?? "";
    return "";
  });
  const haystacks = useMemo(() => txns.map(haystackOf), [txns]);
  const ready = pattern.trim() !== "" && (!map || value.trim() !== "");

  return (
    <Modal onClose={onClose} className="w-[min(960px,92vw)]">
      <form
        method="dialog"
        className="flex flex-col gap-3 p-5"
        onSubmit={() => {
          if (ready)
            rules.save(file, pattern.trim(), map ? value.trim() : undefined);
        }}
      >
        <h2 className="text-base font-semibold">{RULE_LABEL[file]}</h2>
        <p className="text-[11px] text-ink-muted">{RULE_NOTE[file]}</p>

        <label className="flex flex-col gap-1 text-xs text-ink-soft">
          Pattern
          <PatternField
            value={pattern}
            onChange={(e) => setPattern(e.target.value)}
            className={`${FIELD} font-mono`}
          />
        </label>
        <MatchNote pattern={pattern} txns={txns} haystacks={haystacks} />

        {map && (
          <label className="flex flex-col gap-1 text-xs text-ink-soft [&>div]:basis-auto">
            {VALUE_LABEL[file]}
            {CATEGORY_VALUED.has(file) ? (
              <CategoryInput
                value={value}
                pairs={pairs}
                label={VALUE_LABEL[file]}
                onChange={setValue}
                className={FIELD}
                dropUp
              />
            ) : (
              <input
                value={value}
                onChange={(e) => setValue(e.target.value)}
                className={FIELD}
              />
            )}
          </label>
        )}

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className={`${BUTTON} flex items-center gap-1.5`}
          >
            <Icon icon={BackIcon} size={14} />
            Back
          </button>
          <button
            type="submit"
            disabled={!ready}
            className={`${BUTTON} bg-series-1 text-white`}
          >
            Save
          </button>
        </div>
      </form>
    </Modal>
  );
};

export const FileDialog = (props: FileDialogProps) =>
  props.file === "preferences" ? (
    <RememberDialog {...props} />
  ) : (
    <PatternDialog {...props} />
  );
