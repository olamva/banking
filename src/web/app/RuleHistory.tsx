import type { RuleChange, RuleFile } from "../../core/ruleFiles.ts";
import { Note } from "./Cards.tsx";
import { versionAt, type RulesApi } from "./data.ts";
import {
  AddedIcon,
  ChangedIcon,
  GoToVersionIcon,
  Icon,
  InfoIcon,
  RedoIcon,
  RemovedIcon,
  UndoIcon,
} from "./icons.ts";
import { Button } from "./ui/button.tsx";
import { cn } from "./ui/utils.ts";

const fmtStamp = (at: number): string =>
  new Date(at).toLocaleString("nb-NO", {
    timeZone: "Europe/Oslo",
    dateStyle: "medium",
    timeStyle: "short",
  });

interface ChangeProps {
  change: RuleChange;
  file: RuleFile;
}

const Change = ({ change: { key, from, to }, file }: ChangeProps) => {
  const gone = to === undefined;
  const value = gone ? from : from === undefined ? to : `${from} → ${to}`;
  return (
    <li className="flex min-w-0 flex-wrap items-baseline gap-x-1.5 text-[11px]">
      <Icon
        icon={gone ? RemovedIcon : from === undefined ? AddedIcon : ChangedIcon}
        size={11}
        className={`shrink-0 self-center ${gone ? "text-destructive" : "text-chart-1"}`}
      />
      <span className="min-w-0 break-words text-foreground [overflow-wrap:anywhere]">
        {key}
      </span>
      {value && (
        <span className="min-w-0 truncate text-muted-foreground">{value}</span>
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
interface HistoryProps {
  file: RuleFile;
  rules: RulesApi;
}

export const History = ({ file, rules }: HistoryProps) => {
  const data = rules.data;
  const versions = data?.history[file] ?? [];
  const at = data?.at[file] ?? null;
  if (!data || versions.length === 0) return null;

  // A live file that matches no version reads as -1, so undo steps to the
  // newest version and redo has nowhere to go.
  const here = versionAt(data, file);
  const ahead = Math.max(here, 0);

  return (
    <section className="flex max-h-115 min-w-0 flex-col rounded-xl bg-card p-4 ring-1 ring-foreground/10 lg:sticky lg:top-(--header-bottom) lg:max-h-[calc(100dvh-var(--header-bottom)-1.5rem)]">
      <div className="mb-2 flex shrink-0 flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-sm font-medium">
          <Icon
            icon={GoToVersionIcon}
            size={16}
            className="text-muted-foreground"
          />
          History
          <span className="text-xs font-normal text-muted-foreground tabular-nums">
            {versions.length}
          </span>
        </h3>
        <div className="flex gap-1">
          <Button
            variant="outline"
            size="icon-sm"
            onClick={() => rules.undo(file)}
            disabled={rules.busy || versions[here + 1] === undefined}
            aria-label="Undo"
            title="Undo"
          >
            <Icon icon={UndoIcon} size={14} />
          </Button>
          <Button
            variant="outline"
            size="icon-sm"
            onClick={() => rules.redo(file)}
            disabled={rules.busy || ahead === 0}
            aria-label="Redo"
            title="Redo"
          >
            <Icon icon={RedoIcon} size={14} />
          </Button>
        </div>
      </div>
      {ahead > 0 && (
        <Note icon={InfoIcon} className="mb-2 shrink-0">
          The next edit drops the {ahead} version(s) above this point.
        </Note>
      )}
      <ol className="min-h-0 flex-1 overflow-y-auto pr-1">
        {versions.map(({ at: version, changes }, i) => (
          <li
            key={version}
            className={cn(
              "flex flex-wrap items-start justify-between gap-x-3 gap-y-1 border-b py-2 last:border-0",
              i < ahead && "opacity-50",
            )}
          >
            <div className="min-w-0 flex-1 basis-40">
              <p
                className={cn(
                  "flex items-center gap-1.5 text-xs",
                  version === at ? "font-medium" : "text-muted-foreground",
                )}
              >
                {fmtStamp(version)}
                {version === at && (
                  <span className="rounded-full bg-primary px-1.5 text-[10px] font-medium text-primary-foreground">
                    Now
                  </span>
                )}
              </p>
              {changes.length === 0 ? (
                <p className="text-[11px] text-muted-foreground">
                  First version.
                </p>
              ) : (
                <ul className="mt-0.5">
                  {changes.slice(0, CHANGES_SHOWN).map((change) => (
                    <Change key={change.key} change={change} file={file} />
                  ))}
                  {changes.length > CHANGES_SHOWN && (
                    <li className="text-[11px] text-muted-foreground">
                      and {changes.length - CHANGES_SHOWN} more line(s).
                    </li>
                  )}
                </ul>
              )}
            </div>
            {version !== at && (
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => rules.restore(file, version)}
                disabled={rules.busy}
                aria-label={`Go to the version from ${fmtStamp(version)}`}
                title="Go to this version"
              >
                <Icon icon={GoToVersionIcon} size={14} />
              </Button>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
};
