import { ConflictItem } from "./Checks.tsx";
import type { PendingConflicts } from "./conflictGuard.ts";
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
          <DialogTitle>This change makes a rule conflict</DialogTitle>
          <DialogDescription className="text-xs">
            Two rules give different values to the same transactions. The first
            rule wins. Remove the other rule now, or save and fix it later in
            Settings › Conflicts.
          </DialogDescription>
        </DialogHeader>
        <ul>
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
          <Button variant="outline" onClick={pending.fixLater}>
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
