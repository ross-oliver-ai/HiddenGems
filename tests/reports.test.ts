// Report maths against a real throwaway database with known items, so every number can be checked by hand.
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { dbSkipReason, resetAndMigrate, pointAppAtTestDatabase } from "./helpers/testdb";

type Db = typeof import("@/db");
type Schema = typeof import("@/db/schema");
type Reports = typeof import("@/lib/reports");

describe("computeReport()", { skip: dbSkipReason }, () => {
  let dbm: Db;
  let s: Schema;
  let reports: Reports;
  let todayLondon: () => string;

  before(async () => {
    const url = pointAppAtTestDatabase();
    await resetAndMigrate(url);
    dbm = await import("@/db");
    s = await import("@/db/schema");
    reports = await import("@/lib/reports");
    todayLondon = (await import("@/lib/format")).todayLondon;
  });
  after(async () => { await dbm?.pool.end(); });

  async function newUser(email: string, goal: string | null = null) {
    const [u] = await dbm.db.insert(s.users).values({ email, name: email, passwordHash: "x", monthlyProfitGoal: goal }).returning();
    const [oxfam] = await dbm.db.insert(s.shops).values({ userId: u.id, name: "Oxfam" }).returning();
    const [barnardos] = await dbm.db.insert(s.shops).values({ userId: u.id, name: "Barnardos" }).returning();
    const [shoes] = await dbm.db.insert(s.categories).values({ userId: u.id, name: "Shoes" }).returning();
    const [books] = await dbm.db.insert(s.categories).values({ userId: u.id, name: "Books" }).returning();
    const [rm] = await dbm.db.insert(s.postalServices).values({ userId: u.id, name: "Royal Mail" }).returning();
    const [evri] = await dbm.db.insert(s.postalServices).values({ userId: u.id, name: "Evri" }).returning();
    return { u, oxfam, barnardos, shoes, books, rm, evri };
  }

  const JAN = { p: "custom", from: "2026-01-01", to: "2026-01-31" };

  // A small January with every kind of outcome:
  //  Boots  bought £5  -> sold £20 (Royal Mail)                      profit +15, 7 days to sell
  //  Novel  bought £2  -> sold £6  (Evri)                            profit +4,  6 days
  //  Mug    bought £3  -> sold £10 then fully refunded               profit -3,  8 days (counts as a sale with £0 revenue)
  //  Scarf  bought £4  -> given up (unsold)                          write-off -4
  //  Hat    bought £6 in December -> donated in January              write-off -6 (not "spent" in January)
  //  Coat   bought £10 -> still to list                              in stock
  //  Jeans  bought £8  -> listed at £30                              in stock
  describe("a known month", () => {
    let report: Awaited<ReturnType<Reports["computeReport"]>>;

    before(async () => {
      const f = await newUser("known@example.com");
      const other = await newUser("other@example.com");
      const { db } = dbm;
      const base = { userId: f.u.id } as const;
      await db.insert(s.items).values([
        { ...base, name: "Boots", status: "completed", boughtAt: "2026-01-02", buyPrice: "5.00", shopId: f.oxfam.id, categoryId: f.shoes.id,
          listedAt: "2026-01-03", listPrice: "25.00", soldAt: "2026-01-10", soldPrice: "20.00", postalServiceId: f.rm.id },
        { ...base, name: "Novel", status: "posted", boughtAt: "2026-01-05", buyPrice: "2.00", shopId: f.barnardos.id, categoryId: f.books.id,
          listedAt: "2026-01-06", listPrice: "8.00", soldAt: "2026-01-12", soldPrice: "6.00", postalServiceId: f.evri.id },
        { ...base, name: "Mug", status: "returned", boughtAt: "2026-01-06", buyPrice: "3.00", shopId: f.oxfam.id,
          listedAt: "2026-01-07", listPrice: "12.00", soldAt: "2026-01-15", soldPrice: "10.00", returnedAt: "2026-01-20", refundAmount: "10.00" },
        { ...base, name: "Scarf", status: "unsold", boughtAt: "2026-01-08", buyPrice: "4.00", shopId: f.barnardos.id, updatedAt: new Date("2026-01-25T12:00:00Z") },
        { ...base, name: "Hat", status: "donated", boughtAt: "2025-12-20", buyPrice: "6.00", updatedAt: new Date("2026-01-18T12:00:00Z") },
        { ...base, name: "Coat", status: "bought", boughtAt: "2026-01-09", buyPrice: "10.00" },
        { ...base, name: "Jeans", status: "listed", boughtAt: "2026-01-10", buyPrice: "8.00", listedAt: "2026-01-11", listPrice: "30.00" },
      ]);
      // Another account's sale must never leak into this account's numbers
      await db.insert(s.items).values({ userId: other.u.id, name: "Someone else's", status: "completed", boughtAt: "2026-01-02", buyPrice: "1.00", soldAt: "2026-01-04", soldPrice: "500.00" });
      report = await reports.computeReport(f.u, JAN);
    });

    it("totals: spent, revenue, cost of goods, write-offs and profit", () => {
      const k = report.kpi;
      assert.equal(k.spent, 32);
      assert.equal(k.boughtCount, 6);
      assert.equal(k.revenue, 26); // 20 + 6 + (10 - 10 refund)
      assert.equal(k.cogs, 10);
      assert.equal(k.writtenOff, 10);
      assert.equal(k.profit, 6); // 26 - 10 - 10
    });

    it("ratios: margin, ROI, average profit, days to sell, sell-through", () => {
      const k = report.kpi;
      assert.equal(k.soldCount, 3);
      assert.equal(k.margin, 61.54); // (26-10)/26
      assert.equal(k.roi, 160); // (26-10)/10
      assert.equal(k.avgProfit, 5.33); // 16/3
      assert.equal(k.avgDaysToSell, 7); // (7+6+8)/3
      assert.deepEqual(k.sellThrough, { sold: 3, of: 6 });
    });

    it("never includes another account's items", () => {
      assert.equal(report.kpi.revenue, 26);
      assert.ok(!report.best.some((b) => b.name === "Someone else's"));
    });

    it("rankings by shop, category and postal service", () => {
      const byName = (r: { name: string; value: number }[]) => Object.fromEntries(r.map((x) => [x.name, x.value]));
      assert.deepEqual(byName(report.byShop), { Oxfam: 12, Barnardos: 0, "Not set": -6 });
      assert.deepEqual(byName(report.byCategory), { Shoes: 15, Books: 4, "No category": -13 });
      // postage counts sales only
      assert.deepEqual(byName(report.byPostal), { "Royal Mail": 1, Evri: 1, "Not set": 1 });
      assert.equal(report.byShop[0].name, "Oxfam", "ranked best first");
    });

    it("best and worst items", () => {
      assert.deepEqual(report.best, [{ name: "Boots", profit: 15 }, { name: "Novel", profit: 4 }]);
      assert.deepEqual(report.worst, [{ name: "Mug", profit: -3 }]);
    });

    it("stock snapshot", () => {
      assert.equal(report.stock.toList, 1);
      assert.equal(report.stock.listed, 1);
      assert.equal(report.stock.costValue, 18);
      assert.equal(report.stock.askingValue, 30);
    });

    it("the chart series adds up to the headline numbers", () => {
      const sum = (key: "spent" | "revenue" | "profit") => Math.round(report.series.reduce((t, x) => t + x[key], 0) * 100) / 100;
      assert.equal(sum("spent"), report.kpi.spent);
      assert.equal(sum("revenue"), report.kpi.revenue);
      assert.equal(sum("profit"), report.kpi.profit);
      assert.equal(report.series.length, 31, "one bar per day of January");
    });
  });

  it("only counts things that happened inside the chosen period", async () => {
    const f = await newUser("period@example.com");
    await dbm.db.insert(s.items).values([
      { userId: f.u.id, name: "Jan sale", status: "completed", boughtAt: "2026-01-02", buyPrice: "1.00", soldAt: "2026-01-20", soldPrice: "10.00" },
      { userId: f.u.id, name: "Feb sale", status: "completed", boughtAt: "2026-01-03", buyPrice: "2.00", soldAt: "2026-02-01", soldPrice: "50.00" },
    ]);
    const jan = await reports.computeReport(f.u, JAN);
    assert.equal(jan.kpi.revenue, 10);
    assert.equal(jan.kpi.spent, 3, "both were bought in January");
    const feb = await reports.computeReport(f.u, { p: "custom", from: "2026-02-01", to: "2026-02-28" });
    assert.equal(feb.kpi.revenue, 50);
    assert.equal(feb.kpi.spent, 0);
  });

  it("a brand-new account with nothing in it reports zeros, not errors", async () => {
    const f = await newUser("empty@example.com");
    const r = await reports.computeReport(f.u, { p: "all" });
    assert.equal(r.kpi.profit, 0);
    assert.equal(r.kpi.margin, null);
    assert.equal(r.kpi.roi, null);
    assert.equal(r.kpi.avgDaysToSell, null);
    assert.equal(r.kpi.sellThrough, null);
    assert.deepEqual(r.best, []);
  });

  it("the monthly goal counts this calendar month's profit", async () => {
    const f = await newUser("goal@example.com", "100.00");
    const today = todayLondon();
    await dbm.db.insert(s.items).values({ userId: f.u.id, name: "Today's sale", status: "completed", boughtAt: today, buyPrice: "10.00", soldAt: today, soldPrice: "40.00" });
    const r = await reports.computeReport(f.u, { p: "month" });
    assert.deepEqual(r.goal, { target: 100, current: 30 });
    assert.equal(r.periodGoal?.monthly, 100);
    assert.equal(r.periodGoal?.current, 30);
  });

  it("no goal is reported when none is set", async () => {
    const f = await newUser("nogoal@example.com", null);
    const r = await reports.computeReport(f.u, { p: "month" });
    assert.equal(r.goal, null);
    assert.equal(r.periodGoal, null);
  });
});
