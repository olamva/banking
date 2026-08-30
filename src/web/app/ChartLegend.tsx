import type { ReactNode } from "react";
import type { Mark } from "./SpendLines.tsx";
interface ChartLegendProps {
  income: boolean;
  spend: boolean;
  trend: boolean;
  compareLabel?: string;
  hidden: ReadonlySet<Mark>;
  onToggle: (mark: Mark) => void;
}

interface LegendKeyProps {
  on: boolean;
  onToggle: () => void;
  name: string;
  children: ReactNode;
}

const LegendKey = ({ on, onToggle, name, children }: LegendKeyProps) => (
  <button
    type="button"
    onClick={onToggle}
    aria-pressed={on}
    title={`${on ? "Hide" : "Show"} ${name}`}
    className={`inline-flex items-center gap-1.5 rounded-sm hover:text-ink ${on ? "" : "opacity-40"}`}
  >
    {children}
  </button>
);

export const ChartLegend = ({
  income,
  spend,
  trend,
  compareLabel,
  hidden,
  onToggle,
}: ChartLegendProps) => {
  const key = (mark: Mark) => ({
    on: !hidden.has(mark),
    onToggle: () => onToggle(mark),
  });
  return (
    <div className="mb-2 flex flex-wrap gap-3.5 text-xs text-ink-soft">
      {spend && (
        <LegendKey {...key("out")} name="the spending line">
          <span className="inline-block h-0.75 w-3 rounded-sm bg-critical-strong" />
          Spent
        </LegendKey>
      )}
      {income && (
        <LegendKey {...key("in")} name="the income line">
          <span className="inline-block h-0.75 w-3 rounded-sm bg-good-strong" />
          Income
        </LegendKey>
      )}
      {/* Blue, because red would put two claims about spending in one colour,
          with the compared period already dashed and red.

          The key names it and no more: a straight line has no single rate, so
          any percentage on it is whatever its base and period are chosen to be.
          The line says "spending drifts this way over this window", which is
          the whole of what a least-squares fit knows. */}
      {trend && (
        <LegendKey {...key("trend")} name="the fitted trend">
          <svg aria-hidden width={16} height={3} className="shrink-0">
            <line
              x1={0}
              x2={16}
              y1={1.5}
              y2={1.5}
              strokeWidth={3}
              strokeDasharray="7 5"
              className="stroke-series-1"
            />
          </svg>
          Trend
        </LegendKey>
      )}
      {/* One key for both dashed lines — the dashes are what mark the period, and
          the colours mean the same here as they do above.

          Drawn as SVG rather than as a dashed CSS border, which is the swatch
          this had first: a 12px border draws one dash and reads as a solid grey
          rule, which is neither dashed nor either of the two colours it stands
          for. Same stroke and same gap as the chart, so the key and the line it
          explains are the same mark. */}
      {compareLabel && (
        <LegendKey {...key("compare")} name={compareLabel}>
          <svg
            aria-hidden
            width={16}
            height={income && spend ? 9 : 3}
            className="shrink-0 opacity-40"
          >
            {spend && (
              <line
                x1={0}
                x2={16}
                y1={1.5}
                y2={1.5}
                strokeWidth={3}
                strokeDasharray="4 3"
                className="stroke-critical-strong"
              />
            )}
            {income && (
              <line
                x1={0}
                x2={16}
                y1={spend ? 7.5 : 1.5}
                y2={spend ? 7.5 : 1.5}
                strokeWidth={3}
                strokeDasharray="4 3"
                className="stroke-good-strong"
              />
            )}
          </svg>
          {compareLabel}
        </LegendKey>
      )}
    </div>
  );
};
