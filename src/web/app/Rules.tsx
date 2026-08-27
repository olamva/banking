import { useMemo, useState } from "react";
import { compile, haystackOf } from "../../core/match.ts";
import {
  CATEGORY_VALUED,
  RULE_FILES,
  isMapFile,
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

const PAIRS_ID = "known-category-pairs";

const CategoryList = ({ pairs }: { pairs: string[] }) => (
  // A native datalist, so a phone gets the same completion the desktop gets and
  // a free value is still allowed.
  <datalist id={PAIRS_ID}>
    {pairs.map((p) => (
      <option key={p} value={p}>
        {pairLabel(p)}
      </option>
    ))}
  </datalist>
);

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
    {/* `change` fires on blur and on Enter, so a rename is one write and no
        keystroke is. `defaultValue`, because the value that comes back is the
        one this box sent. */}
    <input
      key={entryKey}
      defaultValue={entryKey}
      aria-label={KEY_LABEL[file]}
      disabled={rules.busy}
      onChange={(e) => {
        const next = e.target.value.trim();
        if (next && next !== entryKey)
          rules.save(file, next, value ?? undefined, entryKey);
      }}
      className={`${CELL} flex-1 basis-40 font-mono`}
    />
    {value !== null && (
      <input
        key={`${entryKey}=${value}`}
        defaultValue={value}
        aria-label={VALUE_LABEL[file]}
        list={CATEGORY_VALUED.has(file) ? PAIRS_ID : undefined}
        disabled={rules.busy}
        onChange={(e) => {
          const next = e.target.value.trim();
          if (next && next !== value) rules.save(file, entryKey, next);
        }}
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
}

const AddForm = ({ file, rules, haystacks }: AddFormProps) => {
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
        {map && (
          <input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={VALUE_LABEL[file]}
            aria-label={VALUE_LABEL[file]}
            list={CATEGORY_VALUED.has(file) ? PAIRS_ID : undefined}
            className={`${FIELD} flex-1 basis-40`}
          />
        )}
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

// Newest first, and the newest holds what the live file holds. Cap the list:
// the whole record is on disk, and a page of two hundred stamps helps nobody.
const SHOWN_VERSIONS = 30;

const History = ({ file, rules }: { file: RuleFile; rules: RulesApi }) => {
  const versions = rules.data?.versions[file] ?? [];
  return (
    <details className="mt-3 border-t border-line pt-3">
      <summary className="cursor-pointer text-xs text-ink-soft">
        History ({versions.length} version
        {versions.length === 1 ? "" : "s"})
      </summary>
      <button
        type="button"
        onClick={() => rules.undo(file)}
        disabled={rules.busy || versions.length < 2}
        className={`${BUTTON} my-2`}
      >
        Undo the last change
      </button>
      <ol className="text-xs">
        {versions.slice(0, SHOWN_VERSIONS).map((at, i) => (
          <li
            key={at}
            className="flex items-center justify-between gap-3 border-b border-line py-1.5 last:border-0"
          >
            <span className={i === 0 ? "text-ink" : "text-ink-soft"}>
              {fmtStamp(at)}
              {i === 0 && " — now"}
            </span>
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
      {versions.length > SHOWN_VERSIONS && (
        <p className="pt-2 text-[11px] text-ink-muted">
          {versions.length - SHOWN_VERSIONS} older version(s) not listed.
        </p>
      )}
    </details>
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

  return (
    <Card title="Rules" icon={CategoryIcon}>
      <CategoryList pairs={pairs} />

      {/* Wraps rather than scrolls sideways. Seven names do not fit 375px in
          one row, and nothing on this page may push it. */}
      <div className="mb-3 flex flex-wrap gap-1.5">
        {RULE_FILES.map((f) => (
          <button
            key={f}
            type="button"
            aria-pressed={file === f}
            onClick={() => setFile(f)}
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
          <AddForm file={file} rules={rules} haystacks={haystacks} />

          <SearchBox
            value={find}
            onChange={setFind}
            placeholder="Find a rule…"
          />

          {shown.length === 0 ? (
            <div className="py-8 text-center text-ink-muted">
              {entries.length === 0
                ? "No rules in this file yet."
                : "No rule matches that."}
            </div>
          ) : (
            <>
              <div
                className={`mt-3 hidden border-b border-line pb-1 text-[11px] text-ink-muted ${rowsFor(isMapFile(file))}`}
              >
                <span className="px-2">{KEY_LABEL[file]}</span>
                {isMapFile(file) && (
                  <span className="px-2">{VALUE_LABEL[file]}</span>
                )}
                <span className="w-6" />
              </div>
              <ul className="max-h-[60vh] overflow-y-auto">
                {shown.map(([k, v]) => (
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

        <CategoryList pairs={pairs} />

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
          <input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            list={PAIRS_ID}
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
