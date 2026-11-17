import {
  CONFLICT_SIDES,
  conflictRows,
  type Conflict,
} from "./Checks.tsx";
import type { PendingConflicts } from "./conflictGuard.ts";
import { ErrorIcon, Icon } from "./icons.ts";
import { RULE_LABEL } from "./ruleMeta.ts";
import { Badge } from "./ui/badge.tsx";
import { Button } from "./ui/button.tsx";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog.tsx";

interface ConflictCardProps {
  conflict: Conflict;
  fresh: string[];
}

const ConflictCard = ({ conflict: c, fresh }: ConflictCardProps) => (
  <li className="flex flex-col gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-xs dark:bg-destructive/10">
    <Badge variant="destructive">
      <Icon icon={ErrorIcon} size={12} />
      {RULE_LABEL[c.file]}
    </Badge>
    <dl className="grid grid-cols-[auto_minmax(0,1fr)] items-baseline gap-x-3 gap-y-1.5">
      {CONFLICT_SIDES.map((side) => (
        <div key={side.key} className="contents">
          <dt className="text-muted-foreground">{side.label}</dt>
          <dd className="[overflow-wrap:anywhere]">
            <code className="rounded bg-muted px-1 py-0.5 font-mono">
              {c[side.key]}
            </code>{" "}
            → {c[side.value]}
            {fresh.includes(c[side.key]) && (
              <Badge variant="outline" className="ml-1.5">
                New
              </Badge>
            )}
          </dd>
        </div>
      ))}
    </dl>
    <p className="text-muted-foreground [overflow-wrap:anywhere]">
      {conflictRows(c)}
    </p>
  </li>
);

interface ConflictDialogProps {
  pending: PendingConflicts | null;
}

export const ConflictDialog = ({ pending }: ConflictDialogProps) =>
  pending && (
    <Dialog open onOpenChange={(o) => !o && pending.cancel()}>
      <DialogContent className="max-h-[88dvh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <Icon icon={ErrorIcon} size={18} />
            This change makes a rule conflict
          </DialogTitle>
          <DialogDescription className="text-xs">
            Two rules give different values to the same transactions. The first
            rule wins. Remove the other rule now, or save and fix it later in
            Settings › Conflicts.
          </DialogDescription>
        </DialogHeader>
        <ul className="flex flex-col gap-2">
          {pending.conflicts.map((c) => (
            <ConflictCard
              key={`${c.winner}|${c.loser}`}
              conflict={c}
              fresh={pending.keys}
            />
          ))}
        </ul>
        <DialogFooter>
          <Button variant="outline" onClick={pending.cancel}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={pending.fixLater}>
            Save and fix later
          </Button>
          {pending.others.length > 0 && (
            <Button onClick={pending.removeOthers}>
              Save and remove {pending.others.length} other rule(s)
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
