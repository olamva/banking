import { useEffect, useRef } from "react";
import { Icon, SearchIcon } from "./icons.ts";
import { isPageKey } from "./Shortcuts.tsx";

interface SearchBoxProps {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  hotkey?: boolean;
}

export const SearchBox = ({
  value,
  onChange,
  placeholder,
  hotkey,
}: SearchBoxProps) => {
  const box = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!hotkey) return;
    const find = (e: KeyboardEvent) => {
      const modified = e.metaKey || e.ctrlKey;
      const slash = e.key === "/" && !modified && isPageKey(e);
      if (!slash && !(e.key === "f" && modified)) return;
      if (e.altKey) return;
      e.preventDefault();
      box.current?.select();
    };
    document.addEventListener("keydown", find);
    return () => document.removeEventListener("keydown", find);
  }, [hotkey]);

  return (
    <div className="relative">
      <Icon
        icon={SearchIcon}
        size={17}
        className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-ink-muted"
      />
      <input
        ref={box}
        type="search"
        className={`w-full rounded-md border border-line bg-page py-2.5 pl-10 text-sm text-ink ${hotkey ? "pr-14" : "pr-3"}`}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key !== "Escape") return;
          // WebKit clears a type="search" box on Escape. Keep the query.
          e.preventDefault();
          e.currentTarget.blur();
        }}
        aria-label={placeholder}
      />
      {/* A shortcut that took over a browser one has to say so somewhere. `/`
          is in the shortcuts dialog; only the one that overrides the browser
          needs saying on the box itself. */}
      {hotkey && (
        <kbd className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 rounded border border-line px-1.5 py-0.5 text-[11px] text-ink-muted">
          ⌘F
        </kbd>
      )}
    </div>
  );
};
