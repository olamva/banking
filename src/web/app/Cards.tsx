import type { ReactNode } from "react";
import { fmtNOK, fmtPct } from "./format.ts";
import {
  DownIcon,
  ExpandIcon,
  FlatIcon,
  Icon,
  LoadingIcon,
  UpIcon,
  type IconSvgElement,
} from "./icons.ts";
import { Badge } from "./ui/badge.tsx";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "./ui/card.tsx";
import { cn } from "./ui/utils.ts";

export const Empty = ({ children }: { children: ReactNode }) => (
  <div className="py-10 text-center text-sm text-muted-foreground">
    {children}
  </div>
);

interface NoteProps {
  icon: IconSvgElement;
  className?: string;
  children: ReactNode;
}

export const Note = ({ icon, className = "", children }: NoteProps) => (
  <p
    className={cn(
      "flex items-start gap-1.5 text-xs text-muted-foreground",
      className,
    )}
  >
    <Icon icon={icon} size={13} className="mt-px shrink-0" />
    <span>{children}</span>
  </p>
);

export const Caret = ({ open }: { open: boolean }) => (
  <Icon
    icon={ExpandIcon}
    size={12}
    className={cn("transition-transform", open && "rotate-90")}
  />
);

export const Loading = () => (
  <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
    <Icon icon={LoadingIcon} size={16} className="animate-spin" />
    Loading…
  </div>
);

interface PanelProps {
  title: ReactNode;
  icon?: IconSvgElement;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
  children: ReactNode;
}

export const Panel = ({
  title,
  icon,
  description,
  action,
  className,
  children,
}: PanelProps) => (
  <Card className={cn("min-w-0 gap-3", className)}>
    <CardHeader>
      <CardTitle className="flex items-center gap-2 text-sm font-medium">
        {icon && (
          <Icon
            icon={icon}
            size={16}
            className="shrink-0 text-muted-foreground"
          />
        )}
        {title}
      </CardTitle>
      {description && (
        <CardDescription className="text-xs">{description}</CardDescription>
      )}
      {action && (
        <CardAction className="@max-sm/card-header:col-start-1 @max-sm/card-header:row-span-1 @max-sm/card-header:row-start-auto @max-sm/card-header:mt-1 @max-sm/card-header:justify-self-start">
          {action}
        </CardAction>
      )}
    </CardHeader>
    <CardContent className="flex min-w-0 flex-1 flex-col">
      {children}
    </CardContent>
  </Card>
);

export interface Delta {
  raw: number;
  pct: number | null;
  good: boolean;
}

export const deltaInfo = (
  current: number,
  previous: number,
  goodIfUp: boolean,
): Delta => {
  const raw = Math.round((current - previous) * 100) / 100;
  const pct = previous > 0 && current >= 0 ? raw / previous : null;
  return { raw, pct, good: raw === 0 ? true : goodIfUp === raw > 0 };
};

const deltaTone = (delta: Delta) =>
  Math.abs(delta.raw) < 0.5
    ? "text-muted-foreground"
    : delta.good
      ? "text-good"
      : "text-bad";

const DeltaIcon = ({ delta }: { delta: Delta }) => (
  <Icon
    aria-hidden={false}
    role="img"
    aria-label={delta.raw > 0 ? "up" : delta.raw < 0 ? "down" : "unchanged"}
    icon={delta.raw > 0 ? UpIcon : delta.raw < 0 ? DownIcon : FlatIcon}
    size={13}
    className="shrink-0"
  />
);

interface StatTileProps {
  label: string;
  value: string;
  delta?: Delta;
  vs?: string;
  sub?: string;
}

export const StatTile = ({ label, value, delta, vs, sub }: StatTileProps) => (
  <Card className="min-w-0 gap-1.5 py-3.5 [--card-spacing:--spacing(3.5)] sm:[--card-spacing:--spacing(4)]">
    <CardHeader>
      <CardDescription className="flex min-h-5 items-center justify-between gap-2 text-xs">
        <span className="truncate">{label}</span>
        {delta?.pct != null && (
          <Badge variant="outline" className={cn("gap-0.5", deltaTone(delta))}>
            <DeltaIcon delta={delta} />
            {fmtPct(Math.abs(delta.pct))}
          </Badge>
        )}
      </CardDescription>
      <CardTitle className="min-w-0 text-xl font-semibold tracking-tight break-words tabular-nums sm:text-[26px]">
        {value}
      </CardTitle>
    </CardHeader>
    {(sub || delta) && (
      <CardContent className="space-y-0.5 text-xs text-muted-foreground">
        {delta && (
          <div className={deltaTone(delta)}>
            {delta.raw > 0 ? "+" : delta.raw < 0 ? "−" : "±"}
            {fmtNOK(Math.abs(delta.raw))} vs {vs}
          </div>
        )}
        {sub && <div>{sub}</div>}
      </CardContent>
    )}
  </Card>
);
