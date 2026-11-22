// "Undo last step" on the item page: each step goes back one place, and undoing a sale brings its listings back.
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { dbSkipReason, resetAndMigrate, pointAppAtTestDatabase } from "./helpers/testdb";
import { undoOption } from "@/lib/items";

describe("undoOption()", () => {
  it("names the step that would be undone", () => {
    assert.match(undoOption({ status: "sold", handover: "posted" })!.label, /Undo sale/);
    assert.match(undoOption({ status: "posted", handover: "posted" })!.label, /not posted yet/);
    assert.match(undoOption({ status: "completed", handover: "posted" })!.label, /back to Posted/);
    assert.match(undoOption({ status: "completed", handover: "collected" })!.label, /not handed over yet/);
  });
  it("only asks for confirmation when it clears the sale details", () => {
    assert.ok(undoOption({ status: "sold", handover: "posted" })!.confirm);
    assert.equal(undoOption({ status: "posted", handover: "posted" })!.confirm, undefined);
  });
  it("offers nothing before a sale or after a return or write-off", () => {
    for (const status of ["bought", "listed", "returned", "unsold", "donated"] as const) assert.equal(undoOption({ status, handover: null }), null, status);
  });
});

describe("undoLastStep()", { skip: dbSkipReason }, () => {
  let dbm: typeof import("@/db");
  let s: typeof import("@/db/schema");
  let L: typeof import("@/lib/listings");
  let eq: typeof import("drizzle-orm").eq;

  before(async () => {
    const url = pointAppAtTestDatabase();
    await resetAndMigrate(url);
    dbm = await import("@/db");
    s = await import("@/db/schema");
    L = await import("@/lib/listings");
    eq = (await import("drizzle-orm")).eq;
  });
  after(async () => { await dbm?.pool.end(); });

  async function setup(email: string) {
    const { seedUserDefaults } = await import("@/lib/defaults");
    const [u] = await dbm.db.insert(s.users).values({ email, name: email, passwordHash: "x" }).returning();
    await seedUserDefaults(u.id);
    const plats = await dbm.db.select().from(s.platforms).where(eq(s.platforms.userId, u.id)).orderBy(s.platforms.id);
    const p = Object.fromEntries(plats.map((x) => [x.name, x.id])) as Record<string, number>;
    const newItem = async (over: Partial<typeof s.items.$inferInsert> = {}) =>
      (await dbm.db.insert(s.items).values({ userId: u.id, name: "Thing", boughtAt: "2026-01-01", buyPrice: "5.00", ...over }).returning())[0];
    const get = async (id: number) => (await dbm.db.select().from(s.items).where(eq(s.items.id, id)))[0];
    const live = async (id: number) => (await L.listingsFor(id)).filter((x) => x.listing.endedAt === null).map((x) => x.platform);
    const sale = (platformId: number, over: Partial<Parameters<typeof L.sellItem>[2]> = {}) => ({
      platformId, price: "30.00", when: "2026-03-01", handover: "posted", postalServiceId: null, fees: "1.50", postagePaid: "3.00", handedOver: false, ...over,
    });
    return { u, p, newItem, get, live, sale };
  }
  const ent = (platformId: number, price: string) => ({ platformId, price, url: null });

  describe("undoing a sale", () => {
    it("puts the item back on sale on every platform the sale ended, with the sale details cleared", async () => {
      const t = await setup("undo-sale1@example.com");
      const item = await t.newItem();
      await L.listOn(t.u.id, item.id, [ent(t.p.Vinted, "20.00"), ent(t.p.eBay, "25.00")], "2026-02-01", "list");
      await L.sellItem(t.u.id, item.id, t.sale(t.p.eBay));
      assert.deepEqual(await t.live(item.id), []);
      assert.deepEqual(await L.undoLastStep(t.u.id, item.id), { ok: true });
      const after = await t.get(item.id);
      assert.equal(after.status, "listed");
      assert.deepEqual(await t.live(item.id), ["Vinted", "eBay"]);
      assert.deepEqual([after.soldAt, after.soldPrice, after.soldPlatformId, after.handover, after.postedAt], [null, null, null, null, null]);
      assert.deepEqual([after.fees, after.postagePaid], ["0.00", "0.00"]);
      assert.deepEqual([after.listedAt, after.listPrice], ["2026-02-01", "20.00"]);
    });

    it("leaves a platform you had already taken off before the sale taken off", async () => {
      const t = await setup("undo-sale2@example.com");
      const item = await t.newItem();
      await L.listOn(t.u.id, item.id, [ent(t.p.Vinted, "20.00"), ent(t.p.eBay, "25.00")], "2026-02-01", "list");
      const [vinted] = (await L.listingsFor(item.id)).filter((x) => x.platform === "Vinted");
      await L.endListing(t.u.id, item.id, vinted.listing.id, "2026-02-10");
      await L.sellItem(t.u.id, item.id, t.sale(t.p.eBay));
      await L.undoLastStep(t.u.id, item.id);
      assert.deepEqual(await t.live(item.id), ["eBay"]);
    });

    it("sends an item that was never listed back to to-list", async () => {
      const t = await setup("undo-sale3@example.com");
      const item = await t.newItem();
      await L.sellItem(t.u.id, item.id, t.sale(t.p.Vinted));
      await L.undoLastStep(t.u.id, item.id);
      const after = await t.get(item.id);
      assert.deepEqual([after.status, after.listedAt, after.listPrice, after.soldAt], ["bought", null, null, null]);
    });

    it("goes to to-list rather than guessing if the sale date was edited afterwards", async () => {
      const t = await setup("undo-sale4@example.com");
      const item = await t.newItem();
      await L.listOn(t.u.id, item.id, [ent(t.p.Vinted, "20.00")], "2026-02-01", "list");
      await L.sellItem(t.u.id, item.id, t.sale(t.p.Vinted));
      await dbm.db.update(s.items).set({ soldAt: "2026-03-05" }).where(eq(s.items.id, item.id));
      await L.undoLastStep(t.u.id, item.id);
      assert.equal((await t.get(item.id)).status, "bought");
      assert.deepEqual(await t.live(item.id), []);
    });

    it("can be sold again afterwards with the new details", async () => {
      const t = await setup("undo-sale5@example.com");
      const item = await t.newItem();
      await L.listOn(t.u.id, item.id, [ent(t.p.Vinted, "20.00")], "2026-02-01", "list");
      await L.sellItem(t.u.id, item.id, t.sale(t.p.Vinted, { price: "99.00", fees: "9.00", postagePaid: "9.00" }));
      await L.undoLastStep(t.u.id, item.id);
      assert.deepEqual(await L.sellItem(t.u.id, item.id, t.sale(t.p.Vinted, { price: "22.00", fees: "1.00", postagePaid: "2.00" })), { ok: true });
      const after = await t.get(item.id);
      assert.deepEqual([after.status, after.soldPrice, after.fees, after.postagePaid], ["sold", "22.00", "1.00", "2.00"]);
    });
  });

  describe("undoing a later step", () => {
    it("posted goes back to sold", async () => {
      const t = await setup("undo-step1@example.com");
      const item = await t.newItem({ status: "posted", soldAt: "2026-03-01", soldPrice: "30.00", handover: "posted", postedAt: "2026-03-02" });
      assert.deepEqual(await L.undoLastStep(t.u.id, item.id), { ok: true });
      const after = await t.get(item.id);
      assert.deepEqual([after.status, after.postedAt, after.soldPrice], ["sold", null, "30.00"]);
    });

    it("completed by post goes back to posted and keeps the posted date", async () => {
      const t = await setup("undo-step2@example.com");
      const item = await t.newItem({ status: "completed", soldAt: "2026-03-01", soldPrice: "30.00", handover: "posted", postedAt: "2026-03-02" });
      await L.undoLastStep(t.u.id, item.id);
      const after = await t.get(item.id);
      assert.deepEqual([after.status, after.postedAt], ["posted", "2026-03-02"]);
    });

    it("completed in person goes back to sold", async () => {
      const t = await setup("undo-step3@example.com");
      const item = await t.newItem({ status: "completed", soldAt: "2026-03-01", soldPrice: "30.00", handover: "collected", postedAt: "2026-03-02" });
      await L.undoLastStep(t.u.id, item.id);
      const after = await t.get(item.id);
      assert.deepEqual([after.status, after.postedAt], ["sold", null]);
    });
  });

  it("says there is nothing to undo before a sale or after a return or write-off", async () => {
    const t = await setup("undo-none@example.com");
    for (const status of ["bought", "listed", "returned", "unsold", "donated"] as const) {
      const item = await t.newItem({ status });
      assert.match(((await L.undoLastStep(t.u.id, item.id)) as { error: string }).error, /nothing to undo/i, status);
      assert.equal((await t.get(item.id)).status, status);
    }
  });

  it("never touches another account's item", async () => {
    const a = await setup("undo-iso-a@example.com");
    const b = await setup("undo-iso-b@example.com");
    const theirs = await b.newItem({ status: "sold", soldAt: "2026-03-01", soldPrice: "30.00", handover: "posted" });
    assert.match(((await L.undoLastStep(a.u.id, theirs.id)) as { error: string }).error, /not found/i);
    const after = await b.get(theirs.id);
    assert.deepEqual([after.status, after.soldPrice], ["sold", "30.00"]);
  });
});
