import { useEffect, useRef } from "react";
import { Icon, SearchIcon } from "./icons.ts";
import { isPageKey } from "./Shortcuts.tsx";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "./ui/input-group.tsx";
import { Kbd } from "./ui/kbd.tsx";

interface SearchBoxProps {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  hotkey?: boolean;
  className?: string;
}

export const SearchBox = ({
  value,
  onChange,
  placeholder,
  hotkey,
  className,
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
    <InputGroup className={className}>
      <InputGroupAddon>
        <Icon icon={SearchIcon} size={16} />
      </InputGroupAddon>
      <InputGroupInput
        ref={box}
        type="search"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key !== "Escape") return;
          e.preventDefault();
          e.currentTarget.blur();
        }}
        aria-label={placeholder}
      />
      {hotkey && (
        <InputGroupAddon align="inline-end" className="max-sm:hidden">
          <Kbd>⌘F</Kbd>
        </InputGroupAddon>
      )}
    </InputGroup>
  );
};
