import { useDeferredValue, useMemo, useState } from "react";
import { haystackOf } from "../../core/match.ts";
import {
  CATEGORY_VALUED,
  RULE_FILES,
  isMapFile,
  type RuleFile,
  type Rules,
} from "../../core/ruleFiles.ts";
import type { Categorized } from "../../core/types.ts";
import { SearchBox } from "./Transactions.tsx";
import type { RulesApi } from "./data.ts";
import {
  AddedIcon,
  CloseIcon,
  Icon,
  LoadingIcon,
} from "./icons.ts";
import { Modal } from "./Modal.tsx";
import { keyboardFocused } from "./Shortcuts.tsx";

export const RULE_LABEL: Record<RuleFile, string> = {
  categories: "Categories",
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
    "Pattern to category. It beats every rule but the excluded flag, so it is the one to reach for first.",
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

const entriesOf = (rules: Rules): [string, string | null][] =>
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
  VALUE_LABEL,
  rowsFor,
} from "./RuleFields.tsx";
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
              className="min-w-20 max-w-full flex-1 bg-transparent px-2 py-1 font-mono text-xs text-ink outline-none"
            />
            <button
              type="button"
              onClick={() => rules.remove(file, key)}
              disabled={rules.busy}
              aria-label={`Remove ${key}`}
              className="relative shrink-0 rounded p-1 text-ink-muted before:absolute before:-inset-2 hover:text-ink disabled:opacity-60"
            >
              <Icon aria-hidden icon={CloseIcon} size={12} />
            </button>
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
              className="min-w-20 max-w-full flex-1 bg-transparent px-2 py-1 font-mono text-xs text-ink outline-none"
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
            <Icon aria-hidden icon={AddedIcon} size={12} />
          </button>
        )}
      </div>
    </li>
  );
};

// What one version did to the file. A stamp alone says when somebody edited a
// rule. It never says which rule, which is the whole question.
import { History } from "./RuleHistory.tsx";
export interface RuleTabsProps {
  rules: RulesApi;
  file: RuleFile;
  onFile: (file: RuleFile) => void;
}

// The tabs sit in the header, so they stay on the screen while the rules
// scroll. Wraps rather than scrolls sideways. Eight names do not fit 375px in
// one row, and nothing on this page may push it.
export const RuleTabs = ({ rules, file, onFile }: RuleTabsProps) => {
  const data = rules.data;
  const counts = useMemo(
    (): Record<string, number> =>
      data
        ? Object.fromEntries(
            RULE_FILES.map((f) => [f, entriesOf(data.files[f]).length]),
          )
        : {},
    [data],
  );

  const moveTab = (e: React.KeyboardEvent<HTMLButtonElement>, at: number) => {
    const by = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    if (!by || !keyboardFocused(e.currentTarget)) return;
    e.preventDefault();
    const next = (at + by + RULE_FILES.length) % RULE_FILES.length;
    onFile(RULE_FILES[next]!);
    e.currentTarget.parentElement
      ?.querySelectorAll<HTMLButtonElement>("[role=tab]")
      [next]?.focus({ preventScroll: true });
  };

  return (
    <div
      role="tablist"
      aria-label="Rule files"
      className="flex flex-wrap gap-1.5"
    >
      {RULE_FILES.map((f, i) => (
        <button
          key={f}
          type="button"
          role="tab"
          aria-selected={file === f}
          tabIndex={file === f ? 0 : -1}
          onClick={() => onFile(f)}
          onKeyDown={(e) => moveTab(e, i)}
          className={`rounded-md border border-line px-2.5 py-1.5 text-[13px] ${
            file === f ? "bg-series-1 text-white" : "bg-page text-ink-soft"
          }`}
        >
          {RULE_LABEL[f]}
          {counts[f] !== undefined && (
            <span className="ml-1.5 text-[11px] opacity-70">{counts[f]}</span>
          )}
        </button>
      ))}
    </div>
  );
};

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
  // payees.json holds 580 lines, and each one draws two fields. A held arrow
  // steps through eight files faster than that draws, so the body follows one
  // step behind and React drops the states it cannot reach in time. The tabs
  // above answer at once, because they are not this list.
  // ponytail: no windowing. One file still draws whole. Window the list like
  // DataTable when one of these files reaches a few thousand lines.
  const file = useDeferredValue(chosen);
  const [find, setFind] = useState("");
  const haystacks = useMemo(() => txns.map(haystackOf), [txns]);
  const data = rules.data;
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

  return (
    <section className="flex min-w-0 flex-col">
      <p className="mb-3 text-sm text-ink-muted">{RULE_NOTE[file]}</p>

      {data === null ? (
        <div className="flex items-center justify-center gap-2 py-10 text-ink-muted">
          <Icon
            aria-hidden
            icon={LoadingIcon}
            size={16}
            className="animate-spin"
          />
          Loading…
        </div>
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
              <div className="py-8 text-center text-ink-muted">
                {entries.length === 0
                  ? "No rules in this file yet."
                  : "No rule matches that."}
              </div>
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
  rules: RulesApi;
  txns: Categorized[];
  pairs: string[];
  onClose: () => void;
}

export const FileDialog = ({
  txn,
  rules,
  txns,
  pairs,
  onClose,
}: FileDialogProps) => {
  const [pattern, setPattern] = useState(() => suggestPattern(txn));
  const [value, setValue] = useState(
    txn.subcategory ? `${txn.category}/${txn.subcategory}` : txn.category,
  );
  const haystacks = useMemo(() => txns.map(haystackOf), [txns]);
  const ready = pattern.trim() !== "" && value.trim() !== "";

  return (
    <Modal onClose={onClose} className="w-[min(960px,92vw)]">
      <form
        method="dialog"
        className="flex flex-col gap-3 p-5"
        onSubmit={() => {
          if (ready) rules.save("categories", pattern.trim(), value.trim());
        }}
      >
        <h2 className="text-base font-semibold">Recategorize</h2>
        <p className="text-[11px] text-ink-muted">
          This adds a category override for every row that matches the pattern.
        </p>

        <label className="flex flex-col gap-1 text-xs text-ink-soft">
          Pattern
          <PatternField
            value={pattern}
            onChange={(e) => setPattern(e.target.value)}
            className={`${FIELD} font-mono`}
          />
        </label>
        <MatchNote pattern={pattern} txns={txns} haystacks={haystacks} />

        <div className="flex flex-col gap-1 text-xs text-ink-soft [&>div]:basis-auto">
          Category
          <CategoryInput
            value={value}
            pairs={pairs}
            label="Category"
            onChange={setValue}
            className={FIELD}
          />
        </div>

        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className={BUTTON}>
            Cancel
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
