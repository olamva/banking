import { useState } from "react";
import type { PeriodKind } from "../../core/select.ts";
import { CalendarIcon, Icon, NextIcon, PrevIcon } from "./icons.ts";
import { Button } from "./ui/button.tsx";
import { ButtonGroup } from "./ui/button-group.tsx";
import { Input } from "./ui/input.tsx";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover.tsx";
import { Separator } from "./ui/separator.tsx";
import { cn } from "./ui/utils.ts";

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const realDate = (d: string): string => {
  const [y, m, day] = d.split("-").map(Number) as [number, number, number];
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return day > last ? `${d.slice(0, 8)}${last}` : d;
};

const periodLabel = (kind: PeriodKind, period: string): string =>
  kind === "all"
    ? "All time"
    : kind === "custom"
      ? "Custom range"
      : kind === "year"
        ? period
        : `${MONTH_NAMES[Number(period.slice(5)) - 1]} ${period.slice(0, 4)}`;

interface PeriodPickerProps {
  months: string[];
  years: string[];
  period: string;
  kind: PeriodKind;
  from: string | null;
  to: string | null;
  earliest: string;
  latest: string;
  onPeriod: (period: string) => void;
  onStep: (by: number) => void;
  canStep: (by: number) => boolean;
}

const pick = (on: boolean) =>
  cn(
    "h-7 justify-center px-2 font-normal",
    on && "bg-primary text-primary-foreground hover:bg-primary/90",
  );

export const PeriodPicker = ({
  months,
  years,
  period,
  kind,
  from,
  to,
  earliest,
  latest,
  onPeriod,
  onStep,
  canStep,
}: PeriodPickerProps) => {
  const [open, setOpen] = useState(false);
  const [looking, setLooking] = useState<string | null>(null);

  const inView = kind === "month" || kind === "year" ? period.slice(0, 4) : "";
  const shown = looking ?? (inView || (years[years.length - 1] ?? ""));
  const has = (m: number) =>
    months.includes(`${shown}-${String(m + 1).padStart(2, "0")}`);

  const choose = (next: string) => {
    onPeriod(next);
    setOpen(false);
  };

  return (
    <ButtonGroup className="min-w-0 max-sm:flex-1">
      <Button
        variant="outline"
        size="icon"
        aria-label="The period before"
        disabled={!canStep(-1)}
        onClick={() => onStep(-1)}
      >
        <Icon icon={PrevIcon} size={16} />
      </Button>
      <Popover
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) setLooking(null);
        }}
      >
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            className="min-w-0 flex-1 font-medium sm:w-44"
          >
            <Icon
              icon={CalendarIcon}
              size={15}
              className="text-muted-foreground"
            />
            <span className="truncate">{periodLabel(kind, period)}</span>
          </Button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          className="w-76 max-w-[calc(100vw-1.5rem)] gap-2 p-2"
        >
          <div className="grid grid-cols-2 gap-1">
            <Button
              variant="ghost"
              size="sm"
              className={pick(kind === "all")}
              onClick={() => choose("all")}
            >
              All time
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className={pick(kind === "custom")}
              onClick={() =>
                onPeriod(`${from ?? earliest}..${to ? realDate(to) : latest}`)
              }
            >
              Custom range
            </Button>
          </div>
          {kind === "custom" && (
            <div className="grid grid-cols-2 gap-1">
              <Input
                type="date"
                value={from ?? ""}
                min={earliest}
                max={to ?? latest}
                onChange={(e) => onPeriod(`${e.target.value}..${to ?? ""}`)}
                aria-label="From"
                className="h-8 px-1.5 text-xs"
              />
              <Input
                type="date"
                value={to ?? ""}
                min={from ?? earliest}
                max={latest}
                onChange={(e) => onPeriod(`${from ?? ""}..${e.target.value}`)}
                aria-label="To"
                className="h-8 px-1.5 text-xs"
              />
            </div>
          )}
          <Separator />
          <div className="flex gap-2">
            <div className="flex max-h-60 w-16 shrink-0 flex-col gap-0.5 overflow-y-auto">
              {[...years].reverse().map((y) => (
                <Button
                  key={y}
                  variant="ghost"
                  size="sm"
                  onPointerEnter={() => setLooking(y)}
                  onFocus={() => setLooking(y)}
                  onClick={() => setLooking(y)}
                  aria-expanded={y === shown}
                  className={cn(
                    "h-7 shrink-0 font-normal tabular-nums",
                    y === shown
                      ? "bg-muted font-medium text-foreground"
                      : "text-muted-foreground",
                  )}
                >
                  {y}
                </Button>
              ))}
            </div>
            <div className="min-w-0 flex-1 border-l pl-2">
              <Button
                variant="ghost"
                size="sm"
                className={cn("mb-1 w-full", pick(period === shown))}
                onClick={() => choose(shown)}
              >
                Whole {shown}
              </Button>
              <div className="grid grid-cols-3 gap-0.5">
                {MONTH_NAMES.map((name, i) => {
                  const m = `${shown}-${String(i + 1).padStart(2, "0")}`;
                  return (
                    <Button
                      key={name}
                      variant="ghost"
                      size="sm"
                      disabled={!has(i)}
                      onClick={() => choose(m)}
                      aria-label={`${name} ${shown}`}
                      className={pick(period === m)}
                    >
                      {name.slice(0, 3)}
                    </Button>
                  );
                })}
              </div>
            </div>
          </div>
        </PopoverContent>
      </Popover>
      <Button
        variant="outline"
        size="icon"
        aria-label="The period after"
        disabled={!canStep(1)}
        onClick={() => onStep(1)}
      >
        <Icon icon={NextIcon} size={16} />
      </Button>
    </ButtonGroup>
  );
};
