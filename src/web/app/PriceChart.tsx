import { useState } from "react";
import { packPrice, unitPrice, type Purchase } from "../../core/items.ts";
import { LegendKey } from "./ChartLegend.tsx";
import { useTooltip } from "./Charts.tsx";
import { SwitchField } from "./FilterBar.tsx";
import {
  fmtDate,
  fmtNOKExact,
  monthLabel,
  niceStep,
  toggled,
  useWidth,
} from "./format.ts";

export interface PriceLine {
  name: string;
  purchases: Purchase[];
}

interface PriceChartProps {
  lines: PriceLine[];
  onPick: (purchase: Purchase) => void;
}

type Point = { p: Purchase; x: number; y: number; name: string; color: string };

const dayOf = (date: string) => Date.parse(`${date}T00:00:00Z`) / 864e5;

export const unitText = (p: Purchase) => {
  const u = unitPrice(p);
  return u ? `${fmtNOKExact(u.price)}/${u.per}` : "";
};

export const PriceChart = ({ lines, onPick }: PriceChartProps) => {
  const [ref, width] = useWidth();
  const { show, hide, node } = useTooltip();
  const [hidden, setHidden] = useState<ReadonlySet<string>>(new Set());
  const [perUnit, setPerUnit] = useState(false);
  const [near, setNear] = useState<Point | null>(null);

  const per = [
    ...Map.groupBy(
      lines.flatMap((l) => l.purchases).flatMap((p) => unitPrice(p)?.per ?? []),
      (u) => u,
    ),
  ].toSorted((a, b) => b[1].length - a[1].length)[0]?.[0];
  const byUnit = perUnit && per !== undefined;

  const drawn = lines
    .map((l, k) => {
      const color = `var(--chart-${(k % 5) + 1})`;
      return {
        name: l.name,
        color,
        points: l.purchases
          .filter((p) => !byUnit || unitPrice(p)?.per === per)
          .toSorted((a, b) => a.date.localeCompare(b.date))
          .map((p) => ({
            p,
            x: dayOf(p.date),
            y: byUnit ? unitPrice(p)!.price : packPrice(p),
            name: l.name,
            color,
          })),
      };
    })
    .filter((l) => l.points.length);
  const shown = drawn.filter((l) => !hidden.has(l.name));
  const points = shown.flatMap((l) => l.points);

  const height = 200;
  const padL = 50;
  const padR = 12;
  const padT = 10;
  const padB = 24;
  const inset = 8;
  const plotW = Math.max(width - padL - padR, 20);
  const plotH = height - padT - padB;

  const xs = drawn.flatMap((l) => l.points.map((p) => p.x));
  const [x0, x1] = [Math.min(...xs), Math.max(...xs)];
  const px = (x: number) =>
    padL +
    inset +
    (x1 === x0
      ? (plotW - 2 * inset) / 2
      : ((x - x0) / (x1 - x0)) * (plotW - 2 * inset));

  const ys = (points.length ? points : drawn.flatMap((l) => l.points)).map(
    (p) => p.y,
  );
  const [min, max] = [Math.min(...ys), Math.max(...ys)];
  const step = niceStep(max - min || max);
  const lo = Math.floor(min / step) * step;
  const hi = Math.max(Math.ceil(max / step) * step, lo + step);
  const py = (v: number) => padT + plotH - ((v - lo) / (hi - lo)) * plotH;
  const ticks = Array.from(
    { length: Math.round((hi - lo) / step) + 1 },
    (_, i) => lo + i * step,
  );

  const first = new Date(x0 * 864e5);
  const months = Array.from(
    {
      length:
        (new Date(x1 * 864e5).getUTCFullYear() - first.getUTCFullYear()) * 12 +
        new Date(x1 * 864e5).getUTCMonth() -
        first.getUTCMonth() +
        1,
    },
    (_, i) =>
      new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + i, 1)),
  );
  const perMonth = ((plotW - 2 * inset) * 30.4) / Math.max(x1 - x0, 1);
  const every = [1, 2, 3, 4, 6, 12].find((n) => n * perMonth >= 36) ?? 12;
  const marks = months
    .filter((d) => d.getTime() / 864e5 >= x0 && d.getUTCMonth() % every === 0)
    .map((d) => {
      const month = d.toISOString().slice(0, 7);
      return {
        x: px(d.getTime() / 864e5),
        text: month.endsWith("-01") ? month.slice(0, 4) : monthLabel(month),
      };
    });
  const labels = marks.length
    ? marks
    : [{ x: px(x0), text: monthLabel(first.toISOString().slice(0, 7)) }];

  const nearest = (e: React.PointerEvent | React.MouseEvent) => {
    const box = e.currentTarget.getBoundingClientRect();
    const [mx, my] = [e.clientX - box.left, e.clientY - box.top];
    return points.reduce<Point | null>(
      (best, p) =>
        !best ||
        Math.hypot(px(p.x) - mx, py(p.y) - my) <
          Math.hypot(px(best.x) - mx, py(best.y) - my)
          ? p
          : best,
      null,
    );
  };

  const track = (e: React.PointerEvent<SVGSVGElement>) => {
    const at = nearest(e);
    setNear(at);
    if (!at) return hide();
    show(
      e,
      <div className="grid gap-0.5 tabular-nums">
        <span className="flex items-center gap-1.5 font-semibold">
          <span
            className="size-2 shrink-0 rounded-full"
            style={{ background: at.color }}
          />
          {at.name}
        </span>
        <span className="text-muted-foreground">
          {fmtDate(at.p.date)} · {at.p.store}
        </span>
        <span>
          {[at.p.size, fmtNOKExact(packPrice(at.p)), unitText(at.p)]
            .filter(Boolean)
            .join(" · ")}
        </span>
      </div>,
    );
  };

  const leave = () => {
    setNear(null);
    hide();
  };

  return (
    <div ref={ref}>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-x-3.5 gap-y-2">
        <div className="flex flex-wrap gap-3.5 text-xs text-muted-foreground">
          {drawn.length > 1 &&
            drawn.map(({ name, color }) => (
              <LegendKey
                key={name}
                name={name}
                on={!hidden.has(name)}
                onToggle={() => setHidden((prev) => toggled(prev, name))}
              >
                <span
                  className="inline-block h-0.75 w-3 rounded-sm"
                  style={{ background: color }}
                />
                {name}
              </LegendKey>
            ))}
        </div>
        {per && (
          <SwitchField
            label={`Per ${per}`}
            checked={perUnit}
            onChange={setPerUnit}
          />
        )}
      </div>
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={`Price for each purchase${byUnit ? ` per ${per}` : ""}`}
        className="cursor-pointer"
        onPointerDown={track}
        onPointerMove={track}
        onPointerLeave={leave}
        onClick={(e) => {
          const at = nearest(e);
          if (at) onPick(at.p);
        }}
      >
        {ticks.map((v) => (
          <g key={v}>
            <line
              x1={padL}
              x2={width - padR}
              y1={py(v)}
              y2={py(v)}
              className="stroke-border"
            />
            <text
              x={padL - 8}
              y={py(v) + 3}
              textAnchor="end"
              className="fill-muted-foreground text-[11px]"
            >
              {fmtNOKExact(v).replace(" kr", "")}
            </text>
          </g>
        ))}
        {labels.map(({ x, text }) => (
          <text
            key={x}
            x={x}
            y={padT + plotH + 18}
            textAnchor="middle"
            className="fill-muted-foreground text-[11px]"
          >
            {text}
          </text>
        ))}
        {shown.map((l) => (
          <g key={l.name}>
            <path
              d={l.points
                .map((p, i) =>
                  i ? `H${px(p.x)}V${py(p.y)}` : `M${px(p.x)},${py(p.y)}`,
                )
                .join("")}
              strokeWidth={1.5}
              fill="none"
              style={{ stroke: l.color }}
            />
            {l.points.map((p, i) => (
              <circle
                key={i}
                cx={px(p.x)}
                cy={py(p.y)}
                r={near?.p === p.p ? 5 : 3}
                strokeWidth={near?.p === p.p ? 2 : 0}
                className="stroke-background"
                style={{ fill: l.color }}
              />
            ))}
          </g>
        ))}
        <line
          x1={padL}
          x2={padL}
          y1={padT}
          y2={padT + plotH}
          className="stroke-foreground/20"
        />
        <line
          x1={padL}
          x2={width - padR}
          y1={padT + plotH}
          y2={padT + plotH}
          className="stroke-foreground/20"
        />
      </svg>
      {node}
    </div>
  );
};
