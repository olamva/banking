import { ConflictItem } from "./Checks.tsx";
import type { PendingConflicts } from "./conflictGuard.ts";
import { ErrorIcon, Icon } from "./icons.ts";
import { Button } from "./ui/button.tsx";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog.tsx";

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
            <ConflictItem
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
