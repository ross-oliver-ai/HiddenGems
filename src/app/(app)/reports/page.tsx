import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { Confetti } from "@/components/Confetti";
import { money, todayLondon } from "@/lib/format";
import { PERIODS } from "@/lib/periods";
import { computeReport, type Ranked } from "@/lib/reports";
import {
  AgeingChart,
  ChartCard,
  LEGEND_REVENUE,
  LEGEND_SPENT,
  ProfitChart,
  RankedBars,
  SpentRevenueChart,
} from "@/components/charts";

type Params = { p?: string; o?: string; from?: string; to?: string; at?: string; m?: string; y?: string };

const signed = (n: number) => (n < 0 ? "−" : "") + money(Math.abs(n));
const pct = (n: number | null) => (n === null ? "–" : `${n}%`);

function fold(rows: Ranked[], keep = 8): Ranked[] {
  if (rows.length <= keep) return rows;
  const rest = rows.slice(keep);
  return [
    ...rows.slice(0, keep),
    { name: `Other (${rest.length})`, value: Math.round(rest.reduce((s, r) => s + r.value, 0) * 100) / 100, items: rest.reduce((s, r) => s + r.items, 0) },
  ];
}

function Tile({ label, value, sub }: { label: string; value: React.ReactNode; sub?: string }) {
  return (
    <div className="card">
      <p className="text-2xl font-extrabold leading-tight">{value}</p>
      <p className="text-sm font-bold text-muted">{label}</p>
      {sub && <p className="text-xs text-muted">{sub}</p>}
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="rounded-2xl bg-surface-2 px-3 py-6 text-center text-sm text-muted">{children}</p>;
}

export default async function ReportsPage({ searchParams }: { searchParams: Promise<Params> }) {
  const user = await requireUser();
  const params = await searchParams;
  // "Jump to" form sends month (m) and/or year (y); turn it into a date inside that period
  const jumpY = /^\d{4}$/.test(params.y ?? "") ? params.y : undefined;
  const jumpM = /^(0[1-9]|1[0-2])$/.test(params.m ?? "") ? params.m : undefined;
  const at = params.at ?? (jumpY ? `${jumpY}-${jumpM ?? "06"}-01` : undefined);
  const r = await computeReport(user, { ...params, at });
  const { period: per, kpi, stock, periodGoal: goal } = r;

  const link = (p: string, o = 0) => `/reports?p=${p}${o ? `&o=${o}` : ""}`;
  const noActivity = kpi.boughtCount === 0 && kpi.soldCount === 0 && kpi.writtenOff === 0;
  const bucketWord = per.bucket === "day" ? "day" : per.bucket === "week" ? "week" : "month";

  const drill = per.bucket === "month" ? "month" : per.bucket === "week" ? "week" : null;
  const thisYear = Number(todayLondon().slice(0, 4));
  const firstYear = r.earliest ? Math.min(Number(r.earliest.slice(0, 4)), thisYear) : thisYear;
  const years = Array.from({ length: thisYear - firstYear + 1 }, (_, n) => thisYear - n);
  const showJump = ["month", "quarter", "year", "taxyear", "week"].includes(per.id);
  const showMonthSelect = per.id === "month" || per.id === "quarter";
  const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

  const isWholeMonth =
    per.id === "month" || (per.from.slice(8) === "01" && per.from.slice(0, 7) === per.to.slice(0, 7) && per.to.slice(8) >= "28");
  const goalMet = !!goal && goal.target > 0 && goal.current >= goal.target;
  const goalPct = goal && goal.target > 0 ? Math.max(0, Math.min(100, Math.round((goal.current / goal.target) * 100))) : 0;

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-extrabold tracking-tight">Reports</h1>

      {/* Period picker */}
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
        {PERIODS.map((x) => (
          <Link
            key={x.id}
            href={x.id === "custom" ? `/reports?p=custom` : link(x.id)}
            className={`shrink-0 rounded-full px-4 py-2 text-sm font-bold ${x.id === per.id ? "bg-primary text-primary-contrast" : "bg-surface-2 text-muted"}`}
          >
            {x.label}
          </Link>
        ))}
      </div>

      {per.navigable ? (
        <div className="flex items-center justify-between gap-2">
          <Link href={link(per.id, per.offset - 1)} aria-label="Previous period" className="btn-soft !min-h-10 w-12 text-xl">‹</Link>
          <p className="text-center font-extrabold">{per.label}</p>
          {per.offset < 0 ? (
            <Link href={link(per.id, per.offset + 1)} aria-label="Next period" className="btn-soft !min-h-10 w-12 text-xl">›</Link>
          ) : (
            <span className="w-12" />
          )}
        </div>
      ) : per.id === "custom" ? (
        <form action="/reports" className="card grid grid-cols-2 gap-3">
          <input type="hidden" name="p" value="custom" />
          <div>
            <label className="label" htmlFor="from">From</label>
            <input id="from" name="from" type="date" defaultValue={per.from} className="field" required />
          </div>
          <div>
            <label className="label" htmlFor="to">To</label>
            <input id="to" name="to" type="date" defaultValue={per.to} className="field" required />
          </div>
          <button type="submit" className="btn col-span-2">Show report</button>
        </form>
      ) : (
        <p className="text-center font-extrabold">{per.label}</p>
      )}

      {showJump && (
        <details className="card">
          <summary className="cursor-pointer list-none text-center font-bold text-primary">Jump to a specific {per.id === "week" ? "date" : showMonthSelect ? "month" : "year"}</summary>
          <form action="/reports" className="mt-3 grid grid-cols-2 gap-3">
            <input type="hidden" name="p" value={per.id} />
            {per.id === "week" ? (
              <div className="col-span-2">
                <label className="label" htmlFor="at">Any date in the week</label>
                <input id="at" name="at" type="date" max={todayLondon()} defaultValue={per.from} className="field" required />
              </div>
            ) : (
              <>
                {showMonthSelect && (
                  <div>
                    <label className="label" htmlFor="m">Month</label>
                    <select id="m" name="m" defaultValue={per.from.slice(5, 7)} className="field">
                      {MONTH_NAMES.map((n, i) => (
                        <option key={n} value={String(i + 1).padStart(2, "0")}>{n}</option>
                      ))}
                    </select>
                  </div>
                )}
                <div className={showMonthSelect ? "" : "col-span-2"}>
                  <label className="label" htmlFor="y">{per.id === "taxyear" ? "Tax year starting April" : "Year"}</label>
                  <select id="y" name="y" defaultValue={per.id === "taxyear" ? per.from.slice(0, 4) : per.from.slice(0, 4)} className="field">
                    {years.map((yy) => (
                      <option key={yy} value={yy}>{per.id === "taxyear" ? `${yy}/${String(yy + 1).slice(2)}` : yy}</option>
                    ))}
                  </select>
                </div>
              </>
            )}
            <button type="submit" className="btn col-span-2">Show</button>
          </form>
        </details>
      )}

      {noActivity && (
        <Empty>Nothing bought or sold in this period yet. Try another period, or add some items.</Empty>
      )}

      {/* Headline */}
      <section className="card">
        <p className="text-sm font-bold text-muted">{kpi.profit < 0 ? "Loss" : "Profit"}</p>
        <p className="text-5xl font-extrabold leading-tight tracking-tight">
          <span aria-hidden className="mr-1 text-3xl">{kpi.profit < 0 ? "▼" : "▲"}</span>
          {signed(Math.abs(kpi.profit))}
        </p>
        <p className="mt-1 text-sm text-muted">
          {money(kpi.revenue)} revenue − {money(kpi.cogs)} cost of items sold
          {kpi.writtenOff > 0 ? ` − ${money(kpi.writtenOff)} written off` : ""}
        </p>
      </section>

      {goal && (
        <section className="card space-y-2" aria-label="Profit goal progress">
          <div className="flex items-baseline justify-between">
            <h2 className="font-extrabold">{isWholeMonth ? `${per.label} goal` : "Goal for this period"}</h2>
            <p className="text-sm font-bold">{signed(goal.current)} of {money(goal.target)}</p>
          </div>
          <div className="h-3 overflow-hidden rounded-full bg-primary-soft" role="progressbar" aria-valuenow={goalPct} aria-valuemin={0} aria-valuemax={100}>
            <div className="h-full rounded-full bg-primary" style={{ width: `${goalPct}%` }} />
          </div>
          <p className="text-xs text-muted">{goalPct}% of {isWholeMonth ? `your ${money(goal.monthly)} monthly profit goal.` : `your profit goal for this period, which is your ${money(goal.monthly)} monthly goal scaled to the days shown.`}</p>
          {goalMet && (
            <>
              <p className="text-sm font-bold text-primary">🎉 Goal smashed!</p>
              <Confetti />
            </>
          )}
        </section>
      )}

      {/* Key numbers */}
      <div className="grid grid-cols-2 gap-3">
        <Tile label="Spent" value={money(kpi.spent)} sub={`${kpi.boughtCount} item${kpi.boughtCount === 1 ? "" : "s"} bought`} />
        <Tile label="Revenue" value={money(kpi.revenue)} sub={`${kpi.soldCount} item${kpi.soldCount === 1 ? "" : "s"} sold`} />
        <Tile label="Profit margin" value={pct(kpi.margin)} sub="of revenue, before write-offs" />
        <Tile label="Return on cost" value={pct(kpi.roi)} sub="profit ÷ cost of items sold" />
        <Tile label="Avg profit per item" value={kpi.avgProfit === null ? "–" : signed(kpi.avgProfit)} />
        <Tile label="Avg days to sell" value={kpi.avgDaysToSell === null ? "–" : kpi.avgDaysToSell} sub="from listing to sale" />
        <Tile
          label="Sell-through"
          value={kpi.sellThrough ? `${Math.round((kpi.sellThrough.sold / kpi.sellThrough.of) * 100)}%` : "–"}
          sub={kpi.sellThrough ? `${kpi.sellThrough.sold} of ${kpi.sellThrough.of} bought have sold` : undefined}
        />
        <Tile label="Written off" value={money(kpi.writtenOff)} sub="unsold or donated" />
      </div>

      {/* Over time */}
      <ChartCard
        title="Profit over time"
        subtitle={`By ${bucketWord}${per.bucket === "week" ? " (week starting Monday)" : ""}`}
        table={{ head: [per.bucket === "month" ? "Month" : per.bucket === "week" ? "Week of" : "Day", "Profit"], rows: r.series.map((s) => [s.full, signed(s.profit)]) }}
      >
        {noActivity ? <Empty>No data for this period.</Empty> : <ProfitChart key={`${per.id}-${per.from}`} data={r.series} drill={drill} />}
      </ChartCard>

      <ChartCard
        title="Spent vs revenue"
        subtitle={`By ${bucketWord}`}
        legend={[LEGEND_SPENT, LEGEND_REVENUE]}
        table={{ head: ["Period", "Spent", "Revenue"], rows: r.series.map((s) => [s.full, money(s.spent), money(s.revenue)]) }}
      >
        {noActivity ? <Empty>No data for this period.</Empty> : <SpentRevenueChart key={`${per.id}-${per.from}`} data={r.series} drill={drill} />}
      </ChartCard>

      {/* Breakdowns */}
      <ChartCard
        title="Profit by category"
        table={{ head: ["Category", "Profit", "Sold"], rows: r.byCategory.map((x) => [x.name, signed(x.value), x.items]) }}
      >
        {r.byCategory.length === 0 ? <Empty>No sales yet.</Empty> : <RankedBars rows={fold(r.byCategory)} kind="money" label="Profit by category" />}
      </ChartCard>

      <ChartCard
        title="Best charity shops"
        subtitle="Profit by shop (tap a bar for return on cost)"
        table={{ head: ["Shop", "Profit", "Sold", "Return"], rows: r.byShop.map((x) => [x.name, signed(x.value), x.items, pct(x.roi ?? null)]) }}
      >
        {r.byShop.length === 0 ? <Empty>No sales yet.</Empty> : <RankedBars rows={fold(r.byShop)} kind="money" label="Profit by charity shop" />}
      </ChartCard>

      <ChartCard
        title="Postage used"
        subtitle="Items sent by each service"
        table={{ head: ["Service", "Items"], rows: r.byPostal.map((x) => [x.name, x.value]) }}
      >
        {r.byPostal.length === 0 ? <Empty>No sales yet.</Empty> : <RankedBars rows={r.byPostal.map((x) => ({ ...x, items: x.value }))} kind="count" label="Items sent by postal service" />}
      </ChartCard>

      {/* Stock now */}
      <section className="space-y-3">
        <h2 className="pt-2 text-lg font-extrabold">Stock right now</h2>
        <div className="grid grid-cols-2 gap-3">
          <Tile label="In stock" value={stock.toList + stock.listed} sub={`${stock.toList} to list · ${stock.listed} listed`} />
          <Tile label="Stock value (cost)" value={money(stock.costValue)} />
          <Tile label="Listed asking total" value={money(stock.askingValue)} sub="if everything sold at asking price" />
          <Tile label="Stale listings" value={stock.staleCount} sub={`${user.staleAfterDays}+ days listed`} />
        </div>
        <ChartCard
          title="How long listings have been live"
          subtitle="Days since listed"
          table={{ head: ["Days listed", "Listings"], rows: stock.ageing.map((a) => [a.label, a.count]) }}
        >
          {stock.listed === 0 ? <Empty>Nothing is listed at the moment.</Empty> : <AgeingChart data={stock.ageing} />}
        </ChartCard>
      </section>

      {/* Best / worst */}
      {(r.best.length > 0 || r.worst.length > 0) && (
        <section className="card space-y-4">
          {r.best.length > 0 && (
            <div>
              <h2 className="font-extrabold">Best sellers</h2>
              <ol className="mt-2 divide-y divide-border text-sm">
                {r.best.map((b, n) => (
                  <li key={`${b.name}-${n}`} className="flex justify-between gap-3 py-2">
                    <span className="min-w-0 truncate font-semibold">{n + 1}. {b.name}</span>
                    <span className="shrink-0 font-extrabold">{signed(b.profit)}</span>
                  </li>
                ))}
              </ol>
            </div>
          )}
          {r.worst.length > 0 && (
            <div>
              <h2 className="font-extrabold">Biggest losses</h2>
              <ol className="mt-2 divide-y divide-border text-sm">
                {r.worst.map((b, n) => (
                  <li key={`${b.name}-${n}`} className="flex justify-between gap-3 py-2">
                    <span className="min-w-0 truncate font-semibold">{b.name}</span>
                    <span className="shrink-0 font-extrabold text-danger">{signed(b.profit)}</span>
                  </li>
                ))}
              </ol>
            </div>
          )}
        </section>
      )}

      <details className="card text-sm">
        <summary className="cursor-pointer list-none font-extrabold">How these numbers are worked out</summary>
        <ul className="mt-3 list-disc space-y-1.5 pl-5 text-muted">
          <li><b className="text-foreground">Spent</b>: what you paid for items bought in the period (by buy date).</li>
          <li><b className="text-foreground">Revenue</b>: what items sold for in the period (by sold date), minus any refunds.</li>
          <li><b className="text-foreground">Profit</b>: revenue minus what you paid for those same items, minus the cost of anything written off (marked unsold or donated) in the period.</li>
          <li><b className="text-foreground">Profit margin</b>: profit from sales ÷ revenue. <b className="text-foreground">Return on cost</b>: profit from sales ÷ cost of items sold.</li>
          <li><b className="text-foreground">Sell-through</b>: of the items you bought in the period, how many have sold so far.</li>
          <li><b className="text-foreground">Avg days to sell</b>: days from listing (or buying, if no listing date) to selling.</li>
          <li>Postage isn&apos;t included in profit because buyers pay it.</li>
        </ul>
      </details>

      <a href="/reports/export" className="btn-soft w-full">Download all items (CSV)</a>
    </div>
  );
}
