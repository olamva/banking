import { useEffect, useRef } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog.tsx";
import { Kbd, KbdGroup } from "./ui/kbd.tsx";

export interface Shortcut {
  keys?: string[];
  cap: string;
  what: string;
  run?: () => void;
}

export const MENU_SHORTCUTS: Shortcut[] = [
  { cap: "↑ ↓", what: "Move down the list" },
  { cap: "Enter", what: "Include or clear the row" },
  { cap: "⇧ Enter", what: "Exclude the row" },
  { cap: "→ ←", what: "Open or close a category" },
  { cap: "⌫", what: "Go back to all filters, in an empty search" },
  { cap: "Esc", what: "Close the panel" },
];

const typing = (t: EventTarget | null) =>
  t instanceof HTMLElement &&
  (t.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName));

const roving = (e: KeyboardEvent) =>
  e.key.startsWith("Arrow") &&
  (document.activeElement?.matches(
    "[role=tablist] :focus-visible, [data-slot=toggle-group] :focus-visible",
  ) ??
    false);

export const isPageKey = (e: KeyboardEvent) =>
  !typing(e.target) && !roving(e) && !document.querySelector("[role=dialog]");

export const useShortcuts = (shortcuts: Shortcut[]) => {
  const latest = useRef(shortcuts);
  latest.current = shortcuts;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || !isPageKey(e)) return;
      const hit = latest.current.find((s) => s.keys?.includes(e.key));
      if (!hit?.run) return;
      e.preventDefault();
      hit.run();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);
};

const Keys = ({ cap }: { cap: string }) => (
  <KbdGroup>
    {cap.split(" ").map((k) => (
      <Kbd key={k}>{k}</Kbd>
    ))}
  </KbdGroup>
);

const Rows = ({ shortcuts }: { shortcuts: Shortcut[] }) => (
  <div className="divide-y">
    {shortcuts.map((s) => (
      <div
        key={`${s.cap}${s.what}`}
        className="flex items-center justify-between gap-4 py-1.5"
      >
        <span className="text-muted-foreground">{s.what}</span>
        <Keys cap={s.cap} />
      </div>
    ))}
  </div>
);

interface ShortcutsDialogProps {
  shortcuts: Shortcut[];
  open: boolean;
  onClose: () => void;
}

export const ShortcutsDialog = ({
  shortcuts,
  open,
  onClose,
}: ShortcutsDialogProps) => (
  <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
    <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-md">
      <DialogHeader>
        <DialogTitle>Keyboard shortcuts</DialogTitle>
        <DialogDescription>
          The keys work when no field and no dialog has the focus.
        </DialogDescription>
      </DialogHeader>
      <Rows shortcuts={shortcuts} />
      <h3 className="text-xs font-medium text-muted-foreground">
        Inside the filter panel
      </h3>
      <Rows shortcuts={MENU_SHORTCUTS} />
    </DialogContent>
  </Dialog>
);
