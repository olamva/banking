import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { compile, haystackOf } from "../../core/match.ts";
import {
  CATEGORY_VALUED,
  RULE_FILES,
  isMapFile,
  type RuleChange,
  type RuleFile,
  type Rules,
} from "../../core/ruleFiles.ts";
import { merchantOf } from "../../core/select.ts";
import type { Categorized } from "../../core/types.ts";
import {
  AMOUNT_SIZE_EXACT,
  Card,
  DataTable,
  SearchBox,
  TxnDialog,
} from "./Cards.tsx";
import type { RulesApi } from "./data.ts";
import {
  categoryColor,
  fmtDate,
  fmtNOKExact,
  pairLabel,
  rowLabel,
} from "./format.ts";
import {
  AddedIcon,
  CategoryIcon,
  ChangedIcon,
  CloseIcon,
  DropdownIcon,
  ErrorIcon,
  GoToVersionIcon,
  Icon,
  InfoIcon,
  LoadingIcon,
  RedoIcon,
  RemovedIcon,
  UndoIcon,
} from "./icons.ts";
import { Modal } from "./Modal.tsx";
import { keyboardFocused } from "./Shortcuts.tsx";

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

// The same button with an icon in place of the word. The name is on aria-label
// and on title, and the pseudo-element widens the tap area without moving the
// column beside it.
const ICON_BUTTON =
  "relative shrink-0 rounded-md border border-line bg-surface p-2 text-ink-soft before:absolute before:-inset-1 disabled:opacity-60";

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
  txns: Categorized[];
  haystacks: string[];
}

interface MatchTableProps {
  txns: Categorized[];
  loading: boolean;
}

const MatchTable = ({ txns, loading }: MatchTableProps) => {
  const [selected, setSelected] = useState<Categorized | null>(null);

  return (
    <div
      className={`mt-2 rounded-md border border-line bg-surface p-2 text-ink transition-opacity ${loading ? "pointer-events-none opacity-70" : ""}`}
    >
      <DataTable
        scroll
        onRow={(i) => setSelected(txns[i] ?? null)}
        columns={[
          { label: "Date", min: true },
          { label: "Merchant / description" },
          { label: "Category", min: true },
          { label: "Account", min: true },
          {
            label: "Amount",
            num: true,
            min: true,
            sizer: AMOUNT_SIZE_EXACT,
          },
        ]}
        rows={txns.map((txn) => [
          fmtDate(txn.date),
          merchantOf(txn),
          <span style={{ color: categoryColor(txn.category) }}>
            {rowLabel(txn.category, txn.subcategory)}
          </span>,
          txn.account,
          fmtNOKExact(txn.amount),
        ])}
      />
      {selected && (
        <TxnDialog txn={selected} onClose={() => setSelected(null)} />
      )}
    </div>
  );
};

// What the pattern claims, before it is saved. A regex that reads as narrow and
// matches four hundred rows is the failure this exists to catch.
const MatchNote = ({ pattern, txns, haystacks }: MatchNoteProps) => {
  const [checkedPattern, setCheckedPattern] = useState(pattern);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setCheckedPattern(pattern), 300);
    return () => window.clearTimeout(timer);
  }, [pattern]);

  const result = useMemo(() => {
    if (!checkedPattern.trim()) return null;
    try {
      const matches = compile(checkedPattern, "pattern");
      return {
        matches: txns.filter((_, i) => matches(haystacks[i] ?? "")),
        error: null,
      };
    } catch (e) {
      return {
        matches: [],
        error: e instanceof Error ? e.message : String(e),
      };
    }
  }, [checkedPattern, haystacks, txns]);

  if (!pattern.trim()) return null;
  const loading = pattern !== checkedPattern || !result;
  const matches = result?.matches ?? [];
  return (
    <div
      aria-busy={loading}
      className={result?.error ? "text-critical" : "text-ink-muted"}
    >
      <div className="flex items-start gap-1.5 text-[11px]">
        <Icon
          aria-hidden
          icon={loading ? LoadingIcon : result?.error ? ErrorIcon : InfoIcon}
          size={12}
          className={`mt-px shrink-0 ${loading ? "animate-spin" : ""}`}
        />
        {loading
          ? "Checking matches…"
          : (result?.error ??
            `Matches ${matches.length} transaction(s) on record.`)}
      </div>
      {!loading && !result?.error && matches.length > 0 && (
        <button
          type="button"
          onClick={() => setOpen(!open)}
          aria-expanded={open}
          className="mt-1 ml-4.5 text-[11px] text-series-1 hover:underline"
        >
          {open ? "Hide" : "Show"} matching transactions
        </button>
      )}
      {open && <MatchTable txns={matches} loading={loading} />}
    </div>
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
  txns: Categorized[];
  haystacks: string[];
  pairs: string[];
}

const AddForm = ({ file, rules, txns, haystacks, pairs }: AddFormProps) => {
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
      <MatchNote pattern={key} txns={txns} haystacks={haystacks} />
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
const Change = ({ change: { key, from, to } }: { change: RuleChange }) => {
  const gone = to === undefined;
  const value = gone ? from : from === undefined ? to : `${from} → ${to}`;
  return (
    <li className="flex min-w-0 flex-wrap items-baseline gap-x-1.5 text-[11px]">
      <Icon
        aria-hidden
        icon={gone ? RemovedIcon : from === undefined ? AddedIcon : ChangedIcon}
        size={11}
        className={`shrink-0 self-center ${gone ? "text-critical" : "text-series-1"}`}
      />
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

// The stack, and the cursor in it. Stepping back costs nothing, so nothing here
// asks before it moves. The next edit is what drops the versions above the
// cursor, and the note below says so before the reader types.
const History = ({ file, rules }: { file: RuleFile; rules: RulesApi }) => {
  const versions = rules.data?.history[file] ?? [];
  const at = rules.data?.at[file] ?? null;
  if (versions.length === 0) return null;

  // A live file that matches no version reads as -1, so undo steps to the
  // newest version and redo has nowhere to go.
  const here = versions.findIndex((v) => v.at === at);
  const ahead = Math.max(here, 0);

  return (
    <section className="mt-4 border-t border-line pt-3 lg:sticky lg:top-[var(--header-bottom)] lg:mt-0 lg:border-t-0 lg:pt-0">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-[11px] font-medium tracking-wide text-ink-soft uppercase">
          History
          <span className="ml-1.5 text-ink-muted normal-case">
            {versions.length}
          </span>
        </h3>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => rules.undo(file)}
            disabled={rules.busy || versions[here + 1] === undefined}
            aria-label="Undo"
            title="Undo"
            className={ICON_BUTTON}
          >
            <Icon aria-hidden icon={UndoIcon} size={14} />
          </button>
          <button
            type="button"
            onClick={() => rules.redo(file)}
            disabled={rules.busy || ahead === 0}
            aria-label="Redo"
            title="Redo"
            className={ICON_BUTTON}
          >
            <Icon aria-hidden icon={RedoIcon} size={14} />
          </button>
        </div>
      </div>
      {ahead > 0 && (
        <p className="mb-2 flex items-start gap-1.5 text-[11px] text-ink-muted">
          <Icon
            aria-hidden
            icon={InfoIcon}
            size={12}
            className="mt-px shrink-0"
          />
          The next edit drops the {ahead} version(s) above this point.
        </p>
      )}
      <ol>
        {versions.map(({ at: version, changes }, i) => (
          <li
            key={version}
            className={`flex flex-wrap items-start justify-between gap-x-3 gap-y-1 border-b border-line py-1.5 last:border-0 ${i < ahead ? "opacity-50" : ""}`}
          >
            <div className="min-w-0 flex-1 basis-40">
              <p
                className={`text-[11px] ${version === at ? "text-ink" : "text-ink-muted"}`}
              >
                {fmtStamp(version)}
                {version === at && " — now"}
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
            {version !== at && (
              <button
                type="button"
                onClick={() => rules.restore(file, version)}
                disabled={rules.busy}
                aria-label={`Go to the version from ${fmtStamp(version)}`}
                title="Go to this version"
                className={ICON_BUTTON}
              >
                <Icon aria-hidden icon={GoToVersionIcon} size={14} />
              </button>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
};

export interface RuleTabsProps {
  rules: RulesApi;
  file: RuleFile;
  onFile: (file: RuleFile) => void;
}

// The tabs sit in the header, so they stay on the screen while the rules
// scroll. Wraps rather than scrolls sideways. Seven names do not fit 375px in
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
  // steps through seven files faster than that draws, so the body follows one
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
    <Card title="Rules" icon={CategoryIcon}>
      <p className="mb-3 text-[11px] text-ink-muted">{RULE_NOTE[file]}</p>

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
    <Modal onClose={onClose} className="w-[min(480px,92vw)]">
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
        <MatchNote pattern={pattern} txns={txns} haystacks={haystacks} />

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
    </Modal>
  );
};
