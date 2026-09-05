import type { RuleChange, RuleFile } from "../../core/ruleFiles.ts";
import type { RulesApi } from "./data.ts";
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

const ICON_BUTTON =
  "relative shrink-0 rounded-md border border-line bg-surface p-2 text-ink-soft before:absolute before:-inset-1 disabled:opacity-60";

const fmtStamp = (at: number): string =>
  new Date(at).toLocaleString("nb-NO", {
    timeZone: "Europe/Oslo",
    dateStyle: "medium",
    timeStyle: "short",
  });

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
export const History = ({
  file,
  rules,
}: {
  file: RuleFile;
  rules: RulesApi;
}) => {
  const versions = rules.data?.history[file] ?? [];
  const at = rules.data?.at[file] ?? null;
  if (versions.length === 0) return null;

  // A live file that matches no version reads as -1, so undo steps to the
  // newest version and redo has nowhere to go.
  const here = versions.findIndex((v) => v.at === at);
  const ahead = Math.max(here, 0);

  return (
    <section className="mt-4 flex max-h-115 flex-col border-t border-line pt-3 lg:sticky lg:top-(--header-bottom) lg:mt-0 lg:max-h-[calc(100dvh-var(--header-bottom)-1.5rem)] lg:border-t-0 lg:pt-0">
      <div className="mb-2 flex shrink-0 flex-wrap items-center justify-between gap-2">
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
        <p className="mb-2 flex shrink-0 items-start gap-1.5 text-[11px] text-ink-muted">
          <Icon
            aria-hidden
            icon={InfoIcon}
            size={12}
            className="mt-px shrink-0"
          />
          The next edit drops the {ahead} version(s) above this point.
        </p>
      )}
      <ol className="min-h-0 flex-1 overflow-y-auto pr-1">
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
