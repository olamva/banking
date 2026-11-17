import type { ReactNode } from "react";
import { highlighting } from "./DataTable.tsx";
import { Button } from "./ui/button.tsx";

interface PickCellProps {
  label: string;
  value?: string;
  color?: string;
  onPick: (value: string, meta: boolean) => void;
  children?: ReactNode;
}

export const PickCell = ({
  label,
  value = label,
  color,
  onPick,
  children,
}: PickCellProps) => (
  <Button
    variant="link"
    onClick={(e) => {
      e.stopPropagation();
      if (!highlighting(e)) onPick(value, e.metaKey);
    }}
    style={color ? { color } : undefined}
    className="h-auto justify-start rounded-none p-0 text-left text-[length:inherit] font-normal text-inherit underline-offset-2 active:not-aria-[haspopup]:translate-y-0 has-[svg]:-m-1 has-[svg]:rounded-md has-[svg]:p-1 has-[svg]:hover:bg-muted has-[svg]:hover:text-foreground"
  >
    {children || label}
  </Button>
);
