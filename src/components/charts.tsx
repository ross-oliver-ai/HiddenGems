"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

// Colours come from the active theme (CSS variables), so charts follow theme + dark mode.
const PRIMARY = "var(--primary)";
const MUTED_BAR = "var(--chart-muted)";
const GRID = "var(--chart-grid)";
const TEXT = "var(--muted)";
const DANGER = "var(--danger)";

const gbp = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" });
const gbp0 = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", maximumFractionDigits: 0 });
const signed = (n: number) => (n < 0 ? "−" : "") + gbp.format(Math.abs(n));
const tick = (n: number) => (Math.abs(n) >= 10000 ? `${n < 0 ? "−" : ""}£${Math.round(Math.abs(n) / 1000)}K` : (n < 0 ? "−" : "") + gbp0.format(Math.abs(n)));

const axisText = { fontSize: 11, fill: TEXT } as const;

// Bar with a 4px rounded data end and a square baseline end (works for positive and negative values)
type ShapeProps = { x?: number; y?: number; width?: number; height?: number; fill?: string; value?: number | number[]; horizontal?: boolean };
function RoundedBar({ x = 0, y = 0, width = 0, height = 0, fill, value, horizontal }: ShapeProps) {
  const v = Array.isArray(value) ? value[1] : value ?? 0;
  if (!width || !height) return null;
  const r = Math.min(4, Math.abs(horizontal ? height : width) / 2, Math.abs(horizontal ? width : height));
  let d: string;
  if (horizontal) {
    // bar grows left-to-right (width may be negative for negative values)
    const x0 = width >= 0 ? x : x + width;
    const w = Math.abs(width);
    d = v >= 0
      ? `M${x0},${y} h${w - r} a${r},${r} 0 0 1 ${r},${r} v${height - 2 * r} a${r},${r} 0 0 1 -${r},${r} h-${w - r} z`
      : `M${x0 + w},${y} h-${w - r} a${r},${r} 0 0 0 -${r},${r} v${height - 2 * r} a${r},${r} 0 0 0 ${r},${r} h${w - r} z`;
  } else {
    const y0 = height >= 0 ? y : y + height;
    const h = Math.abs(height);
    d = v >= 0
      ? `M${x},${y0 + h} v-${h - r} a${r},${r} 0 0 1 ${r},-${r} h${width - 2 * r} a${r},${r} 0 0 1 ${r},${r} v${h - r} z`
      : `M${x},${y0} v${h - r} a${r},${r} 0 0 0 ${r},${r} h${width - 2 * r} a${r},${r} 0 0 0 ${r},-${r} v-${h - r} z`;
  }
  return <path d={d} fill={fill} />;
}

type TipRow = { name: string; value: string; color?: string };
function Tip({ active, label, rows }: { active?: boolean; label?: string; rows: TipRow[] }) {
  if (!active) return null;
  return (
    <div className="rounded-2xl border border-border bg-surface px-3 py-2 text-sm shadow-lg">
      {label && <p className="mb-1 font-extrabold">{label}</p>}
      {rows.map((r) => (
        <p key={r.name} className="flex items-center gap-2">
          {r.color && <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: r.color }} />}
          <span className="text-muted">{r.name}</span>
          <span className="ml-auto pl-3 font-bold">{r.value}</span>
        </p>
      ))}
    </div>
  );
}

function ChartBox({ height, label, children }: { height: number; label: string; children: React.ReactElement }) {
  return (
    <div role="img" aria-label={label} style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 320, height }}>
        {children}
      </ResponsiveContainer>
    </div>
  );
}

export function ChartCard({
  title,
  subtitle,
  legend,
  children,
  table,
}: {
  title: string;
  subtitle?: string;
  legend?: { name: string; color: string }[];
  children: React.ReactNode;
  table?: { head: string[]; rows: (string | number)[][] };
}) {
  return (
    <section className="card space-y-3">
      <div>
        <h2 className="font-extrabold">{title}</h2>
        {subtitle && <p className="text-sm text-muted">{subtitle}</p>}
      </div>
      {legend && (
        <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted">
          {legend.map((l) => (
            <li key={l.name} className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm" style={{ background: l.color }} />
              {l.name}
            </li>
          ))}
        </ul>
      )}
      {children}
      {table && (
        <details className="text-sm">
          <summary className="cursor-pointer list-none font-bold text-primary">View as table</summary>
          <div className="mt-2 overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="text-muted">
                  {table.head.map((h, i) => (
                    <th key={h} className={`py-1 pr-3 font-bold ${i > 0 ? "text-right" : ""}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {table.rows.map((r, n) => (
                  <tr key={n} className="border-t border-border">
                    {r.map((c, i) => (
                      <td key={i} className={`py-1 pr-3 ${i > 0 ? "text-right tabular-nums" : "font-semibold"}`}>{c}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
    </section>
  );
}

type SeriesPoint = { key: string; label: string; full: string; spent: number; revenue: number; profit: number };

// With few, short labels show them all; otherwise let Recharts thin them out
const xInterval = (data: SeriesPoint[]) => (data.length <= 12 && data.every((d) => d.label.length <= 5) ? 0 : "preserveStartEnd");

export function ProfitChart({ data }: { data: SeriesPoint[] }) {
  return (
    <ChartBox height={220} label="Profit over time">
      <BarChart data={data} margin={{ top: 8, right: 4, bottom: 0, left: 0 }} barCategoryGap="20%">
        <CartesianGrid vertical={false} stroke={GRID} />
        <XAxis dataKey="label" tick={axisText} tickLine={false} axisLine={{ stroke: GRID }} interval={xInterval(data)} minTickGap={14} />
        <YAxis tick={axisText} tickLine={false} axisLine={false} tickFormatter={tick} width={44} />
        <ReferenceLine y={0} stroke={GRID} />
        <Tooltip
          cursor={{ fill: "var(--primary-soft)", opacity: 0.6 }}
          content={({ active, payload }) => (
            <Tip active={active} label={(payload?.[0]?.payload as SeriesPoint | undefined)?.full} rows={[{ name: "Profit", value: signed(Number(payload?.[0]?.value ?? 0)), color: PRIMARY }]} />
          )}
        />
        <Bar dataKey="profit" maxBarSize={24} shape={(p: ShapeProps) => <RoundedBar {...p} />}>
          {data.map((d) => (
            <Cell key={d.key} fill={d.profit < 0 ? DANGER : PRIMARY} />
          ))}
        </Bar>
      </BarChart>
    </ChartBox>
  );
}

export function SpentRevenueChart({ data }: { data: SeriesPoint[] }) {
  return (
    <ChartBox height={220} label="Spent compared with revenue over time">
      <BarChart data={data} margin={{ top: 8, right: 4, bottom: 0, left: 0 }} barCategoryGap="20%" barGap={2}>
        <CartesianGrid vertical={false} stroke={GRID} />
        <XAxis dataKey="label" tick={axisText} tickLine={false} axisLine={{ stroke: GRID }} interval={xInterval(data)} minTickGap={14} />
        <YAxis tick={axisText} tickLine={false} axisLine={false} tickFormatter={tick} width={44} />
        <Tooltip
          cursor={{ fill: "var(--primary-soft)", opacity: 0.6 }}
          content={({ active, payload }) => (
            <Tip
              active={active}
              label={(payload?.[0]?.payload as SeriesPoint | undefined)?.full}
              rows={[
                { name: "Spent", value: signed(Number(payload?.find((p) => p.dataKey === "spent")?.value ?? 0)), color: MUTED_BAR },
                { name: "Revenue", value: signed(Number(payload?.find((p) => p.dataKey === "revenue")?.value ?? 0)), color: PRIMARY },
              ]}
            />
          )}
        />
        <Bar dataKey="spent" fill={MUTED_BAR} maxBarSize={12} shape={(p: ShapeProps) => <RoundedBar {...p} />} />
        <Bar dataKey="revenue" fill={PRIMARY} maxBarSize={12} shape={(p: ShapeProps) => <RoundedBar {...p} />} />
      </BarChart>
    </ChartBox>
  );
}

export type RankedRow = { name: string; value: number; items: number; roi?: number | null };

/** Ranked horizontal bars, one hue; negative values turn red. */
export function RankedBars({ rows, kind, label }: { rows: RankedRow[]; kind: "money" | "count"; label: string }) {
  const fmtVal = (n: number) => (kind === "money" ? signed(n) : String(n));
  return (
    <ChartBox height={Math.max(90, rows.length * 38 + 16)} label={label}>
      <BarChart data={rows} layout="vertical" margin={{ top: 0, right: 56, bottom: 0, left: 0 }} barCategoryGap="30%">
        <XAxis type="number" hide domain={[(min: number) => Math.min(0, min), (max: number) => Math.max(0, max)]} />
        <YAxis
          type="category"
          dataKey="name"
          width={120}
          tick={{ fontSize: 12, fill: TEXT }}
          tickLine={false}
          axisLine={false}
          tickFormatter={(v: string) => (v.length > 19 ? `${v.slice(0, 18)}…` : v)}
        />
        <Tooltip
          cursor={{ fill: "var(--primary-soft)", opacity: 0.6 }}
          content={({ active, payload }) => {
            const r = payload?.[0]?.payload as RankedRow | undefined;
            if (!r) return null;
            const rowsOut: TipRow[] = [{ name: kind === "money" ? "Profit" : "Items sent", value: fmtVal(r.value), color: r.value < 0 ? DANGER : PRIMARY }];
            if (kind === "money") rowsOut.push({ name: "Items sold", value: String(r.items) });
            if (kind === "money" && r.roi !== null && r.roi !== undefined) rowsOut.push({ name: "Return on cost", value: `${r.roi}%` });
            return <Tip active={active} label={r.name} rows={rowsOut} />;
          }}
        />
        <Bar dataKey="value" maxBarSize={24} shape={(p: ShapeProps) => <RoundedBar {...p} horizontal />}>
          {rows.map((r) => (
            <Cell key={r.name} fill={r.value < 0 ? DANGER : PRIMARY} />
          ))}
          <LabelList
            dataKey="value"
            content={(props) => {
              const { x = 0, y = 0, width = 0, height = 0, value } = props as { x?: number; y?: number; width?: number; height?: number; value?: number | string };
              // label sits just past the right-hand end of the bar (the zero line for negative bars)
              const right = Math.max(Number(x), Number(x) + Number(width));
              return (
                <text x={right + 6} y={Number(y) + Number(height) / 2} dominantBaseline="central" fontSize={12} fontWeight={700} fill="var(--foreground)">
                  {fmtVal(Number(value))}
                </text>
              );
            }}
          />
        </Bar>
      </BarChart>
    </ChartBox>
  );
}

export function AgeingChart({ data }: { data: { label: string; count: number }[] }) {
  return (
    <ChartBox height={190} label="How many days listings have been live">
      <BarChart data={data} margin={{ top: 18, right: 4, bottom: 0, left: 0 }} barCategoryGap="25%">
        <CartesianGrid vertical={false} stroke={GRID} />
        <XAxis dataKey="label" tick={axisText} tickLine={false} axisLine={{ stroke: GRID }} />
        <YAxis tick={axisText} tickLine={false} axisLine={false} allowDecimals={false} width={28} />
        <Tooltip
          cursor={{ fill: "var(--primary-soft)", opacity: 0.6 }}
          content={({ active, payload, label }) => (
            <Tip active={active} label={`${label} days listed`} rows={[{ name: "Listings", value: String(payload?.[0]?.value ?? 0), color: PRIMARY }]} />
          )}
        />
        <Bar dataKey="count" fill={PRIMARY} maxBarSize={24} shape={(p: ShapeProps) => <RoundedBar {...p} />}>
          <LabelList dataKey="count" position="top" style={{ fontSize: 12, fontWeight: 700, fill: "var(--foreground)" }} />
        </Bar>
      </BarChart>
    </ChartBox>
  );
}

export const LEGEND_SPENT = { name: "Spent", color: MUTED_BAR };
export const LEGEND_REVENUE = { name: "Revenue", color: PRIMARY };
