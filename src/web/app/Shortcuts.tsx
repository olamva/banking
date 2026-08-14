/**
 * The page's keys, and the dialog that lists them.
 *
 * One array is both: `useShortcuts` binds what it holds and `ShortcutsDialog`
 * prints the same array, so a key that works is a key that is documented and
 * there is no second list to keep in step.
 *
 * A shortcut with no `run` is one bound somewhere it can reach what it needs —
 * ⌘F belongs to the search box, the arrows inside a filter menu belong to the
 * menu — and is here to be printed only.
 */
import { useEffect, useRef } from "react";

export interface Shortcut {
  /** The `KeyboardEvent.key`s that do this, and never the modifiers. */
  keys?: string[];
  /** As it reads on the cap, which `ArrowLeft` does not. */
  cap: string;
  what: string;
  run?: () => void;
}

/**
 * Bound in `FilterBar`, where the panel and its highlight are. Printed here so
 * the dialog answers the whole question rather than the half this file binds.
 */
export const MENU_SHORTCUTS: Shortcut[] = [
  { cap: "↑ ↓", what: "Move down the list" },
  { cap: "Enter", what: "Tick or untick the row" },
  { cap: "→ ←", what: "Open or close a category" },
  { cap: "Space", what: "Open or close a category" },
  { cap: "Esc", what: "Close the menu" },
];

/**
 * Where a keystroke is a character rather than a command. A select is in here
 * too: its own keys pick an option, and stepping the period out from under it
 * would fight them.
 */
const typing = (t: EventTarget | null) =>
  t instanceof HTMLElement &&
  (t.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName));

/**
 * Whether a bare keystroke is the page's, rather than belonging to whatever has
 * focus. Exported because the search box binds `/` itself — it is the only
 * thing that can reach the box — and must answer the same question.
 *
 * A modal dialog owns the keyboard while it is up: reading a list of keys is
 * not a reason to fire one, and it is the shortcuts dialog itself that is
 * usually the one open. Escape, the backdrop and its own button close it.
 */
export const isPageKey = (e: KeyboardEvent) =>
  !typing(e.target) && !document.querySelector("dialog[open]");

/**
 * The keys, bound once for the life of the page. The list is read through a ref
 * rather than closed over, so every `run` sees the render it was built in
 * without the listener being torn down and rebuilt on each of them.
 */
export const useShortcuts = (shortcuts: Shortcut[]) => {
  const latest = useRef(shortcuts);
  latest.current = shortcuts;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Shift is allowed — `?` is one — but a modified key is the browser's or
      // the search box's, never ours.
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

/**
 * A native `<dialog>`, so Escape, the backdrop and the focus trap are the
 * browser's problem rather than three more effects here.
 */
export const ShortcutsDialog = ({
  shortcuts,
  open,
  onClose,
}: ShortcutsDialogProps) => {
  const box = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  return (
    <dialog
      ref={box}
      // Escape closes it without asking us, so the state follows the DOM rather
      // than the other way round.
      onClose={onClose}
      // The backdrop is painted by the dialog element itself, so a click on
      // `<dialog>` and not on anything inside it is a click outside.
      onClick={(e) => e.target === box.current && onClose()}
      className="m-auto w-[min(90vw,28rem)] rounded-[10px] border border-line bg-surface p-5 text-ink shadow-lg backdrop:bg-black/40"
    >
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
    </dialog>
  );
};
