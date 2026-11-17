import { useMemo, useState } from "react";
import { overlaps, type Overlap } from "../../core/narrowings.ts";
import { reviewGroups, type ReviewGroup } from "../../core/review.ts";
import {
  RULE_FILES,
  type RuleFile,
  type RuleMap,
} from "../../core/ruleFiles.ts";
import type { Categorized } from "../../core/types.ts";
import { Empty } from "./Cards.tsx";
import type { RulesApi } from "./data.ts";
import { rowLabel } from "./format.ts";
import { Icon, WarningIcon } from "./icons.ts";
import { Entry } from "./RuleFields.tsx";
import { FileDialog } from "./RuleDialog.tsx";
import { RULE_LABEL, entriesOf, type RuleTab } from "./ruleMeta.ts";
import { Badge } from "./ui/badge.tsx";
import { Button } from "./ui/button.tsx";

export type Conflict = Overlap & { file: RuleFile };

export const CHECKED = ["categories", "payees"] as const;

export const useChecks = (
  rules: RulesApi,
  txns: Categorized[],
  on: boolean,
) => {
  const files = rules.data?.files;
  const conflicts = useMemo(
    (): Conflict[] =>
      on && files
        ? CHECKED.flatMap((file) =>
            overlaps(txns, files[file] as RuleMap, file === "payees")
              .filter((c) => !c.harmless)
              .map((c) => ({ ...c, file })),
          )
        : [],
    [on, files, txns],
  );
  const review = useMemo(() => (on ? reviewGroups(txns) : []), [on, txns]);
  const counts = useMemo(
    (): Partial<Record<RuleTab, number>> =>
      files
        ? {
            ...Object.fromEntries(
              RULE_FILES.map((f) => [f, entriesOf(files[f]).length]),
            ),
            review: review.filter((g) => g.guessed).length,
            conflicts: conflicts.length,
          }
        : {},
    [files, review, conflicts],
  );
  return { conflicts, review, counts };
};

export type Checks = ReturnType<typeof useChecks>;

interface ReviewViewProps {
  rules: RulesApi;
  txns: Categorized[];
  pairs: string[];
  groups: ReviewGroup[];
  search: string;
}

export const ReviewView = ({
  rules,
  txns,
  pairs,
  groups,
  search,
}: ReviewViewProps) => {
  const [limit, setLimit] = useState(30);
  const [selected, setSelected] = useState<Categorized | null>(null);
  const shown = groups.filter(({ txns: [t] }) =>
    `${t!.counterparty ?? ""} ${t!.originalCounterparty ?? ""}`
      .toLowerCase()
      .includes(search),
  );
  return (
    <section className="flex min-w-0 flex-col">
      {shown.length === 0 && (
        <Empty>
          {groups.length === 0
            ? "No payees need review."
            : "No payee matches that."}
        </Empty>
      )}
      <ul>
        {shown.slice(0, limit).map(({ txns: group, guessed }) => {
          const t = group[0]!;
          return (
            <li
              key={`${t.accountKey}|${t.id}`}
              className="flex min-w-0 items-center gap-3 border-b py-2.5 last:border-0"
            >
              <div className="min-w-0 flex-1 space-y-0.5 text-xs [overflow-wrap:anywhere]">
                <p className="flex items-center gap-1.5 text-sm font-medium">
                  {guessed && (
                    <Icon
                      icon={WarningIcon}
                      size={14}
                      className="shrink-0 text-warning"
                    />
                  )}
                  {t.counterparty ?? t.description}
                </p>
                <p className="text-muted-foreground">
                  {t.categorySource} · {t.typeText} ·{" "}
                  {t.amount < 0 ? "Money out" : "Money in"}
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
          Show more payees ({shown.length - limit} left)
        </Button>
      )}
      {selected && (
        <FileDialog
          txn={selected}
          file="categories"
          rules={rules}
          txns={txns}
          pairs={pairs}
          onClose={() => setSelected(null)}
        />
      )}
    </section>
  );
};

export const CONFLICT_SIDES = [
  { label: "Wins", key: "winner", value: "winnerValue" },
  { label: "Overridden", key: "loser", value: "loserValue" },
] as const;

export const conflictRows = (c: Conflict) =>
  `${c.rows} matching transaction(s): ${c.examples.join(", ")}`;

interface ConflictsViewProps {
  conflicts: Conflict[];
  rules: RulesApi;
}

export const ConflictsView = ({ conflicts, rules }: ConflictsViewProps) => (
  <section className="flex min-w-0 flex-col">
    {conflicts.length === 0 && <Empty>No rules conflict.</Empty>}
    <ul>
      {conflicts.map((c) => (
        <li
          key={`${c.file}|${c.winner}|${c.loser}`}
          className="flex min-w-0 flex-col gap-2 border-b py-3 text-xs last:border-0"
        >
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary">{RULE_LABEL[c.file]}</Badge>
            <span className="min-w-0 text-muted-foreground [overflow-wrap:anywhere]">
              {conflictRows(c)}
            </span>
          </div>
          {CONFLICT_SIDES.map((side) => (
            <div key={side.key} className="flex flex-col gap-1">
              <span className="font-medium text-muted-foreground">
                {side.label}
              </span>
              <ul className="[&>li]:flex-nowrap [&>li>:not(button)]:min-w-0 [&>li>:not(button)]:border-input">
                <Entry
                  file={c.file}
                  entryKey={c[side.key]}
                  value={c[side.value]}
                  rules={rules}
                />
              </ul>
            </div>
          ))}
        </li>
      ))}
    </ul>
  </section>
);
