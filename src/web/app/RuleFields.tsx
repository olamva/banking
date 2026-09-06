import { useEffect, useMemo, useState } from "react";
import { compile } from "../../core/match.ts";
import {
  CATEGORY_VALUED,
  isMapFile,
  type RuleFile,
} from "../../core/ruleFiles.ts";
import { merchantOf } from "../../core/select.ts";
import type { Categorized } from "../../core/types.ts";
import { AMOUNT_SIZE_EXACT, BUTTON, DataTable } from "./Cards.tsx";
import type { RulesApi } from "./data.ts";
import {
  categoryColor,
  fmtDate,
  fmtNOKExact,
  pairLabel,
  rowLabel,
} from "./format.ts";
import {
  CloseIcon,
  DropdownIcon,
  ErrorIcon,
  Icon,
  InfoIcon,
  LoadingIcon,
} from "./icons.ts";
import { TxnDialog } from "./Transactions.tsx";

export const KEY_LABEL: Record<RuleFile, string> = {
  categories: "Pattern",
  preferences: "Conditions",
  giro: "Pattern",
  payees: "Pattern",
  countries: "Pattern",
  labels: "Slug",
  family: "Name or account number",
  subscriptions: "Pattern",
  "not-subscriptions": "Pattern",
};

export const VALUE_LABEL: Record<RuleFile, string> = {
  categories: "category/sub",
  preferences: "category/sub",
  giro: "category/sub",
  payees: "Name",
  countries: "Country",
  labels: "Name",
  family: "",
  subscriptions: "",
  "not-subscriptions": "",
};

export const FIELD =
  "min-w-0 rounded-md border border-line bg-page px-2 py-1.5 text-[13px] text-ink";

export const CELL =
  "min-w-0 rounded-md border border-transparent bg-transparent px-2 py-1 text-[13px] text-ink hover:border-line focus:border-line focus:bg-page";

export { BUTTON } from "./Cards.tsx";

interface RemoveButtonProps {
  onClick: () => void;
  disabled: boolean;
  label: string;
  size: number;
}

export const RemoveButton = ({
  onClick,
  disabled,
  label,
  size,
}: RemoveButtonProps) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    aria-label={`Remove ${label}`}
    className="relative shrink-0 rounded p-1 text-ink-muted before:absolute before:-inset-2 hover:bg-hover hover:text-ink disabled:opacity-60"
  >
    <Icon icon={CloseIcon} size={size} />
  </button>
);

// A pattern is longer than its box, and an input hides the rest of it behind a
// sideways scroll. A textarea wraps, and `field-sizing: content` gives it the
// height that the wrapped text needs. Enter keeps the meaning it has on an
// input: it submits the form, or it commits the field through the blur.
export const PatternField = ({
  className = "",
  onChange,
  onKeyDown,
  ...props
}: React.ComponentProps<"textarea">) => (
  <textarea
    rows={1}
    spellCheck={false}
    onChange={(e) => {
      // A pasted line break reaches a textarea. An input drops it, and a rule
      // holds one line.
      e.currentTarget.value = e.currentTarget.value.replace(/[\r\n]+/g, " ");
      onChange?.(e);
    }}
    onKeyDown={(e) => {
      if (e.key !== "Enter") return onKeyDown?.(e);
      e.preventDefault();
      const form = e.currentTarget.form;
      if (form) form.requestSubmit();
      else e.currentTarget.blur();
    }}
    className={`field-sizing-content resize-none wrap-anywhere ${className}`}
    {...props}
  />
);

interface MatchNoteProps {
  pattern: string;
  txns: Categorized[];
  haystacks: string[];
}

interface MatchTableProps {
  txns: Categorized[];
  loading: boolean;
}

export const MatchTable = ({ txns, loading }: MatchTableProps) => {
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
const PatternMatchNote = ({ pattern, txns, haystacks }: MatchNoteProps) => {
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

export const MatchNote = (props: MatchNoteProps) =>
  props.txns.some((t) => t.originalCounterparty === undefined) ? (
    <p className="text-xs text-ink-muted">
      Rebuild saved transactions to preview matches.
    </p>
  ) : (
    <PatternMatchNote {...props} />
  );

interface CategoryInputProps {
  value: string;
  pairs: string[];
  label: string;
  className: string;
  dropUp?: boolean;
  onChange: (value: string) => void;
  onCommit?: (value: string) => void;
}

export const CategoryInput = ({
  value,
  pairs,
  label,
  className,
  dropUp = false,
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
        icon={DropdownIcon}
        size={14}
        className="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 text-ink-muted"
      />
      {open && shown.length > 0 && (
        <div
          className={`absolute left-0 z-20 max-h-72 w-full overflow-y-auto rounded-md border border-line bg-surface p-1.5 shadow-lg ${dropUp ? "bottom-full mb-1" : "mt-1"}`}
        >
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

export const rowsFor = (map: boolean): string =>
  `sm:grid sm:items-center sm:gap-2 ${
    map ? "sm:grid-cols-[1.4fr_1fr_auto]" : "sm:grid-cols-[1fr_auto]"
  }`;

export const Entry = ({ file, entryKey, value, rules }: EntryProps) => (
  <li
    className={`flex flex-wrap items-center gap-2 border-b border-line py-1 last:border-0 ${rowsFor(value !== null)}`}
  >
    <PatternField
      key={entryKey}
      defaultValue={entryKey}
      aria-label={KEY_LABEL[file]}
      onBlur={(e) => {
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
        onBlur={(e) => {
          const next = e.target.value.trim();
          if (next && next !== value) rules.save(file, entryKey, next);
        }}
        onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
        className={`${CELL} flex-1 basis-40 text-ink-soft`}
      />
    )}
    <RemoveButton
      onClick={() => rules.remove(file, entryKey)}
      disabled={rules.busy}
      label={entryKey}
      size={14}
    />
  </li>
);

interface AddFormProps {
  file: RuleFile;
  rules: RulesApi;
  txns: Categorized[];
  haystacks: string[];
  pairs: string[];
}

export const AddForm = ({
  file,
  rules,
  txns,
  haystacks,
  pairs,
}: AddFormProps) => {
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
        <PatternField
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
