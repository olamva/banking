import { useState, type ReactNode } from "react";
import { type CategoryDelta } from "../../core/stats.ts";
import { fmtNOK, useWidth } from "./format.ts";
import { ExpandIcon, Icon } from "./icons.ts";

interface TipState {
  x: number;
  y: number;
  content: ReactNode;
}

export const useTooltip = () => {
  const [tip, setTip] = useState<TipState | null>(null);

  const show = (e: React.PointerEvent, content: ReactNode) =>
    setTip({ x: e.clientX, y: e.clientY, content });
  const hide = () => setTip(null);

  const bind = (content: ReactNode) => ({
    onPointerMove: (e: React.PointerEvent) => show(e, content),
    onPointerLeave: hide,
  });

  const node = tip ? (
    <div
      className="pointer-events-none fixed z-10 max-w-72 rounded-md border border-line bg-surface px-2.5 py-1.5 text-xs text-ink shadow-lg"
      style={{
        left: Math.min(tip.x + 14, window.innerWidth - 300),
        top: Math.min(tip.y + 14, window.innerHeight - 100),
      }}
    >
      {tip.content}
    </div>
  ) : null;

  return { bind, show, hide, node };
};

interface EmptyProps {
  children: ReactNode;
}

export const Empty = ({ children }: EmptyProps) => (
  <div className="py-10 text-center text-ink-muted">{children}</div>
);

// SVG has no text-overflow. A character in 11px system-ui is about 5.6px wide.
const ellipsis = (s: string, px: number) => {
  const max = Math.max(Math.floor(px / 5.6), 3);
  return s.length > max ? s.slice(0, max - 1) + "…" : s;
};

export interface BarItem {
  label: string;
  total: number;
  count?: number;
  key?: string;
  subs?: BarItem[];
}

const TONE = {
  spend: ["bg-critical-strong", "bg-critical-strong/50"],
  income: ["bg-good-strong", "bg-good-strong/50"],
} as const;

interface HorizontalBarsProps {
  items: BarItem[];
  onPick?: (key: string, meta: boolean) => void;
  onPickSub?: (key: string, meta: boolean) => void;
  tone?: keyof typeof TONE;
  max?: number;
}

export const HorizontalBars = ({
  items,
  onPick,
  onPickSub,
  tone = "spend",
  max = 10,
}: HorizontalBarsProps) => {
  const { bind, node } = useTooltip();
  const [open, setOpen] = useState<ReadonlySet<string>>(new Set());
  const [showAll, setShowAll] = useState(false);
  const maxVal = Math.max(...items.map((i) => i.total), 1);

  if (items.length === 0) return <Empty>Nothing in this range.</Empty>;

  const visible = showAll ? items : items.slice(0, max);
  const hidden = items.length - visible.length;

  const toggle = (key: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (!next.delete(key)) next.add(key);
      return next;
    });

  const bar = (
    item: BarItem,
    depth: number,
    pick?: (key: string, meta: boolean) => void,
  ) => {
    const id = item.key ?? item.label;
    const row = (
      <>
        <span
          className="shrink-0 truncate text-right text-ink-soft"
          style={{ width: `min(${122 - depth * 12}px, 34%)` }}
        >
          {item.label}
        </span>
        <span className="flex min-w-0 flex-1 items-center gap-2">
          {/* The bar area keeps 78px back for the value, as the SVG did — a
              full-width bar would otherwise push the number off the edge.
              `min-w-px` keeps the smallest total visible as a sliver. */}
          <span
            className={`h-4 min-w-px rounded ${TONE[tone][depth ? 1 : 0]}`}
            style={{ width: `calc((100% - 78px) * ${item.total / maxVal})` }}
          />
          <span className="shrink-0 font-semibold">{fmtNOK(item.total)}</span>
        </span>
      </>
    );
    const tip = bind(
      <>
        <div className="text-ink-soft">{item.label}</div>
        <div className="font-semibold">
          {fmtNOK(item.total)}
          {item.count ? ` · ${item.count} txns` : ""}
        </div>
      </>,
    );
    const shared =
      "flex h-6.5 min-w-0 flex-1 items-center gap-2 rounded-md text-[11px]";
    return pick ? (
      <button
        type="button"
        onClick={(e) => pick(id, e.metaKey)}
        className={`${shared} hover:bg-hover`}
        {...tip}
      >
        {row}
      </button>
    ) : (
      <div className={shared} {...tip}>
        {row}
      </div>
    );
  };

  return (
    <>
      <div className="flex flex-1 flex-col justify-evenly">
        {visible.map((item) => {
          const id = item.key ?? item.label;
          const subs = item.subs && item.subs.length > 1 ? item.subs : [];
          const expanded = open.has(id);
          return (
            <div key={id} className="flex flex-col">
              <div className="flex items-center">
                {subs.length > 0 ? (
                  <button
                    type="button"
                    onClick={() => toggle(id)}
                    aria-expanded={expanded}
                    aria-label={`${expanded ? "Hide" : "Show"} ${item.label} breakdown`}
                    className="relative mr-0.5 flex h-6.5 w-3 shrink-0 items-center justify-center text-ink-soft before:absolute before:-inset-2 before:content-[''] hover:text-ink"
                  >
                    <Icon
                      aria-hidden
                      icon={ExpandIcon}
                      size={12}
                      className={`transition-transform ${expanded ? "rotate-90" : ""}`}
                    />
                  </button>
                ) : (
                  <span className="mr-0.5 w-3 shrink-0" />
                )}
                {bar(item, 0, onPick)}
              </div>
              {expanded &&
                subs.map((sub) => (
                  <div key={sub.key ?? sub.label} className="flex items-center">
                    <span className="mr-0.5 w-3 shrink-0" />
                    <span className="w-3 shrink-0" />
                    {bar(sub, 1, onPickSub)}
                  </div>
                ))}
            </div>
          );
        })}
      </div>
      {/* Gated on the whole list, not on what is still hidden: a filter can
          shrink the list under the cut while it is open, and `hidden > 0` would
          then leave a "Show less" that closes nothing. A list of nine keeps no
          button in either state. */}
      {items.length > max && (
        <button
          type="button"
          onClick={() => setShowAll((s) => !s)}
          aria-expanded={showAll}
          className="mt-1 flex h-6.5 w-full items-center justify-center gap-1 rounded-md text-[11px] text-ink-muted hover:bg-hover hover:text-ink"
        >
          <Icon
            aria-hidden
            icon={ExpandIcon}
            size={12}
            className={`transition-transform ${showAll ? "-rotate-90" : "rotate-90"}`}
          />
          {showAll ? "Show less" : `Show ${hidden} more`}
        </button>
      )}
      {node}
    </>
  );
};

export const visibleDeltas = (deltas: CategoryDelta[]): CategoryDelta[] =>
  deltas.filter((d) => Math.abs(d.delta) > 0.5).slice(0, 8);

interface DivergingBarsProps {
  deltas: CategoryDelta[];
  onPick?: (category: string, meta: boolean) => void;
}

export const DivergingBars = ({
  deltas: shown,
  onPick,
}: DivergingBarsProps) => {
  const [ref, width] = useWidth();
  const { bind, node } = useTooltip();

  const rowH = 26;
  const mid = width / 2;
  const halfW = Math.max(width / 2 - 90, 20);
  const height = shown.length * rowH + 8;
  const maxAbs = Math.max(...shown.map((d) => Math.abs(d.delta)), 1);

  return (
    <div ref={ref}>
      {shown.length === 0 ? (
        <Empty>No change worth drawing.</Empty>
      ) : (
        <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
          {/* Only the zero line. The gridlines that used to flank it were for
              comparing bars against each other, back when the bar was the sole
              encoding of its size — every bar now prints its own number at its
              end, which answers that better than counting rules. This one stays:
              it is the zero the chart diverges from, and without it nothing says
              which side of it a bar is on. */}
          <line x1={mid} x2={mid} y1={0} y2={height} className="stroke-axis" />
          {shown.map((d, i) => {
            const y = i * rowH + 4;
            const w = Math.max((Math.abs(d.delta) / maxAbs) * halfW, 1);
            const positive = d.delta > 0;
            return (
              <g key={d.category}>
                <rect
                  x={positive ? mid : mid - w}
                  y={y + 3}
                  width={w}
                  height={16}
                  rx={4}
                  onClick={onPick && ((e) => onPick(d.category, e.metaKey))}
                  className={`hover:opacity-85 ${onPick ? "cursor-pointer" : "cursor-default"} ${positive ? "fill-critical-strong" : "fill-good-strong"}`}
                  {...bind(
                    <>
                      <div className="text-ink-soft">{d.category}</div>
                      <div className="font-semibold">
                        {positive ? "+" : ""}
                        {fmtNOK(d.delta)}
                      </div>
                      <div className="text-ink-soft">
                        was {fmtNOK(d.previous)}
                      </div>
                    </>,
                  )}
                />
                <text
                  x={positive ? mid - w - 8 : mid + w + 8}
                  y={y + 16}
                  textAnchor={positive ? "end" : "start"}
                  className="fill-ink-soft text-[11px]"
                >
                  <title>{d.category}</title>
                  {ellipsis(
                    d.category,
                    (positive ? mid - w : width - mid - w) - 8,
                  )}
                </text>
                {/* The exact number at the bar's own end — the gridlines are for comparing, this is for reading. */}
                <text
                  x={positive ? mid + w + 6 : mid - w - 6}
                  y={y + 16}
                  textAnchor={positive ? "start" : "end"}
                  className="fill-ink text-[11px] font-semibold"
                >
                  {positive ? "+" : ""}
                  {fmtNOK(d.delta)}
                </text>
              </g>
            );
          })}
        </svg>
      )}
      {node}
    </div>
  );
};
