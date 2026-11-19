import { eq } from "drizzle-orm";
import { db } from "@/db";
import { categories, items, postalServices, shops, type User } from "@/db/schema";
import { daysBetween, todayLondon } from "./format";
import { bucketKey, listBuckets, prorateGoal, resolvePeriod, type Period, type PeriodInput } from "./periods";

const londonDate = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London" }).format(d);
const r2 = (n: number) => Math.round(n * 100) / 100;

type Outcome = {
  date: string;
  name: string;
  category: string;
  shop: string;
  postal: string | null; // null for write-offs
  revenue: number;
  cost: number;
  profit: number;
  sale: boolean;
  daysToSell: number | null;
};

export type Ranked = { name: string; value: number; items: number; spent?: number; roi?: number | null };

export type Report = {
  period: Period;
  earliest: string | null;
  kpi: {
    spent: number;
    boughtCount: number;
    revenue: number;
    cogs: number;
    writtenOff: number;
    profit: number;
    margin: number | null;
    roi: number | null;
    soldCount: number;
    avgProfit: number | null;
    avgDaysToSell: number | null;
    sellThrough: { sold: number; of: number } | null;
  };
  series: { key: string; label: string; full: string; spent: number; revenue: number; profit: number }[];
  byCategory: Ranked[];
  byShop: Ranked[];
  byPostal: Ranked[];
  best: { id?: number; name: string; profit: number }[];
  worst: { name: string; profit: number }[];
  stock: {
    toList: number;
    listed: number;
    costValue: number;
    askingValue: number;
    ageing: { label: string; count: number }[];
    staleCount: number;
  };
  goal: { target: number; current: number } | null;
  /** The monthly goal scaled to the chosen period, against profit in that period */
  periodGoal: { target: number; current: number; monthly: number } | null;
};

const AGEING = [
  { label: "0–7", min: 0, max: 7 },
  { label: "8–14", min: 8, max: 14 },
  { label: "15–30", min: 15, max: 30 },
  { label: "31–60", min: 31, max: 60 },
  { label: "60+", min: 61, max: Infinity },
];

function rank(outcomes: Outcome[], keyOf: (o: Outcome) => string | null, onlySales = false): Ranked[] {
  const map = new Map<string, { value: number; items: number; spent: number; cost: number }>();
  for (const o of outcomes) {
    if (onlySales && !o.sale) continue;
    const key = keyOf(o);
    if (key === null) continue;
    const e = map.get(key) ?? { value: 0, items: 0, spent: 0, cost: 0 };
    e.value += onlySales ? 1 : o.profit;
    e.items += o.sale ? 1 : 0;
    e.cost += o.cost;
    map.set(key, e);
  }
  return [...map.entries()]
    .map(([name, e]) => ({
      name,
      value: r2(e.value),
      items: e.items,
      roi: !onlySales && e.cost > 0 ? r2((e.value / e.cost) * 100) : null,
    }))
    .sort((a, b) => b.value - a.value);
}

export async function computeReport(user: User, input: PeriodInput): Promise<Report> {
  const rows = await db
    .select({ item: items, shop: shops.name, category: categories.name, postal: postalServices.name })
    .from(items)
    .leftJoin(shops, eq(items.shopId, shops.id))
    .leftJoin(categories, eq(items.categoryId, categories.id))
    .leftJoin(postalServices, eq(items.postalServiceId, postalServices.id))
    .where(eq(items.userId, user.id));

  const today = todayLondon();
  const earliest = rows.reduce<string | null>((m, r) => (m === null || r.item.boughtAt < m ? r.item.boughtAt : m), null);
  const period = resolvePeriod(input, today, earliest);
  const { from, to } = period;
  const inRange = (d: string | null) => !!d && d >= from && d <= to;

  // Every realised result: a sale (net of refunds) or a write-off (unsold / donated)
  const outcomes = (range: { from: string; to: string }): Outcome[] => {
    const inR = (d: string | null) => !!d && d >= range.from && d <= range.to;
    const out: Outcome[] = [];
    for (const { item: i, shop, category, postal } of rows) {
      const cost = Number(i.buyPrice);
      const common = { name: i.name, category: category ?? "No category", shop: shop ?? "No shop" };
      if (i.soldAt && inR(i.soldAt)) {
        const revenue = Number(i.soldPrice ?? 0) - Number(i.refundAmount ?? 0);
        out.push({
          ...common,
          date: i.soldAt,
          postal: postal ?? "Not set",
          revenue,
          cost,
          profit: revenue - cost,
          sale: true,
          daysToSell: daysBetween(i.listedAt ?? i.boughtAt, i.soldAt),
        });
      } else if ((i.status === "unsold" || i.status === "donated") && inR(londonDate(i.updatedAt))) {
        out.push({ ...common, date: londonDate(i.updatedAt), postal: null, revenue: 0, cost, profit: -cost, sale: false, daysToSell: null });
      }
    }
    return out;
  };

  const out = outcomes({ from, to });
  const sales = out.filter((o) => o.sale);
  const writeOffs = out.filter((o) => !o.sale);
  const bought = rows.filter((r) => inRange(r.item.boughtAt)).map((r) => r.item);

  const spent = bought.reduce((s, i) => s + Number(i.buyPrice), 0);
  const revenue = sales.reduce((s, o) => s + o.revenue, 0);
  const cogs = sales.reduce((s, o) => s + o.cost, 0);
  const writtenOff = writeOffs.reduce((s, o) => s + o.cost, 0);
  const profit = revenue - cogs - writtenOff;
  const dts = sales.map((o) => o.daysToSell!).filter((n) => n !== null);

  // Time series
  const buckets = listBuckets(from, to, period.bucket);
  const idx = new Map(buckets.map((b, n) => [b.key, n]));
  const series = buckets.map((b) => ({ key: b.key, label: b.label, full: b.full, spent: 0, revenue: 0, profit: 0 }));
  for (const i of bought) {
    const n = idx.get(bucketKey(i.boughtAt, period.bucket));
    if (n !== undefined) series[n].spent += Number(i.buyPrice);
  }
  for (const o of out) {
    const n = idx.get(bucketKey(o.date, period.bucket));
    if (n === undefined) continue;
    series[n].revenue += o.revenue;
    series[n].profit += o.profit;
  }
  for (const s of series) {
    s.spent = r2(s.spent);
    s.revenue = r2(s.revenue);
    s.profit = r2(s.profit);
  }

  // Stock snapshot (right now, regardless of period)
  const inStock = rows.map((r) => r.item).filter((i) => i.status === "bought" || i.status === "listed");
  const listedNow = inStock.filter((i) => i.status === "listed");
  const ageing = AGEING.map((a) => ({ label: a.label, count: 0 }));
  for (const i of listedNow) {
    const age = daysBetween(i.listedAt ?? i.boughtAt, today);
    const n = AGEING.findIndex((a) => age >= a.min && age <= a.max);
    ageing[n === -1 ? ageing.length - 1 : n].count += 1;
  }

  // Goal: calendar month of today, independent of the chosen period
  let goal: Report["goal"] = null;
  if (user.monthlyProfitGoal !== null) {
    const ms = `${today.slice(0, 7)}-01`;
    const me = `${today.slice(0, 7)}-31`;
    const current = outcomes({ from: ms, to: me }).reduce((s, o) => s + o.profit, 0);
    goal = { target: Number(user.monthlyProfitGoal), current: r2(current) };
  }

  const periodGoal: Report["periodGoal"] =
    user.monthlyProfitGoal !== null
      ? {
          monthly: Number(user.monthlyProfitGoal),
          target: prorateGoal(Number(user.monthlyProfitGoal), period.from, period.to),
          current: r2(profit),
        }
      : null;

  const sorted = [...sales].sort((a, b) => b.profit - a.profit);
  const topShops = rank(out, (o) => o.shop);

  return {
    period,
    earliest,
    kpi: {
      spent: r2(spent),
      boughtCount: bought.length,
      revenue: r2(revenue),
      cogs: r2(cogs),
      writtenOff: r2(writtenOff),
      profit: r2(profit),
      margin: revenue > 0 ? r2(((revenue - cogs) / revenue) * 100) : null,
      roi: cogs > 0 ? r2(((revenue - cogs) / cogs) * 100) : null,
      soldCount: sales.length,
      avgProfit: sales.length ? r2((revenue - cogs) / sales.length) : null,
      avgDaysToSell: dts.length ? Math.round((dts.reduce((a, b) => a + b, 0) / dts.length) * 10) / 10 : null,
      sellThrough: bought.length ? { sold: bought.filter((i) => i.soldAt).length, of: bought.length } : null,
    },
    series,
    byCategory: rank(out, (o) => o.category),
    byShop: topShops,
    byPostal: rank(out, (o) => o.postal, true),
    best: sorted.filter((o) => o.profit > 0).slice(0, 5).map((o) => ({ name: o.name, profit: r2(o.profit) })),
    worst: sorted.slice(-5).filter((o) => o.profit < 0).reverse().map((o) => ({ name: o.name, profit: r2(o.profit) })),
    stock: {
      toList: inStock.length - listedNow.length,
      listed: listedNow.length,
      costValue: r2(inStock.reduce((s, i) => s + Number(i.buyPrice), 0)),
      askingValue: r2(listedNow.reduce((s, i) => s + Number(i.listPrice ?? 0), 0)),
      ageing,
      staleCount: listedNow.filter((i) => daysBetween(i.listedAt ?? i.boughtAt, today) >= user.staleAfterDays).length,
    },
    goal,
    periodGoal,
  };
}
