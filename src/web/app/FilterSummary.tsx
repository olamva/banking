import { useEffect, useRef, type ReactNode } from "react";
import type { Axis, Filters } from "../../core/select.ts";
import { AXES, NO_FILTERS } from "../../core/select.ts";
import { DropdownIcon, Icon, ResetFiltersIcon } from "./icons.ts";

const CONTROL =
  "rounded-md border border-line bg-page px-2 py-1.5 text-[13px] text-ink";

const useDismiss = (menu: React.RefObject<HTMLDetailsElement | null>) => {
  useEffect(() => {
    const close = (e: Event) => {
      const el = menu.current;
      if (!el?.open) return;
      if (e instanceof KeyboardEvent && e.key !== "Escape") return;
      if (e.type === "pointerdown" && el.contains(e.target as Node)) return;
      el.open = false;
    };
    document.addEventListener("keydown", close);
    document.addEventListener("pointerdown", close);
    return () => {
      document.removeEventListener("keydown", close);
      document.removeEventListener("pointerdown", close);
    };
  }, [menu]);
};

interface FilterSummaryProps {
  filters: Filters;
  onFilters: (filters: Filters) => void;
  labelOf: (axis: Axis, value: string) => string;
  active: number;
}

const SummaryRow = ({ label, values }: { label: string; values: string[] }) =>
  values.length === 0 ? null : (
    <div className="flex gap-1.5 text-[12px]">
      <span
        className={`w-11 shrink-0 ${label === "Except" ? "text-critical-strong" : "text-ink-muted"}`}
      >
        {label}
      </span>
      <span className="min-w-0 flex-1 text-ink">{values.join(", ")}</span>
    </div>
  );

const Section = ({
  title,
  onClear,
  children,
}: {
  title: string;
  onClear: () => void;
  children: ReactNode;
}) => (
  <div>
    <div className="flex items-baseline gap-2">
      <span className="min-w-0 flex-1 truncate text-[11px] tracking-wide text-ink-muted uppercase">
        {title}
      </span>
      <button
        type="button"
        onClick={onClear}
        aria-label={`Clear ${title.toLowerCase()}`}
        className="relative shrink-0 text-[11px] text-ink-muted before:absolute before:-inset-2 before:content-[''] hover:text-ink"
      >
        Clear
      </button>
    </div>
    {children}
  </div>
);

export const FilterSummary = ({
  filters,
  onFilters,
  labelOf,
  active,
}: FilterSummaryProps) => {
  const menu = useRef<HTMLDetailsElement>(null);
  useDismiss(menu);

  const axes = (Object.entries(AXES) as [Axis, (typeof AXES)[Axis]][])
    .map(([key, outKey]) => ({
      key,
      outKey,
      title: key[0]!.toUpperCase() + key.slice(1),
      on: filters[key],
      out: filters[outKey],
    }))
    .filter(({ on, out }) => on.length > 0 || out.length > 0);

  return (
    <details ref={menu} className="group relative max-sm:w-full">
      <summary
        className={`${CONTROL} flex list-none items-center select-none gap-1.5 marker:content-none`}
      >
        <span className="sm:hidden">{active}</span>
        <span className="max-sm:hidden">
          {active > 0
            ? `${active} filter${active === 1 ? "" : "s"}`
            : "Filters"}
        </span>
        <Icon
          aria-hidden
          icon={DropdownIcon}
          size={14}
          className="shrink-0 text-ink-muted transition-transform group-open:rotate-180"
        />
      </summary>
      {/* **`right-0`, not the default left.** This is the one control on the bar
          that sits at the *right* end (`ml-auto`), so a panel growing rightward
          from the trigger's left edge starts 256px of menu at the last ~110px of
          the page and runs straight off it — which is what shipped. Anchoring the
          panel's right edge to the trigger's makes it grow back across the bar,
          where there is always room: 256px of panel against a bar that is the
          page's own width, never narrower than the 375px the phone rule sets.

          The pickers get away with the default because they sit at the *left*.
          The rule is the same one CLAUDE.md already states — a panel is anchored
          wherever its trigger is, so the trigger's position decides the anchor. */}
      <div className="absolute right-0 z-20 mt-1 flex max-h-72 w-64 flex-col rounded-md border border-line bg-surface p-1.5 shadow-lg">
        <div className="min-h-0 space-y-2 overflow-y-auto px-0.5 py-0.5">
          {axes.map(({ key, outKey, title, on, out }) => (
            <Section
              key={key}
              title={title}
              onClear={() => onFilters({ ...filters, [key]: [], [outKey]: [] })}
            >
              <SummaryRow
                label="Only"
                values={on.map((v) => labelOf(key, v))}
              />
              <SummaryRow
                label="Except"
                values={out.map((v) => labelOf(key, v))}
              />
            </Section>
          ))}
          {/* Listed even where the box is on screen: this is the list of what
              Reset is about to clear, not a second copy of the control. */}
          {filters.search !== "" && (
            <Section
              title="Search"
              onClear={() => onFilters({ ...filters, search: "" })}
            >
              <SummaryRow label="Text" values={[filters.search]} />
            </Section>
          )}
          {filters.showExcluded && (
            <Section
              title="Excluded rows"
              onClear={() => onFilters({ ...filters, showExcluded: false })}
            >
              <SummaryRow label="Shown" values={["transfers, card bills"]} />
            </Section>
          )}
        </div>
        <button
          type="button"
          onClick={() => {
            onFilters(NO_FILTERS);
            if (menu.current) menu.current.open = false;
          }}
          className="mt-1.5 flex shrink-0 items-center justify-center gap-1.5 rounded-md border border-line px-2.5 py-1.5 text-xs text-ink-muted"
        >
          <Icon aria-hidden icon={ResetFiltersIcon} size={14} />
          Reset filters
        </button>
      </div>
    </details>
  );
};
