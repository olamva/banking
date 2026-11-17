import { plural } from "../../core/plural.ts";
import { CONFLICT_SIDES, type Conflict } from "./Checks.tsx";
import type { PendingConflicts } from "./conflictGuard.ts";
import { ErrorIcon, Icon } from "./icons.ts";
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
  <dl className="grid grid-cols-[auto_minmax(0,1fr)] items-baseline gap-x-3 gap-y-1.5 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-xs dark:bg-destructive/10">
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
    <dd className="col-start-2 text-muted-foreground">
      {plural(c.rows, "transaction")}
    </dd>
  </dl>
);

interface ConflictDialogProps {
  pending: PendingConflicts | null;
}

export const ConflictDialog = ({ pending }: ConflictDialogProps) =>
  pending && (
    <Dialog open onOpenChange={(o) => !o && pending.cancel()}>
      <DialogContent className="max-h-[88dvh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <Icon icon={ErrorIcon} size={18} />
            Rule conflict
          </DialogTitle>
          <DialogDescription className="sr-only">
            The first matching rule wins.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-2">
          {pending.conflicts.map((c) => (
            <ConflictCard
              key={`${c.winner}|${c.loser}`}
              conflict={c}
              fresh={pending.keys}
            />
          ))}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={pending.cancel}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={pending.fixLater}>
            Keep both
          </Button>
          {pending.others.length > 0 && (
            <Button onClick={pending.removeOthers}>
              {pending.others.length === 1
                ? "Remove the other rule"
                : `Remove ${pending.others.length} other rules`}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
