import { useEffect, useState, type ReactNode } from "react";
import { ErrorIcon, Icon, InfoIcon } from "./icons.ts";

interface ModalProps {
  children: ReactNode;
  className: string;
  onClose: () => void;
}

export const Modal = ({ children, className, onClose }: ModalProps) => (
  <dialog
    ref={(el) => {
      if (el && !el.open) el.showModal();
    }}
    onClose={onClose}
    onClick={(e) => {
      const selecting =
        e.detail > 0 && !(window.getSelection()?.isCollapsed ?? true);
      if (e.target === e.currentTarget && !selecting) onClose();
    }}
    className={`m-auto rounded-xl border border-line bg-surface p-0 text-ink shadow-2xl backdrop:bg-black/50 ${className}`}
  >
    {children}
  </dialog>
);

interface NotificationProps {
  note: string | null;
  bad: boolean;
}

// A good note clears itself. A bad one stays, so the reader keeps the message.
export const Notification = ({ note, bad }: NotificationProps) => {
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    setHidden(false);
    if (note === null || bad) return;
    const timer = window.setTimeout(() => setHidden(true), 4000);
    return () => window.clearTimeout(timer);
  }, [note, bad]);

  if (note === null || hidden) return null;
  return (
    <div
      role={bad ? "alert" : "status"}
      aria-live={bad ? "assertive" : "polite"}
      className={`flex max-w-full items-start gap-2 rounded-lg border bg-surface px-3 py-2.5 text-sm shadow-lg ${bad ? "border-critical text-critical" : "border-good text-ink"}`}
    >
      <Icon
        aria-hidden
        icon={bad ? ErrorIcon : InfoIcon}
        size={16}
        className={`mt-0.5 shrink-0 ${bad ? "text-critical" : "text-good"}`}
      />
      {note}
    </div>
  );
};

// Stacks the notes of every source, so two cannot land on one another.
export const Notifications = ({ children }: { children: ReactNode }) => (
  <div className="pointer-events-none fixed right-3 bottom-3 z-50 flex max-w-[calc(100vw-1.5rem)] flex-col items-end gap-2 sm:right-6 sm:bottom-6">
    {children}
  </div>
);
