import { useDeferredValue, useMemo, useState } from "react";
import { haystackOf } from "../../core/match.ts";
import {
  CATEGORY_VALUED,
  isMapFile,
  isRuleFile,
  type RuleFile,
} from "../../core/ruleFiles.ts";
import type { Categorized } from "../../core/types.ts";
import { Empty, Loading, Panel } from "./Cards.tsx";
import { ConflictsView, ReviewView, type Checks } from "./Checks.tsx";
import { SearchBox } from "./SearchBox.tsx";
import type { RulesApi } from "./data.ts";
import { AddedIcon, ErrorIcon, Icon } from "./icons.ts";
import {
  CHECK_ICON,
  RULE_LABEL,
  RULE_NOTE,
  TAB_GROUPS,
  checkTone,
  entriesOf,
  type Check,
  type RuleTab,
} from "./ruleMeta.ts";
import { Badge } from "./ui/badge.tsx";
import { Button } from "./ui/button.tsx";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "./ui/select.tsx";
import {
  AddForm,
  CELL,
  CategoryInput,
  Entry,
  KEY_LABEL,
  PatternField,
  RemoveButton,
  VALUE_LABEL,
  rowsFor,
} from "./RuleFields.tsx";
import { History } from "./RuleHistory.tsx";

const GROUP_FIELD =
  "min-w-20 max-w-full flex-1 bg-transparent px-2 py-1 font-mono text-xs outline-none";

const GROUPED = new Set<RuleTab>([
  "categories",
  "giro",
  "payees",
  "countries",
  "items",
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
    <li className="grid gap-2 border-b py-2.5 last:border-0 sm:grid-cols-[1fr_1.4fr] sm:items-start">
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
          className={`${CELL} w-full text-muted-foreground`}
        />
      )}
      <div className="flex min-w-0 flex-wrap gap-1.5">
        {keys.map((key) => (
          <span
            key={key}
            className="flex min-w-0 max-w-full items-center rounded-md border bg-muted/40"
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
            className="flex min-w-0 max-w-full rounded-md border border-ring bg-background ring-3 ring-ring/30"
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
              className="shrink-0 rounded px-2 text-xs text-muted-foreground disabled:opacity-40"
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
            className="relative rounded-md border border-dashed px-2 py-1.5 text-muted-foreground before:absolute before:-inset-1 hover:border-ring hover:text-foreground"
          >
            <Icon icon={AddedIcon} size={12} />
          </button>
        )}
      </div>
    </li>
  );
};

export interface RulesViewProps {
  rules: RulesApi;
  txns: Categorized[];
  pairs: string[];
  // App owns this, because the page-wide arrows and the tabs in the header
  // both step it.
  file: RuleTab;
  checks: Checks;
}

export const RulesView = ({
  rules,
  txns,
  pairs,
  file: chosen,
  checks,
}: RulesViewProps) => {
  // The largest rule file draws two fields for each entry. A held arrow steps
  // through the eight tabs faster than that draws. The deferred value lets the
  // tabs answer at once and the body follow one step behind.
  const file = useDeferredValue(chosen);
  const [find, setFind] = useState("");
  const haystacks = useMemo(() => txns.map(haystackOf), [txns]);
  const data = rules.data;
  const stale = txns.some((t) => t.originalCounterparty === undefined);
  const entries = data && isRuleFile(file) ? entriesOf(data.files[file]) : [];
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
      <Panel title="Rebuild needed" icon={ErrorIcon}>
        <p className="mb-3 text-sm text-muted-foreground">
          Rebuild saved transactions to use the original payee text. This does
          not contact the bank.
        </p>
        <Button
          variant="outline"
          className="self-start"
          disabled={rules.busy}
          onClick={rules.rebuild}
        >
          Rebuild saved transactions
        </Button>
      </Panel>
    );
  if (file === "review")
    return (
      <ReviewView
        rules={rules}
        txns={txns}
        pairs={pairs}
        groups={checks.review}
      />
    );
  if (file === "conflicts")
    return <ConflictsView conflicts={checks.conflicts} />;

  return (
    <section className="flex min-w-0 flex-col gap-4">
      <p className="text-sm text-muted-foreground">{RULE_NOTE[file]}</p>

      {data === null ? (
        <Loading />
      ) : (
        <div className="grid min-w-0 items-start gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <Panel
            title={RULE_LABEL[file]}
            description={`${entries.length} rule(s)`}
            action={
              <SearchBox
                value={find}
                onChange={setFind}
                placeholder="Find a rule…"
                className="w-36 sm:w-56"
              />
            }
          >
            <AddForm
              file={file}
              rules={rules}
              txns={txns}
              haystacks={haystacks}
              pairs={pairs}
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
                  className={`hidden border-b pb-1.5 text-xs font-medium text-muted-foreground ${grouped ? "sm:grid sm:grid-cols-[1fr_1.4fr] sm:gap-2" : rowsFor(isMapFile(file))}`}
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
          </Panel>

          <History file={file} rules={rules} />
        </div>
      )}
    </section>
  );
};

interface RuleFileSelectProps {
  file: RuleTab;
  onFile: (file: RuleTab) => void;
  counts: Partial<Record<RuleTab, number>>;
}

export const RuleFileSelect = ({
  file,
  onFile,
  counts,
}: RuleFileSelectProps) => (
  <Select value={file} onValueChange={(f) => onFile(f as RuleTab)}>
    <SelectTrigger
      aria-label="Rule file"
      className="min-w-0 flex-1 sm:w-64 sm:flex-none"
    >
      <SelectValue />
    </SelectTrigger>
    <SelectContent position="popper" align="start">
      {TAB_GROUPS.map(([label, files]) => (
        <SelectGroup key={label}>
          <SelectLabel>{label}</SelectLabel>
          {files.map((f) => {
            const tone = checkTone(f, counts[f]);
            return (
              <SelectItem key={f} value={f} className={tone}>
                {f in CHECK_ICON && (
                  <Icon icon={CHECK_ICON[f as Check]} className={tone} />
                )}
                {RULE_LABEL[f]}
                {counts[f] !== undefined && (
                  <Badge
                    variant="secondary"
                    className={`ml-auto h-4.5 px-1.5 tabular-nums ${tone}`}
                  >
                    {counts[f]}
                  </Badge>
                )}
              </SelectItem>
            );
          })}
        </SelectGroup>
      ))}
    </SelectContent>
  </Select>
);
