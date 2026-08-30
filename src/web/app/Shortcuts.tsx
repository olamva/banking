import { useEffect, useRef } from "react";
import { Modal } from "./Modal.tsx";

export interface Shortcut {
  keys?: string[];
  cap: string;
  what: string;
  run?: () => void;
}

export const MENU_SHORTCUTS: Shortcut[] = [
  { cap: "↑ ↓", what: "Move down the list" },
  { cap: "Enter", what: "Tick or untick the row" },
  { cap: "→ ←", what: "Open or close a category" },
  { cap: "Space", what: "Open or close a category" },
  { cap: "Esc", what: "Close the menu" },
];

const typing = (t: EventTarget | null) =>
  t instanceof HTMLElement &&
  (t.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName));

// A click leaves focus on the control, and the browser does not call that
// focus visible. Only keyboard focus takes a page key away.
export const keyboardFocused = (el: Element | null | undefined) =>
  el?.matches(":focus-visible") ?? false;

// A tablist owns its arrows: the focused tab moves the selection and the focus
// together. A page shortcut on the same key would run beside it, so the two
// would both fire on one press. Only the arrows are held back, because a tab
// consumes nothing else.
const inTablist = (e: KeyboardEvent) =>
  e.key.startsWith("Arrow") &&
  document.activeElement?.closest("[role=tablist]") != null &&
  keyboardFocused(document.activeElement);

export const isPageKey = (e: KeyboardEvent) =>
  !typing(e.target) && !inTablist(e) && !document.querySelector("dialog[open]");

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

const Key = ({ cap }: { cap: string }) => (
  <span className="flex shrink-0 gap-1">
    {cap.split(" ").map((k) => (
      <kbd
        key={k}
        className="rounded border border-line bg-page px-1.5 py-0.5 text-[11px] text-ink-soft"
      >
        {k}
      </kbd>
    ))}
  </span>
);

const Row = ({ cap, what }: Shortcut) => (
  <div className="flex items-center justify-between gap-4 py-1 text-[13px]">
    <span className="text-ink-soft">{what}</span>
    <Key cap={cap} />
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
}: ShortcutsDialogProps) => {
  if (!open) return null;

  return (
    <Modal onClose={onClose} className="w-[min(90vw,28rem)] p-5">
      <h2 className="mb-3 text-sm font-semibold">Keyboard shortcuts</h2>
      <div className="divide-y divide-line">
        {shortcuts.map((s) => (
          <Row key={s.cap} {...s} />
        ))}
      </div>
      <h3 className="mt-4 mb-1 text-xs text-ink-muted">Inside a filter menu</h3>
      <div className="divide-y divide-line">
        {MENU_SHORTCUTS.map((s) => (
          <Row key={`${s.cap}${s.what}`} {...s} />
        ))}
      </div>
      <button
        type="button"
        onClick={onClose}
        className="mt-4 w-full rounded-md border border-line px-2.5 py-1.5 text-xs text-ink-muted"
      >
        Close
      </button>
    </Modal>
  );
};
