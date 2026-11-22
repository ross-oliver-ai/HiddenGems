// Reports by selling platform and by handover method, with numbers that can be checked by hand.
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { dbSkipReason, pointAppAtTestDatabase, resetAndMigrate } from "./helpers/testdb";

describe("reports by platform and handover", { skip: dbSkipReason }, () => {
  let dbm: typeof import("@/db");
  let s: typeof import("@/db/schema");
  let reports: typeof import("@/lib/reports");
  let jan: Awaited<ReturnType<typeof import("@/lib/reports").computeReport>>;
  let feb: typeof jan;

  before(async () => {
    const url = pointAppAtTestDatabase();
    await resetAndMigrate(url);
    dbm = await import("@/db");
    s = await import("@/db/schema");
    reports = await import("@/lib/reports");
    const { seedUserDefaults } = await import("@/lib/defaults");
    const { eq } = await import("drizzle-orm");
    const { db } = dbm;

    const mk = async (email: string) => {
      const [u] = await db.insert(s.users).values({ email, name: email, passwordHash: "x" }).returning();
      await seedUserDefaults(u.id);
      const plats = await db.select().from(s.platforms).where(eq(s.platforms.userId, u.id));
      return { u, p: Object.fromEntries(plats.map((x) => [x.name, x.id])) as Record<string, number> };
    };
    const { u, p } = await mk("pr4@example.com");
    const other = await mk("pr4-other@example.com");

    const item = async (name: string, v: Partial<typeof s.items.$inferInsert>) =>
      (await db.insert(s.items).values({ userId: u.id, name, status: "completed", boughtAt: "2026-01-01", buyPrice: "5.00", ...v }).returning())[0];
    const list = (itemId: number, platformId: number, listedAt: string, endedAt: string | null = null) =>
      db.insert(s.listings).values({ itemId, platformId, price: "10.00", listedAt, endedAt });

    //  Boots  cost 5  listed Vinted 3 Jan, sold Vinted 10 Jan £20, £3 postage paid, by post     profit 12, 7 days
    //  Novel  cost 2  listed Vinted 5 Jan, sold Vinted 11 Jan £6, collected                      profit 4,  6 days
    //  Lamp   cost 4  listed Vinted + eBay 2 Jan, sold eBay 12 Jan £30, £3 fees, delivered       profit 23, 10 days
    //  Mug    cost 2  listed Vinted twice (relisted) from 15 Jan, sold Vinted 20 Jan £10, by post profit 8, 5 days
    //  Old    cost 2  bought 4 Jan, an old sale with no platform or method, sold 14 Jan £8        profit 6, 10 days
    //  Coat   cost 6  listed on eBay 4 Jan, still listed
    //  Vase   cost 1  listed on Depop 6 Jan, still listed
    //  Scarf  cost 4  unsold in January (a write-off: belongs to no platform)
    const boots = await item("Boots", { listedAt: "2026-01-03", soldAt: "2026-01-10", soldPrice: "20.00", postagePaid: "3.00", soldPlatformId: p.Vinted, handover: "posted" });
    const novel = await item("Novel", { buyPrice: "2.00", listedAt: "2026-01-05", soldAt: "2026-01-11", soldPrice: "6.00", soldPlatformId: p.Vinted, handover: "collected" });
    const lamp = await item("Lamp", { buyPrice: "4.00", listedAt: "2026-01-02", soldAt: "2026-01-12", soldPrice: "30.00", fees: "3.00", soldPlatformId: p.eBay, handover: "delivered" });
    const mug = await item("Mug", { buyPrice: "2.00", listedAt: "2026-01-15", soldAt: "2026-01-20", soldPrice: "10.00", soldPlatformId: p.Vinted, handover: "posted" });
    await item("Old", { buyPrice: "2.00", boughtAt: "2026-01-04", soldAt: "2026-01-14", soldPrice: "8.00" });
    const coat = await item("Coat", { status: "listed", buyPrice: "6.00", listedAt: "2026-01-04" });
    const vase = await item("Vase", { status: "listed", buyPrice: "1.00", listedAt: "2026-01-06" });
    await item("Scarf", { status: "unsold", buyPrice: "4.00", updatedAt: new Date("2026-01-25T12:00:00Z") });

    await list(boots.id, p.Vinted, "2026-01-03", "2026-01-10");
    await list(novel.id, p.Vinted, "2026-01-05", "2026-01-11");
    await list(lamp.id, p.Vinted, "2026-01-02", "2026-01-12");
    await list(lamp.id, p.eBay, "2026-01-02", "2026-01-12");
    await list(mug.id, p.Vinted, "2026-01-15", "2026-01-16");
    await list(mug.id, p.Vinted, "2026-01-17", "2026-01-20");
    await list(coat.id, p.eBay, "2026-01-04");
    await list(vase.id, p.Depop, "2026-01-06");

    // Another account's Vinted sale must never appear
    await db.insert(s.items).values({ userId: other.u.id, name: "Theirs", status: "completed", boughtAt: "2026-01-01", buyPrice: "1.00", soldAt: "2026-01-05", soldPrice: "500.00", soldPlatformId: other.p.Vinted, handover: "posted" });

    jan = await reports.computeReport(u, { p: "custom", from: "2026-01-01", to: "2026-01-31" });
    feb = await reports.computeReport(u, { p: "custom", from: "2026-02-01", to: "2026-02-28" });
  });
  after(async () => { await dbm?.pool.end(); });

  it("profit, sold and average days per platform, best first", () => {
    assert.deepEqual(
      jan.byPlatform.map((x) => [x.name, x.profit, x.sold, x.avgDays]),
      [
        ["Vinted", 24, 3, 6], // 12 + 4 + 8; (7 + 6 + 5) / 3 days
        ["eBay", 23, 1, 10],
        ["Not set", 6, 1, 10], // an old sale with no platform is shown, not hidden
        ["Depop", 0, 0, null],
      ],
    );
  });

  it("sell-through: of the items listed there in the period, how many sold there", () => {
    const by = Object.fromEntries(jan.byPlatform.map((x) => [x.name, x.sellThrough]));
    assert.deepEqual(by.Vinted, { sold: 3, of: 4 }); // Boots, Novel, Lamp, Mug (relisted twice, counted once); Lamp sold on eBay instead
    assert.deepEqual(by.eBay, { sold: 1, of: 2 }); // Lamp, Coat
    assert.deepEqual(by.Depop, { sold: 0, of: 1 });
    assert.equal(by["Not set"], null); // it was never listed anywhere we know of
  });

  it("platform profits add up to the sales profit (write-offs belong to no platform)", () => {
    const sum = jan.byPlatform.reduce((t, x) => t + x.profit, 0);
    assert.equal(sum, 53);
    assert.equal(jan.kpi.profit, 49); // 53 - 4 written off
    assert.equal(sum, jan.kpi.profit + jan.kpi.writtenOff);
    assert.equal(jan.byPlatform.reduce((t, x) => t + x.sold, 0), jan.kpi.soldCount);
  });

  it("by handover method: how many sold and what they made", () => {
    assert.deepEqual(
      jan.byHandover.map((x) => [x.name, x.sold, x.profit]),
      [
        ["By post", 2, 20], // Boots 12 (after £3 postage) + Mug 8
        ["I delivered it", 1, 23],
        ["Not set", 1, 6],
        ["Collected by buyer", 1, 4],
      ],
    );
    assert.equal(jan.byHandover.reduce((t, x) => t + x.sold, 0), jan.kpi.soldCount);
  });

  it("a period with no sales and no listings has empty platform and handover reports", () => {
    assert.deepEqual(feb.byPlatform, []);
    assert.deepEqual(feb.byHandover, []);
  });

  it("another account's sales never appear", () => {
    assert.ok(jan.byPlatform.every((x) => x.profit < 100));
    assert.equal(jan.kpi.soldCount, 5);
  });
});
