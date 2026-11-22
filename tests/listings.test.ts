// Listing on several platforms, per-platform prices, taking items off, selling and handing over.
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { dbSkipReason, resetAndMigrate, pointAppAtTestDatabase } from "./helpers/testdb";

describe("listings and sales", { skip: dbSkipReason }, () => {
  let dbm: typeof import("@/db");
  let s: typeof import("@/db/schema");
  let L: typeof import("@/lib/listings");
  let eq: typeof import("drizzle-orm").eq;
  let parseMoney: typeof import("@/lib/format").parseMoney;

  before(async () => {
    const url = pointAppAtTestDatabase();
    await resetAndMigrate(url);
    dbm = await import("@/db");
    s = await import("@/db/schema");
    L = await import("@/lib/listings");
    eq = (await import("drizzle-orm")).eq;
    parseMoney = (await import("@/lib/format")).parseMoney;
  });
  after(async () => { await dbm?.pool.end(); });

  async function setup(email: string) {
    const { seedUserDefaults } = await import("@/lib/defaults");
    const [u] = await dbm.db.insert(s.users).values({ email, name: email, passwordHash: "x" }).returning();
    await seedUserDefaults(u.id);
    const plats = await dbm.db.select().from(s.platforms).where(eq(s.platforms.userId, u.id)).orderBy(s.platforms.id);
    const p = Object.fromEntries(plats.map((x) => [x.name, x.id])) as Record<string, number>;
    const [rm] = await dbm.db.select().from(s.postalServices).where(eq(s.postalServices.userId, u.id)).limit(1);
    const newItem = async (over: Partial<typeof s.items.$inferInsert> = {}) =>
      (await dbm.db.insert(s.items).values({ userId: u.id, name: "Thing", boughtAt: "2026-01-01", buyPrice: "5.00", ...over }).returning())[0];
    const get = async (id: number) => (await dbm.db.select().from(s.items).where(eq(s.items.id, id)))[0];
    const live = async (id: number) => (await L.listingsFor(id)).filter((x) => x.listing.endedAt === null);
    return { u, p, rm, newItem, get, live };
  }
  const ent = (platformId: number, price: string | null, url: string | null = null) => ({ platformId, price, url });

  it("seeds five default platforms for a new account, Vinted first", async () => {
    const { u } = await setup("seed@example.com");
    const names = (await L.activePlatforms(u.id)).map((x) => x.name);
    assert.deepEqual(names, ["Vinted", "eBay", "Depop", "Facebook Marketplace", "Gumtree"]);
  });

  describe("listing", () => {
    it("lists an item on two platforms with a price each", async () => {
      const t = await setup("list1@example.com");
      const item = await t.newItem();
      const r = await L.listOn(t.u.id, item.id, [ent(t.p.Vinted, "20.00", "https://vinted.example/1"), ent(t.p.eBay, "25.00")], "2026-02-01", "list");
      assert.deepEqual(r, { ok: true });
      const after = await t.get(item.id);
      assert.equal(after.status, "listed");
      assert.equal(after.listedAt, "2026-02-01");
      assert.equal(after.listPrice, "20.00", "the first platform's price is the headline price");
      const live = await t.live(item.id);
      assert.deepEqual(live.map((x) => [x.platform, x.listing.price, x.listing.url]), [["Vinted", "20.00", "https://vinted.example/1"], ["eBay", "25.00", null]]);
    });

    it("refuses bad input and says why", async () => {
      const t = await setup("list2@example.com");
      const other = await setup("list2other@example.com");
      const item = await t.newItem();
      const base = [item.id] as const;
      assert.match((await L.listOn(t.u.id, ...base, [], "2026-02-01", "list") as { error: string }).error, /at least one platform/);
      assert.match((await L.listOn(t.u.id, ...base, [ent(t.p.eBay, null)], "2026-02-01", "list") as { error: string }).error, /asking price for eBay/);
      assert.match((await L.listOn(t.u.id, ...base, [ent(other.p.Vinted, "5.00")], "2026-02-01", "list") as { error: string }).error, /Unknown platform/);
      assert.match((await L.listOn(t.u.id, ...base, [ent(t.p.Vinted, "5.00")], "2025-12-31", "list") as { error: string }).error, /before you bought/);
      assert.equal((await t.get(item.id)).status, "bought", "nothing changed after the refusals");
      assert.equal((await t.live(item.id)).length, 0);
    });

    it("can't list someone else's item", async () => {
      const t = await setup("list3@example.com");
      const other = await setup("list3other@example.com");
      const theirs = await other.newItem();
      const r = await L.listOn(t.u.id, theirs.id, [ent(t.p.Vinted, "5.00")], "2026-02-01", "list");
      assert.deepEqual(r, { error: "Item not found." });
    });

    it("only a to-list item can be listed", async () => {
      const t = await setup("list4@example.com");
      const item = await t.newItem({ status: "completed", soldAt: "2026-01-05", soldPrice: "9.00" });
      assert.match((await L.listOn(t.u.id, item.id, [ent(t.p.Vinted, "5.00")], "2026-02-01", "list") as { error: string }).error, /isn't available/);
    });

    it("adds more platforms later at their own price, and refuses a platform it's already live on", async () => {
      const t = await setup("more@example.com");
      const item = await t.newItem();
      await L.listOn(t.u.id, item.id, [ent(t.p.Vinted, "20.00")], "2026-02-01", "list");
      assert.deepEqual(await L.listOn(t.u.id, item.id, [ent(t.p.Depop, "30.00")], "2026-02-10", "more"), { ok: true });
      const after = await t.get(item.id);
      assert.equal(after.listedAt, "2026-02-01", "headline date stays the earliest");
      assert.equal(after.listPrice, "20.00");
      assert.equal((await t.live(item.id)).length, 2);
      assert.match((await L.listOn(t.u.id, item.id, [ent(t.p.Vinted, "19.00")], "2026-02-11", "more") as { error: string }).error, /already listed on Vinted/);
    });

    it("the database itself refuses two live listings of one item on one platform", async () => {
      const t = await setup("unique@example.com");
      const item = await t.newItem();
      await dbm.db.insert(s.listings).values({ itemId: item.id, platformId: t.p.Vinted, price: "1.00", listedAt: "2026-02-01" });
      await assert.rejects(dbm.db.insert(s.listings).values({ itemId: item.id, platformId: t.p.Vinted, price: "2.00", listedAt: "2026-02-02" }));
      // an ended one doesn't count, so relisting later is fine
      await dbm.db.update(s.listings).set({ endedAt: "2026-02-03" }).where(eq(s.listings.itemId, item.id));
      await dbm.db.insert(s.listings).values({ itemId: item.id, platformId: t.p.Vinted, price: "2.00", listedAt: "2026-02-04" });
    });
  });

  describe("price reductions (per platform)", () => {
    it("changes only the platforms you change, and records each drop", async () => {
      const t = await setup("reduce1@example.com");
      const item = await t.newItem();
      await L.listOn(t.u.id, item.id, [ent(t.p.Vinted, "20.00"), ent(t.p.eBay, "25.00")], "2026-02-01", "list");
      const [v, e] = await t.live(item.id);
      const r = await L.reducePrices(t.u.id, item.id, new Map([[v.listing.id, "20.00"], [e.listing.id, "22.00"]]), "2026-02-15");
      assert.deepEqual(r, { ok: true });
      const live = await t.live(item.id);
      assert.deepEqual(live.map((x) => x.listing.price), ["20.00", "22.00"]);
      const drops = await dbm.db.select().from(s.priceChanges).where(eq(s.priceChanges.itemId, item.id));
      assert.equal(drops.length, 1);
      assert.deepEqual([drops[0].listingId, drops[0].oldPrice, drops[0].newPrice, drops[0].changedAt], [e.listing.id, "25.00", "22.00", "2026-02-15"]);
    });

    it("the headline price follows the first listing", async () => {
      const t = await setup("reduce2@example.com");
      const item = await t.newItem();
      await L.listOn(t.u.id, item.id, [ent(t.p.Vinted, "20.00"), ent(t.p.eBay, "25.00")], "2026-02-01", "list");
      const [v] = await t.live(item.id);
      await L.reducePrices(t.u.id, item.id, new Map([[v.listing.id, "18.00"]]), "2026-02-15");
      assert.equal((await t.get(item.id)).listPrice, "18.00");
    });

    it("says so when nothing changed or a price is invalid", async () => {
      const t = await setup("reduce3@example.com");
      const item = await t.newItem();
      await L.listOn(t.u.id, item.id, [ent(t.p.Vinted, "20.00")], "2026-02-01", "list");
      const [v] = await t.live(item.id);
      assert.match((await L.reducePrices(t.u.id, item.id, new Map([[v.listing.id, "20.00"]]), "2026-02-15") as { error: string }).error, /No prices have changed/);
      assert.match((await L.reducePrices(t.u.id, item.id, new Map([[v.listing.id, null]]), "2026-02-15") as { error: string }).error, /valid price/);
    });
  });

  describe("taking an item off", () => {
    it("ending one of two listings keeps the item listed; ending the last returns it to 'to list'", async () => {
      const t = await setup("end1@example.com");
      const item = await t.newItem();
      await L.listOn(t.u.id, item.id, [ent(t.p.Vinted, "20.00"), ent(t.p.eBay, "25.00")], "2026-02-01", "list");
      const [v, e] = await t.live(item.id);
      assert.deepEqual(await L.endListing(t.u.id, item.id, v.listing.id, "2026-02-05"), { ok: true });
      let after = await t.get(item.id);
      assert.equal(after.status, "listed");
      assert.equal(after.listPrice, "25.00", "headline moves to the remaining listing");
      assert.deepEqual(await L.endListing(t.u.id, item.id, e.listing.id, "2026-02-06"), { ok: true });
      after = await t.get(item.id);
      assert.deepEqual([after.status, after.listedAt, after.listPrice], ["bought", null, null]);
      assert.equal((await t.live(item.id)).length, 0);
      assert.equal((await L.listingsFor(item.id)).length, 2, "history is kept");
    });

    it("take it off everywhere at once", async () => {
      const t = await setup("end2@example.com");
      const item = await t.newItem();
      await L.listOn(t.u.id, item.id, [ent(t.p.Vinted, "20.00"), ent(t.p.eBay, "25.00")], "2026-02-01", "list");
      assert.deepEqual(await L.unlistAll(t.u.id, item.id, "2026-02-05"), { ok: true });
      assert.equal((await t.get(item.id)).status, "bought");
      assert.equal((await t.live(item.id)).length, 0);
    });

    it("giving up on or donating an item ends its listings", async () => {
      const t = await setup("end3@example.com");
      const a = await t.newItem(); const b = await t.newItem();
      await L.listOn(t.u.id, a.id, [ent(t.p.Vinted, "20.00")], "2026-02-01", "list");
      await L.listOn(t.u.id, b.id, [ent(t.p.eBay, "20.00")], "2026-02-01", "list");
      assert.deepEqual(await L.writeOff(t.u.id, a.id, "unsold", "2026-03-01"), { ok: true });
      assert.deepEqual(await L.writeOff(t.u.id, b.id, "donated", "2026-03-01"), { ok: true });
      assert.equal((await t.get(a.id)).status, "unsold");
      assert.equal((await t.get(b.id)).status, "donated");
      assert.equal((await t.live(a.id)).length + (await t.live(b.id)).length, 0);
    });
  });

  describe("selling", () => {
    const sale = (platformId: number, over: Partial<Parameters<typeof L.sellItem>[2]> = {}) => ({
      platformId, price: "18.00", when: "2026-02-20", handover: "posted", postalServiceId: null, fees: "0.00", postagePaid: "0.00", handedOver: false, ...over,
    });

    it("records which platform it sold on and ends every listing", async () => {
      const t = await setup("sell1@example.com");
      const item = await t.newItem();
      await L.listOn(t.u.id, item.id, [ent(t.p.Vinted, "20.00"), ent(t.p.eBay, "25.00")], "2026-02-01", "list");
      assert.deepEqual(await L.sellItem(t.u.id, item.id, sale(t.p.eBay, { postalServiceId: t.rm.id })), { ok: true });
      const after = await t.get(item.id);
      assert.deepEqual(
        [after.status, after.soldPlatformId, after.soldPrice, after.soldAt, after.handover, after.postalServiceId, after.postedAt],
        ["sold", t.p.eBay, "18.00", "2026-02-20", "posted", t.rm.id, null],
      );
      assert.equal((await t.live(item.id)).length, 0);
      assert.ok((await L.listingsFor(item.id)).every((x) => x.listing.endedAt === "2026-02-20"));
    });

    it("a collected item that has been handed over is complete straight away", async () => {
      const t = await setup("sell2@example.com");
      const item = await t.newItem();
      await L.listOn(t.u.id, item.id, [ent(t.p.Gumtree, "20.00")], "2026-02-01", "list");
      await L.sellItem(t.u.id, item.id, sale(t.p.Gumtree, { handover: "collected", handedOver: true, postalServiceId: t.rm.id }));
      const after = await t.get(item.id);
      assert.deepEqual([after.status, after.handover, after.postedAt, after.postalServiceId], ["completed", "collected", "2026-02-20", null]);
    });

    it("a collected item not yet handed over waits as 'sold' until marked handed over", async () => {
      const t = await setup("sell3@example.com");
      const item = await t.newItem();
      await L.listOn(t.u.id, item.id, [ent(t.p.Gumtree, "20.00")], "2026-02-01", "list");
      await L.sellItem(t.u.id, item.id, sale(t.p.Gumtree, { handover: "delivered", handedOver: false }));
      assert.equal((await t.get(item.id)).status, "sold");
      assert.deepEqual(await L.markHandedOver(t.u.id, item.id, "2026-02-22"), { ok: true });
      const after = await t.get(item.id);
      assert.deepEqual([after.status, after.postedAt], ["completed", "2026-02-22"]);
    });

    it("a posted item can't be 'handed over'", async () => {
      const t = await setup("sell4@example.com");
      const item = await t.newItem();
      await L.sellItem(t.u.id, item.id, sale(t.p.Vinted));
      assert.match((await L.markHandedOver(t.u.id, item.id, "2026-02-22") as { error: string }).error, /sent by post/);
    });

    it("an item can be sold without ever having been listed", async () => {
      const t = await setup("sell5@example.com");
      const item = await t.newItem();
      assert.deepEqual(await L.sellItem(t.u.id, item.id, sale(t.p.Depop)), { ok: true });
      assert.equal((await t.get(item.id)).soldPlatformId, t.p.Depop);
    });

    it("refuses bad sales and changes nothing", async () => {
      const t = await setup("sell6@example.com");
      const other = await setup("sell6other@example.com");
      const item = await t.newItem();
      const err = async (over: Parameters<typeof L.sellItem>[2]) => (await L.sellItem(t.u.id, item.id, over) as { error: string }).error;
      assert.match(await err(sale(t.p.Vinted, { price: null })), /what it sold for/);
      assert.match(await err(sale(t.p.Vinted, { when: "2025-12-01" })), /before you bought/);
      assert.match(await err(sale(t.p.Vinted, { handover: "" })), /how it got to the buyer/);
      assert.match(await err(sale(t.p.Vinted, { handover: "teleported" })), /how it got to the buyer/);
      assert.match(await err(sale(other.p.Vinted)), /which platform/);
      assert.match(await err(sale(t.p.Vinted, { postalServiceId: other.rm.id })), /Unknown postal service/);
      assert.equal((await t.get(item.id)).status, "bought");
    });

    it("can't sell something already sold", async () => {
      const t = await setup("sell7@example.com");
      const item = await t.newItem();
      await L.sellItem(t.u.id, item.id, sale(t.p.Vinted));
      assert.match((await L.sellItem(t.u.id, item.id, sale(t.p.eBay)) as { error: string }).error, /isn't available/);
    });
  });

  describe("fees and postage paid on a sale", () => {
    it("are stored on the sale exactly as given", async () => {
      const t = await setup("fees1@example.com");
      const item = await t.newItem();
      await L.listOn(t.u.id, item.id, [ent(t.p.Vinted, "20.00")], "2026-02-01", "list");
      await L.sellItem(t.u.id, item.id, { platformId: t.p.Vinted, price: "18.00", when: "2026-02-10", handover: "posted", postalServiceId: null, fees: "1.44", postagePaid: "2.50", handedOver: false });
      const after = await t.get(item.id);
      assert.deepEqual([after.fees, after.postagePaid], ["1.44", "2.50"]);
    });
    it("default to nothing, so a plain sale has no costs", async () => {
      const t = await setup("fees2@example.com");
      const item = await t.newItem();
      await L.listOn(t.u.id, item.id, [ent(t.p.Vinted, "20.00")], "2026-02-01", "list");
      await L.sellItem(t.u.id, item.id, { platformId: t.p.Vinted, price: "18.00", when: "2026-02-10", handover: "posted", postalServiceId: null, fees: "0.00", postagePaid: "0.00", handedOver: false });
      const after = await t.get(item.id);
      assert.deepEqual([after.fees, after.postagePaid], ["0.00", "0.00"]);
    });
    it("a platform's fee % is stored as a number and defaults to 0", async () => {
      const t = await setup("fees3@example.com");
      const rows = await dbm.db.select().from(s.platforms).where(eq(s.platforms.userId, t.u.id));
      assert.ok(rows.length > 0 && rows.every((r) => r.feePercent === "0.00"));
    });
  });

  describe("relisting after a return", () => {
    it("clears the old sale, keeps the history, and lists afresh", async () => {
      const t = await setup("relist@example.com");
      const item = await t.newItem();
      await L.listOn(t.u.id, item.id, [ent(t.p.Vinted, "20.00")], "2026-02-01", "list");
      await L.sellItem(t.u.id, item.id, { platformId: t.p.Vinted, price: "18.00", when: "2026-02-10", handover: "posted", postalServiceId: t.rm.id, fees: "1.44", postagePaid: "2.50", handedOver: false });
      await dbm.db.update(s.items).set({ status: "returned", returnedAt: "2026-02-15", refundAmount: "18.00" }).where(eq(s.items.id, item.id));
      assert.deepEqual(await L.listOn(t.u.id, item.id, [ent(t.p.eBay, "17.00")], "2026-02-16", "relist"), { ok: true });
      const after = await t.get(item.id);
      assert.deepEqual(
        [after.status, after.listedAt, after.listPrice, after.soldAt, after.soldPrice, after.soldPlatformId, after.handover, after.postalServiceId, after.returnedAt, after.refundAmount, after.fees, after.postagePaid],
        ["listed", "2026-02-16", "17.00", null, null, null, null, null, null, null, "0.00", "0.00"],
      );
      const all = await L.listingsFor(item.id);
      assert.deepEqual(all.map((x) => [x.platform, x.listing.endedAt]), [["Vinted", "2026-02-10"], ["eBay", null]]);
    });
  });

  describe("editing listings", () => {
    it("updates price, link and date, and keeps the headline in step", async () => {
      const t = await setup("edit@example.com");
      const item = await t.newItem();
      await L.listOn(t.u.id, item.id, [ent(t.p.Vinted, "20.00"), ent(t.p.eBay, "25.00")], "2026-02-01", "list");
      const [v, e] = await t.live(item.id);
      assert.deepEqual(
        await L.editListings(t.u.id, item.id, [
          { listingId: v.listing.id, price: "21.00", url: "https://v.example/x", listedAt: "2026-02-03" },
          { listingId: e.listing.id, price: "26.00", url: null, listedAt: "2026-02-02" },
        ]),
        { ok: true },
      );
      const after = await t.get(item.id);
      assert.deepEqual([after.listedAt, after.listPrice], ["2026-02-02", "21.00"]);
      assert.equal((await t.live(item.id))[0].listing.url, "https://v.example/x");
    });

    it("refuses to edit another item's listing", async () => {
      const t = await setup("edit2@example.com");
      const a = await t.newItem(); const b = await t.newItem();
      await L.listOn(t.u.id, a.id, [ent(t.p.Vinted, "20.00")], "2026-02-01", "list");
      const [la] = await t.live(a.id);
      assert.deepEqual(await L.editListings(t.u.id, b.id, [{ listingId: la.listing.id, price: "1.00", url: null, listedAt: "2026-02-01" }]), { error: "Unknown listing." });
      assert.equal((await t.live(a.id))[0].listing.price, "20.00");
    });
  });

  describe("reading the form", () => {
    it("reads platforms, prices and links, ignoring duplicates", () => {
      const f = new FormData();
      f.append("platformId", "3"); f.append("platformId", "5"); f.append("platformId", "3");
      f.set("price_3", "£12.5"); f.set("url_3", " https://x.example/a "); f.set("price_5", "9");
      assert.deepEqual(L.parseListEntries(f, parseMoney), [
        { platformId: 3, price: "12.50", url: "https://x.example/a" },
        { platformId: 5, price: "9.00", url: null },
      ]);
    });
    it("complains when no platform is chosen or a link isn't a web address", () => {
      assert.deepEqual(L.parseListEntries(new FormData(), parseMoney), { error: "Choose at least one platform." });
      const f = new FormData(); f.append("platformId", "3"); f.set("url_3", "javascript:alert(1)");
      assert.deepEqual(L.parseListEntries(f, parseMoney), { error: "Links must start with http:// or https://" });
    });
    it("only accepts http and https links", () => {
      assert.equal(L.cleanUrl("https://www.vinted.co.uk/items/1"), "https://www.vinted.co.uk/items/1");
      assert.equal(L.cleanUrl(""), null);
      for (const bad of ["ftp://x", "javascript:alert(1)", "vinted.co.uk/items/1", "https://has space.com"]) assert.equal(L.cleanUrl(bad), undefined, bad);
    });
  });
});
