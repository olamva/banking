import type { ReactNode } from "react";

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
