import { useMemo } from "react";
import { RULE_FILES, type RuleFile } from "../../core/ruleFiles.ts";
import { RULE_LABEL, entriesOf } from "./Rules.tsx";
import type { RulesApi } from "./data.ts";
import { keyboardFocused } from "./Shortcuts.tsx";

export interface RuleTabsProps {
  rules: RulesApi;
  file: RuleFile;
  onFile: (file: RuleFile) => void;
}

const RULE_GROUPS: [string, RuleFile[]][] = [
  [
    "Transactions",
    ["categories", "giro", "family", "subscriptions", "not-subscriptions"],
  ],
  ["Display", ["payees", "countries", "labels"]],
];
export const RULE_TAB_FILES = RULE_GROUPS.flatMap(([, files]) => files);

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
    const next = (at + by + RULE_TAB_FILES.length) % RULE_TAB_FILES.length;
    onFile(RULE_TAB_FILES[next]!);
    e.currentTarget
      .closest("[role=tablist]")
      ?.querySelectorAll<HTMLButtonElement>("[role=tab]")
      [next]?.focus({ preventScroll: true });
  };

  return (
    <div
      role="tablist"
      aria-label="Rule files"
      className="flex flex-wrap gap-x-5 gap-y-2"
    >
      {RULE_GROUPS.map(([label, files]) => (
        <div key={label} role="group" aria-label={label} className="min-w-0">
          <div className="mb-1 text-[11px] font-medium uppercase tracking-wide text-ink-muted">
            {label}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {files.map((f) => {
              const i = RULE_TAB_FILES.indexOf(f);
              return (
                <button
                  key={f}
                  type="button"
                  role="tab"
                  aria-selected={file === f}
                  tabIndex={file === f ? 0 : -1}
                  onClick={() => onFile(f)}
                  onKeyDown={(e) => moveTab(e, i)}
                  className={`rounded-md border border-line px-2.5 py-1.5 text-[13px] ${
                    file === f
                      ? "bg-series-1 text-white"
                      : "bg-page text-ink-soft"
                  }`}
                >
                  {RULE_LABEL[f]}
                  {counts[f] !== undefined && (
                    <span className="ml-1.5 text-[11px] opacity-70">
                      {counts[f]}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
};
