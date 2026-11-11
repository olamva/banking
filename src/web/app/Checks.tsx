import { useMemo, useState } from "react";
import { overlaps, type Overlap } from "../../core/narrowings.ts";
import { reviewGroups, type ReviewGroup } from "../../core/review.ts";
import type { RuleFile, RuleMap } from "../../core/ruleFiles.ts";
import type { Categorized } from "../../core/types.ts";
import { Empty, Panel } from "./Cards.tsx";
import type { RulesApi } from "./data.ts";
import { rowLabel } from "./format.ts";
import { ErrorIcon, Icon, WarningIcon } from "./icons.ts";
import { FileDialog } from "./RuleDialog.tsx";
import { RULE_LABEL } from "./ruleMeta.ts";
import { SearchBox } from "./SearchBox.tsx";
import { Badge } from "./ui/badge.tsx";
import { Button } from "./ui/button.tsx";

export type Conflict = Overlap & { file: RuleFile };

const CHECKED = ["categories", "payees"] as const;

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
  return { conflicts, review };
};

export type Checks = ReturnType<typeof useChecks>;

export const guessedCount = (review: ReviewGroup[]) =>
  review.filter((g) => g.guessed).length;

interface ReviewViewProps {
  rules: RulesApi;
  txns: Categorized[];
  pairs: string[];
  groups: ReviewGroup[];
}

export const ReviewView = ({ rules, txns, pairs, groups }: ReviewViewProps) => {
  const [search, setSearch] = useState("");
  const [limit, setLimit] = useState(30);
  const [selected, setSelected] = useState<Categorized | null>(null);
  const needle = search.trim().toLowerCase();
  const shown = groups.filter(({ txns: [t] }) =>
    `${t!.counterparty ?? ""} ${t!.originalCounterparty ?? ""}`
      .toLowerCase()
      .includes(needle),
  );
  return (
    <section className="flex min-w-0 flex-col gap-4">
      <p className="text-sm text-muted-foreground">
        These payees have no category rule. The bank or a guess sets their
        category. Save a category rule to confirm one. Guessed categories come
        first.
      </p>
      <SearchBox
        value={search}
        onChange={(value) => {
          setSearch(value);
          setLimit(30);
        }}
        placeholder="Find a payee…"
      />
      <Panel
        title="Payees to review"
        description={`${guessedCount(groups)} guessed · ${groups.length} in total`}
      >
        {shown.length === 0 && <Empty>No payees need review.</Empty>}
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
            Show more payees
          </Button>
        )}
      </Panel>
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

export const ConflictsView = ({ conflicts }: { conflicts: Conflict[] }) => (
  <section className="flex min-w-0 flex-col gap-4">
    <p className="text-sm text-muted-foreground">
      These rules assign different values to the same transactions. They have
      the same number of conditions, so the first matching rule wins. Narrow a
      pattern to fix a conflict.
    </p>
    <Panel
      title="Conflicting rules"
      icon={ErrorIcon}
      description={`${conflicts.length} conflict(s)`}
    >
      {conflicts.length === 0 && <Empty>No rules conflict.</Empty>}
      <ul>
        {conflicts.map((c) => (
          <li
            key={`${c.file}|${c.winner}|${c.loser}`}
            className="space-y-1 border-b py-2.5 text-xs break-words last:border-0 [overflow-wrap:anywhere]"
          >
            <Badge variant="secondary">{RULE_LABEL[c.file]}</Badge>
            <p>
              <code>{c.winner}</code> → {c.winnerValue}
            </p>
            <p>
              Overrides <code>{c.loser}</code> → {c.loserValue}
            </p>
            <p className="text-muted-foreground">
              {c.rows} matching transaction(s): {c.examples.join(", ")}
            </p>
          </li>
        ))}
      </ul>
    </Panel>
  </section>
);
