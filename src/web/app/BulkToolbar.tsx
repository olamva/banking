import { useLayoutEffect, useRef, useState } from "react";
import type { BulkFile } from "../../core/bulkRules.ts";
import { merchantOf } from "../../core/select.ts";
import type { Categorized } from "../../core/types.ts";
import { fmtNOKExact } from "./format.ts";
import {
  type IconSvgElement,
  CategoryIcon,
  CloseIcon,
  CountryIcon,
  EditIcon,
  ExcludeIcon,
  FilterIcon,
  HideIcon,
  Icon,
  MoreIcon,
  PeopleIcon,
  RecurringIcon,
} from "./icons.ts";
import { Button } from "./ui/button.tsx";
import { Checkbox } from "./ui/checkbox.tsx";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu.tsx";

const BULK: [BulkFile, IconSvgElement, string][] = [
  ["payees", EditIcon, "Rename payees"],
  ["categories", CategoryIcon, "Change category"],
  ["countries", CountryIcon, "Change country"],
  ["family", PeopleIcon, "Mark as family"],
  ["subscriptions", RecurringIcon, "Mark as subscription"],
  ["not-subscriptions", ExcludeIcon, "Not a subscription"],
];

const GAP = 4;

interface Action {
  icon: IconSvgElement;
  label: string;
  run: () => void;
  dialog?: boolean;
  split?: boolean;
}

interface BulkToolbarProps {
  picked: Categorized[];
  onBulk: (txns: Categorized[], file: BulkFile) => void;
  onPayees?: (payees: string[], hide: boolean) => void;
  onClear: () => void;
}

interface BulkSelectAllProps {
  label: string;
  txns: Categorized[];
  selected: Set<Categorized>;
  onSelect: (selected: Set<Categorized>) => void;
}

export const BulkSelectAll = ({
  label,
  txns,
  selected,
  onSelect,
}: BulkSelectAllProps) => {
  const count = txns.filter((t) => selected.has(t)).length;
  return (
    <Checkbox
      aria-label={label}
      checked={
        count > 0 && count === txns.length
          ? true
          : count > 0
            ? "indeterminate"
            : false
      }
      onCheckedChange={(c) => {
        const next = new Set(selected);
        for (const t of txns) {
          if (c === true) next.add(t);
          else next.delete(t);
        }
        onSelect(next);
      }}
      className="align-middle"
    />
  );
};

interface BulkCheckboxProps {
  txn: Categorized;
  selected: Set<Categorized>;
  onSelect: (selected: Set<Categorized>) => void;
}

export const BulkCheckbox = ({
  txn,
  selected,
  onSelect,
}: BulkCheckboxProps) => (
  <Checkbox
    aria-label={`Select ${merchantOf(txn)} on ${txn.date}, ${fmtNOKExact(txn.amount)}`}
    checked={selected.has(txn)}
    onClick={(e) => e.stopPropagation()}
    onCheckedChange={(c) => {
      const next = new Set(selected);
      if (c === true) next.add(txn);
      else next.delete(txn);
      onSelect(next);
    }}
    className="align-middle"
  />
);

export const BulkToolbar = ({
  picked,
  onBulk,
  onPayees,
  onClear,
}: BulkToolbarProps) => {
  const box = useRef<HTMLDivElement>(null);
  const ruler = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState(0);
  const payees = [...new Set(picked.map(merchantOf))];
  const these = payees.length === 1 ? "this payee" : "these payees";
  const actions: Action[] = [
    ...BULK.map(([file, icon, label]) => ({
      icon,
      label,
      dialog: true,
      run: () => onBulk(picked, file),
    })),
    ...(onPayees
      ? [
          {
            icon: FilterIcon,
            label: `Show only ${these}`,
            split: true,
            run: () => onPayees(payees, false),
          },
          {
            icon: HideIcon,
            label: `Hide ${these}`,
            run: () => onPayees(payees, true),
          },
        ]
      : []),
  ];

  const measure = () => {
    if (!box.current || !ruler.current) return;
    const [chip = 0, more = 0, ...widths] = [...ruler.current.children].map(
      (c) => (c as HTMLElement).offsetWidth + GAP,
    );
    const room = box.current.clientWidth + GAP - chip;
    let used = 0;
    let n = 0;
    while (n < widths.length && used + widths[n]! <= room - more)
      used += widths[n++]!;
    setFit(widths.reduce((s, w) => s + w, 0) <= room ? widths.length : n);
  };
  useLayoutEffect(measure);
  useLayoutEffect(() => {
    const observer = new ResizeObserver(measure);
    if (box.current) observer.observe(box.current);
    return () => observer.disconnect();
  }, []);

  const chip = (
    <Button variant="secondary" size="sm" aria-live="polite" onClick={onClear}>
      {picked.length} selected
      <Icon icon={CloseIcon} size={12} />
    </Button>
  );
  const more = (
    <Button variant="ghost" size="icon-sm" aria-label="More bulk actions">
      <Icon icon={MoreIcon} size={14} />
    </Button>
  );
  const inline = (a: Action) => (
    <Button key={a.label} variant="ghost" size="sm" onClick={a.run}>
      <Icon icon={a.icon} size={14} />
      {a.label}
    </Button>
  );
  const rest = actions.slice(fit);

  return (
    <div
      ref={box}
      className="relative flex min-w-0 flex-1 items-center gap-1 max-sm:order-last max-sm:basis-full sm:basis-0 sm:justify-end"
    >
      <div aria-hidden className="invisible absolute inset-0 overflow-hidden">
        <div ref={ruler} className="flex w-max gap-1">
          {chip}
          {more}
          {actions.map(inline)}
        </div>
      </div>
      {chip}
      {actions.slice(0, fit).map(inline)}
      {rest.length > 0 && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>{more}</DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-max">
            {rest.map((a, i) => [
              a.split && i > 0 && <DropdownMenuSeparator key={`${a.label}-`} />,
              <DropdownMenuItem key={a.label} onSelect={a.run}>
                <Icon icon={a.icon} size={14} />
                {a.label}
                {a.dialog && "…"}
              </DropdownMenuItem>,
            ])}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
};
