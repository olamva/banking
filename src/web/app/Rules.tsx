import { useMemo, useState } from "react";
import { compile, haystackOf } from "../../core/match.ts";
import {
  CATEGORY_VALUED,
  RULE_FILES,
  isMapFile,
  type RuleChange,
  type RuleFile,
  type Rules,
} from "../../core/ruleFiles.ts";
import type { Categorized } from "../../core/types.ts";
import { Card, SearchBox } from "./Cards.tsx";
import type { RulesApi } from "./data.ts";
import { pairLabel } from "./format.ts";
import {
  CategoryIcon,
  CloseIcon,
  DropdownIcon,
  ErrorIcon,
  Icon,
  InfoIcon,
  LoadingIcon,
} from "./icons.ts";

export const RULE_LABEL: Record<RuleFile, string> = {
  overrides: "Overrides",
  giro: "Giro",
  payees: "Payee names",
  categories: "Category names",
  family: "Family",
  subscriptions: "Subscriptions",
  "not-subscriptions": "Not subscriptions",
};

const RULE_NOTE: Record<RuleFile, string> = {
  overrides:
    "Pattern to category. It beats every rule but the excluded flag, so it is the one to reach for first.",
  giro: "Pattern to category, on a lump only. A giro or a plain Overførsel, never an instant payment.",
  payees:
    "Pattern to the name on the page. A rename can never move money, so this file is safe to edit.",
  categories: "Slug to the name on the page. Write the slug as category/sub.",
  family:
    "A relative, by name or by account number. Money in is from family. Money out is a repayment.",
  subscriptions: "A pattern that makes a subscription certain.",
  "not-subscriptions": "A pattern that denies the guess the bank made.",
};

const KEY_LABEL: Record<RuleFile, string> = {
  overrides: "Pattern",
  giro: "Pattern",
  payees: "Pattern",
  categories: "Slug",
  family: "Name or account number",
  subscriptions: "Pattern",
  "not-subscriptions": "Pattern",
};

const VALUE_LABEL: Record<RuleFile, string> = {
  overrides: "category/sub",
  giro: "category/sub",
  payees: "Name",
  categories: "Name",
  family: "",
  subscriptions: "",
  "not-subscriptions": "",
};

const entriesOf = (r: Rules): [string, string | null][] =>
  Array.isArray(r) ? r.map((k) => [k, null]) : Object.entries(r);

const FIELD =
  "min-w-0 rounded-md border border-line bg-page px-2 py-1.5 text-[13px] text-ink";

const CELL =
  "min-w-0 rounded-md border border-transparent bg-transparent px-2 py-1 text-[13px] text-ink hover:border-line focus:border-line focus:bg-page";

const BUTTON =
  "shrink-0 rounded-md border border-line bg-surface px-2.5 py-1.5 text-xs text-ink-soft disabled:opacity-60";

// Oslo-local, like every other date on the page. UTC would move an evening
// edit into the day before.
const fmtStamp = (at: number): string =>
  new Date(at).toLocaleString("nb-NO", {
    timeZone: "Europe/Oslo",
    dateStyle: "medium",
    timeStyle: "short",
  });

interface MatchNoteProps {
  pattern: string;
  haystacks: string[];
}

// What the pattern claims, before it is saved. A regex that reads as narrow and
// matches four hundred rows is the failure this exists to catch.
const MatchNote = ({ pattern, haystacks }: MatchNoteProps) => {
  const result = useMemo(() => {
    if (!pattern.trim()) return null;
    try {
      const matches = compile(pattern, "pattern");
      return { count: haystacks.filter(matches).length, error: null };
    } catch (e) {
      return { count: 0, error: e instanceof Error ? e.message : String(e) };
    }
  }, [pattern, haystacks]);

  if (!result) return null;
  return (
    <p
      className={`flex items-start gap-1.5 text-[11px] ${result.error ? "text-critical" : "text-ink-muted"}`}
    >
      <Icon
        aria-hidden
        icon={result.error ? ErrorIcon : InfoIcon}
        size={12}
        className="mt-px shrink-0"
      />
      {result.error ?? `Matches ${result.count} transaction(s) on record.`}
    </p>
  );
};

interface CategoryInputProps {
  value: string;
  pairs: string[];
  label: string;
  className: string;
  onChange: (value: string) => void;
  onCommit?: (value: string) => void;
}

const CategoryInput = ({
  value,
  pairs,
  label,
  className,
  onChange,
  onCommit,
}: CategoryInputProps) => {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const q = value.trim().toLowerCase();
  const shown = pairs
    .filter(
      (p) =>
        !q ||
        p.toLowerCase().includes(q) ||
        pairLabel(p).toLowerCase().includes(q),
    )
    .slice(0, 50);
  const choose = (next: string) => {
    onChange(next);
    onCommit?.(next);
    setOpen(false);
  };

  return (
    <div className="relative min-w-0 flex-1 basis-40">
      <input
        value={value}
        aria-label={label}
        placeholder={label}
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          onChange(e.target.value);
          setActive(0);
          setOpen(true);
        }}
        onBlur={(e) => {
          setOpen(false);
          onCommit?.(e.target.value.trim());
        }}
        onKeyDown={(e) => {
          if (
            shown.length > 0 &&
            (e.key === "ArrowDown" || e.key === "ArrowUp")
          ) {
            e.preventDefault();
            const by = e.key === "ArrowDown" ? 1 : -1;
            setActive((active + by + shown.length) % shown.length);
          } else if (e.key === "Enter") {
            e.preventDefault();
            const selected = shown[active];
            if (selected) choose(selected);
            else e.currentTarget.blur();
          } else if (e.key === "Escape") {
            setOpen(false);
          }
        }}
        className={`${className} w-full pr-7`}
      />
      <Icon
        aria-hidden
        icon={DropdownIcon}
        size={14}
        className="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 text-ink-muted"
      />
      {open && shown.length > 0 && (
        <div className="absolute left-0 z-20 mt-1 max-h-72 w-64 max-w-full overflow-y-auto rounded-md border border-line bg-surface p-1.5 shadow-lg">
          {shown.map((pair, i) => (
            <button
              key={pair}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => choose(pair)}
              className={`block w-full rounded px-2 py-1.5 text-left text-xs ${i === active ? "bg-hover" : "hover:bg-hover"}`}
            >
              <span className="block truncate font-mono text-ink">{pair}</span>
              <span className="block truncate text-ink-muted">
                {pairLabel(pair)}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

interface EntryProps {
  file: RuleFile;
  entryKey: string;
  value: string | null;
  rules: RulesApi;
}

const rowsFor = (map: boolean): string =>
  `sm:grid sm:items-center sm:gap-2 ${
    map ? "sm:grid-cols-[1.4fr_1fr_auto]" : "sm:grid-cols-[1fr_auto]"
  }`;

const Entry = ({ file, entryKey, value, rules }: EntryProps) => (
  <li
    className={`flex flex-wrap items-center gap-2 border-b border-line py-1 last:border-0 ${rowsFor(value !== null)}`}
  >
    <input
      key={entryKey}
      defaultValue={entryKey}
      aria-label={KEY_LABEL[file]}
      onBlur={(e) => {
        const next = e.target.value.trim();
        if (next && next !== entryKey)
          rules.save(file, next, value ?? undefined, entryKey);
      }}
      onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
      className={`${CELL} flex-1 basis-40 font-mono`}
    />
    {value !== null && (
      <input
        key={`${entryKey}=${value}`}
        defaultValue={value}
        aria-label={VALUE_LABEL[file]}
        onBlur={(e) => {
          const next = e.target.value.trim();
          if (next && next !== value) rules.save(file, entryKey, next);
        }}
        onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
        className={`${CELL} flex-1 basis-40 text-ink-soft`}
      />
    )}
    <button
      type="button"
      onClick={() => rules.remove(file, entryKey)}
      disabled={rules.busy}
      aria-label={`Remove ${entryKey}`}
      className="relative shrink-0 rounded p-1 text-ink-muted before:absolute before:-inset-2 hover:bg-hover hover:text-ink disabled:opacity-60"
    >
      <Icon aria-hidden icon={CloseIcon} size={14} />
    </button>
  </li>
);

interface AddFormProps {
  file: RuleFile;
  rules: RulesApi;
  haystacks: string[];
  pairs: string[];
}

const AddForm = ({ file, rules, haystacks, pairs }: AddFormProps) => {
  const [key, setKey] = useState("");
  const [value, setValue] = useState("");
  const map = isMapFile(file);
  const ready = key.trim() !== "" && (!map || value.trim() !== "");

  return (
    <form
      className="mb-4 flex flex-col gap-2 rounded-md border border-dashed border-line p-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (!ready) return;
        rules.save(file, key.trim(), map ? value.trim() : undefined);
        setKey("");
        setValue("");
      }}
    >
      <span className="text-[11px] font-medium tracking-wide text-ink-soft uppercase">
        New rule
      </span>
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={key}
          onChange={(e) => setKey(e.target.value)}
          placeholder={KEY_LABEL[file]}
          aria-label={KEY_LABEL[file]}
          className={`${FIELD} flex-1 basis-40 font-mono`}
        />
        {map &&
          (CATEGORY_VALUED.has(file) ? (
            <CategoryInput
              value={value}
              pairs={pairs}
              label={VALUE_LABEL[file]}
              onChange={setValue}
              className={FIELD}
            />
          ) : (
            <input
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder={VALUE_LABEL[file]}
              aria-label={VALUE_LABEL[file]}
              className={`${FIELD} flex-1 basis-40`}
            />
          ))}
        <button
          type="submit"
          disabled={!ready || rules.busy}
          className={`${BUTTON} bg-series-1 text-white`}
        >
          Add
        </button>
      </div>
      <MatchNote pattern={key} haystacks={haystacks} />
    </form>
  );
};

const GROUPED = new Set<RuleFile>(["overrides", "giro", "payees"]);

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
            <input
              defaultValue={key}
              aria-label={KEY_LABEL[file]}
              onBlur={(e) => {
                const changed = e.target.value.trim();
                if (changed && changed !== key)
                  rules.save(file, changed, value, key);
              }}
              onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
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
            <input
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
            className="rounded-md border border-dashed border-line px-2 py-1 text-xs text-ink-muted hover:border-series-1 hover:text-ink"
          >
            +
          </button>
        )}
      </div>
    </li>
  );
};

// What one version did to the file. A stamp alone says when somebody edited a
// rule. It never says which rule, which is the whole question.
const Change = ({ change: { key, from, to } }: { change: RuleChange }) => {
  const gone = to === undefined;
  const value = gone ? from : from === undefined ? to : `${from} → ${to}`;
  return (
    <li className="flex min-w-0 flex-wrap items-baseline gap-x-1.5 text-[11px]">
      <span className={gone ? "text-critical" : "text-series-1"}>
        {gone ? "−" : from === undefined ? "+" : "±"}
      </span>
      <span className="min-w-0 truncate font-mono text-ink">{key}</span>
      {value && (
        <span className="min-w-0 truncate text-ink-muted">{value}</span>
      )}
    </li>
  );
};

// A group save or a restore moves many lines at once. Show a handful and count
// the rest, or one version fills the card.
const CHANGES_SHOWN = 6;

const History = ({ file, rules }: { file: RuleFile; rules: RulesApi }) => {
  const versions = rules.data?.history[file] ?? [];
  if (versions.length === 0) return null;

  return (
    <section className="mt-4 border-t border-line pt-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-[11px] font-medium tracking-wide text-ink-soft uppercase">
          History
        </h3>
        <button
          type="button"
          onClick={() => rules.undo(file)}
          disabled={rules.busy || versions.length < 2}
          className={BUTTON}
        >
          Undo the last change
        </button>
      </div>
      <ol className="max-h-72 overflow-y-auto">
        {versions.map(({ at, changes }, i) => (
          <li
            key={at}
            className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1 border-b border-line py-1.5 last:border-0"
          >
            <div className="min-w-0 flex-1 basis-40">
              <p
                className={`text-[11px] ${i === 0 ? "text-ink" : "text-ink-muted"}`}
              >
                {fmtStamp(at)}
                {i === 0 && " — now"}
              </p>
              {changes.length === 0 ? (
                <p className="text-[11px] text-ink-muted">First version.</p>
              ) : (
                <ul className="mt-0.5">
                  {changes.slice(0, CHANGES_SHOWN).map((change) => (
                    <Change key={change.key} change={change} />
                  ))}
                  {changes.length > CHANGES_SHOWN && (
                    <li className="text-[11px] text-ink-muted">
                      and {changes.length - CHANGES_SHOWN} more line(s).
                    </li>
                  )}
                </ul>
              )}
            </div>
            {i > 0 && (
              <button
                type="button"
                onClick={() => rules.restore(file, at)}
                disabled={rules.busy}
                className={BUTTON}
              >
                Restore
              </button>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
};

const Note = ({ rules }: { rules: RulesApi }) =>
  rules.note === null ? null : (
    <p
      className={`mb-3 flex items-start gap-1.5 text-[11px] ${rules.bad ? "text-critical" : "text-ink-muted"}`}
    >
      <Icon
        aria-hidden
        icon={rules.bad ? ErrorIcon : InfoIcon}
        size={13}
        className="mt-px shrink-0"
      />
      {rules.note}
    </p>
  );

export interface RulesViewProps {
  rules: RulesApi;
  txns: Categorized[];
  pairs: string[];
}

export const RulesView = ({ rules, txns, pairs }: RulesViewProps) => {
  const [file, setFile] = useState<RuleFile>("overrides");
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

  const moveTab = (e: React.KeyboardEvent<HTMLButtonElement>, at: number) => {
    const by = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    if (!by) return;
    e.preventDefault();
    const next = (at + by + RULE_FILES.length) % RULE_FILES.length;
    setFile(RULE_FILES[next]!);
    e.currentTarget.parentElement
      ?.querySelectorAll<HTMLButtonElement>("[role=tab]")
      [next]?.focus();
  };

  return (
    <Card title="Rules" icon={CategoryIcon}>
      {/* Wraps rather than scrolls sideways. Seven names do not fit 375px in
          one row, and nothing on this page may push it. */}
      <div
        role="tablist"
        aria-label="Rule files"
        className="mb-3 flex flex-wrap gap-1.5"
      >
        {RULE_FILES.map((f, i) => (
          <button
            key={f}
            type="button"
            role="tab"
            aria-selected={file === f}
            tabIndex={file === f ? 0 : -1}
            onClick={() => setFile(f)}
            onKeyDown={(e) => moveTab(e, i)}
            className={`rounded-md border border-line px-2.5 py-1.5 text-[13px] ${
              file === f ? "bg-series-1 text-white" : "bg-page text-ink-soft"
            }`}
          >
            {RULE_LABEL[f]}
            {data && (
              <span className="ml-1.5 text-[11px] opacity-70">
                {entriesOf(data.files[f]).length}
              </span>
            )}
          </button>
        ))}
      </div>

      <p className="mb-3 text-[11px] text-ink-muted">{RULE_NOTE[file]}</p>

      <Note rules={rules} />

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
        <>
          <AddForm
            file={file}
            rules={rules}
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
              <ul className="max-h-[60vh] overflow-y-auto">
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

          <History file={file} rules={rules} />
        </>
      )}
    </Card>
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
    <dialog
      ref={(el) => {
        el?.showModal();
      }}
      onClose={onClose}
      className="m-auto w-[min(480px,92vw)] rounded-xl border border-line bg-surface p-0 text-ink shadow-2xl backdrop:bg-black/50"
    >
      <form
        method="dialog"
        className="flex flex-col gap-3 p-5"
        onSubmit={() => {
          if (ready) rules.save("overrides", pattern.trim(), value.trim());
        }}
      >
        <h2 className="text-base font-semibold">File this merchant</h2>
        <p className="text-[11px] text-ink-muted">
          This writes one line in overrides.json. It claims every row the
          pattern matches, not this row alone.
        </p>

        <label className="flex flex-col gap-1 text-xs text-ink-soft">
          Pattern
          <input
            value={pattern}
            onChange={(e) => setPattern(e.target.value)}
            className={`${FIELD} font-mono`}
          />
        </label>
        <MatchNote pattern={pattern} haystacks={haystacks} />

        <label className="flex flex-col gap-1 text-xs text-ink-soft">
          Category
          <CategoryInput
            value={value}
            pairs={pairs}
            label="Category"
            onChange={setValue}
            className={FIELD}
          />
        </label>

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
    </dialog>
  );
};
