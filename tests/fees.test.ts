// Fees and postage paid: the profit maths in reports, which month a fee lands in, and the migration that added the columns.
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { Pool } from "pg";
import { applyMigrationFiles, dbSkipReason, pointAppAtTestDatabase, resetAndMigrate, resetEmpty, TEST_DATABASE_URL } from "./helpers/testdb";

const close = (a: number | null, b: number) => assert.ok(a !== null && Math.abs(a - b) < 0.011, `${a} is not close to ${b}`);

describe("reports with fees and postage", { skip: dbSkipReason }, () => {
  let dbm: typeof import("@/db");
  let s: typeof import("@/db/schema");
  let reports: typeof import("@/lib/reports");
  let itemProfit: typeof import("@/lib/items").itemProfit;
  let jan: Awaited<ReturnType<typeof import("@/lib/reports").computeReport>>;
  let feb: typeof jan;
  let rows: (typeof import("@/db/schema").items.$inferSelect)[];

  before(async () => {
    const url = pointAppAtTestDatabase();
    await resetAndMigrate(url);
    dbm = await import("@/db");
    s = await import("@/db/schema");
    reports = await import("@/lib/reports");
    itemProfit = (await import("@/lib/items")).itemProfit;

    const mk = async (email: string) => (await dbm.db.insert(s.users).values({ email, name: email, passwordHash: "x" }).returning())[0];
    const u = await mk("fees@example.com");
    const other = await mk("fees-other@example.com");
    const base = { userId: u.id } as const;
    //  A  cost 5, sold 20 in Jan, fees 1.60, postage 3.00        profit 10.40
    //  B  cost 3, sold 10 in Jan, refunded 4 in Feb, fees 0.80, postage 2.00   profit 0.20 (counts in January, the month of the sale)
    //  C  cost 2, sold 6 in Jan, no fees (an old-style sale)     profit 4.00
    //  D  cost 1, sold 10 in Feb, fees 5.00                      profit 4.00 (February only)
    //  E  cost 4, unsold in Jan                                  write-off -4.00
    await dbm.db.insert(s.items).values([
      { ...base, name: "A", status: "completed", boughtAt: "2026-01-02", buyPrice: "5.00", listedAt: "2026-01-03", listPrice: "25.00", soldAt: "2026-01-10", soldPrice: "20.00", fees: "1.60", postagePaid: "3.00" },
      { ...base, name: "B", status: "returned", boughtAt: "2026-01-02", buyPrice: "3.00", listedAt: "2026-01-03", listPrice: "12.00", soldAt: "2026-01-15", soldPrice: "10.00", returnedAt: "2026-02-03", refundAmount: "4.00", fees: "0.80", postagePaid: "2.00" },
      { ...base, name: "C", status: "posted", boughtAt: "2026-01-02", buyPrice: "2.00", listedAt: "2026-01-03", listPrice: "8.00", soldAt: "2026-01-12", soldPrice: "6.00" },
      { ...base, name: "D", status: "completed", boughtAt: "2026-01-20", buyPrice: "1.00", listedAt: "2026-01-21", listPrice: "12.00", soldAt: "2026-02-05", soldPrice: "10.00", fees: "5.00" },
      { ...base, name: "E", status: "unsold", boughtAt: "2026-01-08", buyPrice: "4.00", updatedAt: new Date("2026-01-25T12:00:00Z") },
    ]);
    // Another account's fees must never leak in
    await dbm.db.insert(s.items).values({ userId: other.id, name: "Other", status: "completed", boughtAt: "2026-01-02", buyPrice: "1.00", soldAt: "2026-01-04", soldPrice: "100.00", fees: "50.00", postagePaid: "20.00" });

    jan = await reports.computeReport(u, { p: "custom", from: "2026-01-01", to: "2026-01-31" });
    feb = await reports.computeReport(u, { p: "custom", from: "2026-02-01", to: "2026-02-28" });
    rows = await dbm.db.select().from(s.items).where((await import("drizzle-orm")).eq(s.items.userId, u.id));
  });
  after(async () => { await dbm?.pool.end(); });

  it("January: profit is revenue - fees - postage - cost of items sold - write-offs", () => {
    const k = jan.kpi;
    assert.equal(k.revenue, 32); // 20 + (10 - 4 refund) + 6
    assert.equal(k.fees, 7.4); // 1.60 + 3.00 + 0.80 + 2.00
    assert.equal(k.cogs, 10);
    assert.equal(k.writtenOff, 4);
    assert.equal(k.profit, 10.6); // 32 - 7.40 - 10 - 4
  });

  it("January: margin, return on cost and average profit are after fees too", () => {
    close(jan.kpi.margin, 45.63); // 14.60 / 32
    close(jan.kpi.roi, 146); // 14.60 / 10
    assert.equal(jan.kpi.avgProfit, 4.87); // 14.60 / 3
  });

  it("a fee counts in the month of the sale, not the month of a later return", () => {
    assert.equal(feb.kpi.revenue, 10); // only D; B's refund in February does not move B out of January
    assert.equal(feb.kpi.fees, 5);
    assert.equal(feb.kpi.profit, 4); // 10 - 5 - 1
  });

  it("the report agrees with the item page: summing every item's own profit gives the report's profit", () => {
    const inJan = rows.filter((r) => ["A", "B", "C", "E"].includes(r.name));
    const sum = Math.round(inJan.reduce((t, r) => t + (itemProfit(r) ?? 0), 0) * 100) / 100;
    assert.equal(sum, jan.kpi.profit);
  });

  it("the chart series add up to the headline profit", () => {
    const sum = Math.round(jan.series.reduce((t, x) => t + x.profit, 0) * 100) / 100;
    assert.equal(sum, jan.kpi.profit);
  });

  it("best and worst items use profit after fees", () => {
    assert.deepEqual(jan.best, [{ name: "A", profit: 10.4 }, { name: "C", profit: 4 }, { name: "B", profit: 0.2 }]);
  });

  it("another account's fees never appear", () => {
    assert.equal(jan.kpi.fees, 7.4);
  });
});

describe("migration 0008: fees and postage columns", { skip: dbSkipReason }, () => {
  let pool: Pool;
  let before0008: Record<string, unknown>[];
  const COLS = `id, user_id, name, status, bought_at, buy_price, listed_at, list_price, sold_at, sold_price, postal_service_id, posted_at,
    sold_platform_id, handover, returned_at, refund_amount, created_at, updated_at`;

  before(async () => {
    const url = TEST_DATABASE_URL!;
    await resetEmpty(url);
    await applyMigrationFiles(url, 0, 7);
    pool = new Pool({ connectionString: url, max: 1 });
    const uid = (await pool.query("insert into users (email, name, password_hash) values ('m@example.com','M','x') returning id")).rows[0].id;
    const plat = (await pool.query("insert into platforms (user_id, name) values ($1,'Vinted') returning id", [uid])).rows[0].id;
    await pool.query("insert into items (user_id, name, status, bought_at, buy_price) values ($1,'Bought','bought','2026-01-01','5.00')", [uid]);
    await pool.query(
      `insert into items (user_id, name, status, bought_at, buy_price, listed_at, list_price, sold_at, sold_price, posted_at, sold_platform_id, handover)
       values ($1,'Sold','completed','2026-01-01','5.00','2026-01-03','25.00','2026-01-10','20.00','2026-01-11',$2,'posted')`, [uid, plat]);
    await pool.query(
      `insert into items (user_id, name, status, bought_at, buy_price, sold_at, sold_price, returned_at, refund_amount)
       values ($1,'Returned','returned','2026-01-01','5.00','2026-01-09','12.00','2026-01-20','12.00')`, [uid]);
    before0008 = (await pool.query(`select ${COLS} from items order by id`)).rows;
    await applyMigrationFiles(url, 8, 8);
  });
  after(async () => { await pool?.end(); });

  it("changes nothing about existing items", async () => {
    assert.deepEqual((await pool.query(`select ${COLS} from items order by id`)).rows, before0008);
  });

  it("gives every existing item no fees and no postage, so old profits stay the same", async () => {
    const { rows } = await pool.query("select name, fees::text, postage_paid::text from items order by id");
    assert.ok(rows.length === 3 && rows.every((r) => r.fees === "0.00" && r.postage_paid === "0.00"), JSON.stringify(rows));
  });

  it("gives every existing platform a fee of 0%", async () => {
    const { rows } = await pool.query("select fee_percent::text from platforms");
    assert.deepEqual(rows, [{ fee_percent: "0.00" }]);
  });
});
