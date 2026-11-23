// "Your data": the full download (what is in the zip, and that it only ever holds the signed-in person's data) and permanent
// account deletion (what goes, what stays, the order of the steps, and that failures leave the account untouched).
import { describe, it, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { unzipSync } from "fflate";
import { dbSkipReason, pointAppAtTestDatabase, resetAndMigrate } from "./helpers/testdb";

type Dbm = typeof import("@/db");
type Schema = typeof import("@/db/schema");

describe("full download and account deletion (database)", { skip: dbSkipReason }, () => {
  let dbm: Dbm;
  let s: Schema;
  let exp: typeof import("@/lib/export");
  let del: typeof import("@/lib/delete-account");

  before(async () => {
    const url = pointAppAtTestDatabase();
    await resetAndMigrate(url);
    dbm = await import("@/db");
    s = await import("@/db/schema");
    exp = await import("@/lib/export");
    del = await import("@/lib/delete-account");
  });
  after(async () => { await dbm?.pool.end(); });
  beforeEach(() => { delete process.env.STRIPE_SECRET_KEY; delete process.env.STRIPE_WEBHOOK_SECRET; });

  async function seller(email: string, extra: Partial<typeof s.users.$inferInsert> = {}) {
    const [u] = await dbm.db.insert(s.users).values({ email, name: `Name of ${email}`, passwordHash: "x", ...extra }).returning();
    const [shop] = await dbm.db.insert(s.shops).values({ userId: u.id, name: `Shop ${email}` }).returning();
    await dbm.db.insert(s.categories).values({ userId: u.id, name: `Cat ${email}`, archived: true });
    await dbm.db.insert(s.postalServices).values({ userId: u.id, name: `Post ${email}` });
    const [plat] = await dbm.db.insert(s.platforms).values({ userId: u.id, name: `Plat ${email}`, feePercent: "10" }).returning();
    const [item] = await dbm.db.insert(s.items).values({
      userId: u.id, name: `Coat of ${email}`, boughtAt: "2026-01-02", buyPrice: "5.00", shopId: shop.id, photoUrl: `https://blob.example/${email}.jpg`,
    }).returning();
    const [listing] = await dbm.db.insert(s.listings).values({ itemId: item.id, platformId: plat.id, price: "20.00", listedAt: "2026-01-03", url: `https://vinted.example/${email}` }).returning();
    await dbm.db.insert(s.priceChanges).values({ itemId: item.id, changedAt: "2026-01-10", oldPrice: "20.00", newPrice: "15.00", listingId: listing.id });
    return u;
  }

  const unzip = async (u: Awaited<ReturnType<typeof seller>>) =>
    // ignoreBOM keeps the byte-order mark in the text (the default decoder silently drops it)
    Object.fromEntries(Object.entries(unzipSync(await exp.exportZip(u))).map(([n, b]) => [n, new TextDecoder("utf-8", { ignoreBOM: true }).decode(b)]));

  it("the zip holds every file, with this person's rows and nothing from anyone else", async () => {
    const a = await seller("zip-a@example.com");
    await seller("zip-b@example.com");
    const files = await unzip(a);
    assert.deepEqual(Object.keys(files).sort(), ["README.txt", "items.csv", "listings.csv", "photos.csv", "price-drops.csv", "settings.csv"]);
    assert.match(files["items.csv"], /Coat of zip-a@example\.com/);
    assert.match(files["listings.csv"], /Plat zip-a@example\.com,20\.00,2026-01-03,,https:\/\/vinted\.example\/zip-a@example\.com/);
    assert.match(files["price-drops.csv"], /Coat of zip-a@example\.com,2026-01-10,20\.00,15\.00/);
    assert.match(files["photos.csv"], /https:\/\/blob\.example\/zip-a@example\.com\.jpg/);
    assert.match(files["settings.csv"], /Platform,Plat zip-a@example\.com,Fee 10\.00%/);
    assert.match(files["settings.csv"], /Category,Cat zip-a@example\.com,Hidden/);
    for (const text of Object.values(files)) assert.doesNotMatch(text, /zip-b@example\.com/);
  });

  it("the spreadsheets open cleanly in Excel (byte-order mark) and the README explains the files", async () => {
    const files = await unzip(await seller("zip-c@example.com"));
    for (const n of ["items.csv", "listings.csv", "price-drops.csv", "photos.csv", "settings.csv"]) assert.ok(files[n].startsWith("﻿"), n);
    assert.match(files["README.txt"], /photos\.csv/);
    assert.match(files["README.txt"], /can't be guessed/);
  });

  it("an account with nothing in it still downloads (headers only)", async () => {
    const [u] = await dbm.db.insert(s.users).values({ email: "empty@example.com", name: "Empty", passwordHash: "x" }).returning();
    const files = await unzip(u);
    assert.match(files["items.csv"], /^﻿Item,Status/);
    assert.equal(files["photos.csv"], "﻿Item,Photo link");
  });

  it("deleting removes the person and everything they own, and leaves other people alone", async () => {
    const gone = await seller("gone@example.com");
    const kept = await seller("kept@example.com");
    await dbm.db.insert(s.waitlist).values({ email: "gone@example.com" });
    const removed: string[][] = [];
    const r = await del.deleteAccount(gone, { cancelSubscription: async () => {}, removePhotos: async (u) => { removed.push(u); } });
    assert.deepEqual(r, { ok: true });
    assert.deepEqual(removed, [["https://blob.example/gone@example.com.jpg"]]);
    const count = async (q: string, p: unknown[]) => Number((await dbm.pool.query(q, p)).rows[0].n);
    for (const t of ["items", "shops", "categories", "postal_services", "platforms"]) assert.equal(await count(`select count(*) n from ${t} where user_id=$1`, [gone.id]), 0, t);
    assert.equal(await count("select count(*) n from users where id=$1", [gone.id]), 0);
    assert.equal(await count("select count(*) n from listings l join items i on i.id=l.item_id where i.user_id=$1", [kept.id]), 1);
    assert.equal(await count("select count(*) n from listings where url like $1", ["%gone@example.com"]), 0);
    assert.equal(await count("select count(*) n from price_changes p join items i on i.id=p.item_id where i.user_id=$1", [kept.id]), 1);
    assert.equal(await count("select count(*) n from price_changes where item_id not in (select id from items)", []), 0);
    assert.equal(await count("select count(*) n from waitlist where email=$1", ["gone@example.com"]), 0);
    assert.equal(await count("select count(*) n from items where user_id=$1", [kept.id]), 1);
  });

  it("cancels a live subscription first, but only when Stripe is set up and the subscription isn't already cancelled", async () => {
    const calls: string[] = [];
    const deps = { cancelSubscription: async (id: string) => { calls.push(id); }, removePhotos: async () => {} };
    process.env.STRIPE_SECRET_KEY = "sk_test_x"; process.env.STRIPE_WEBHOOK_SECRET = "whsec_x";
    await del.deleteAccount(await seller("sub1@example.com", { stripeSubscriptionId: "sub_1", subscriptionStatus: "active" }), deps);
    await del.deleteAccount(await seller("sub2@example.com", { stripeSubscriptionId: "sub_2", subscriptionStatus: "canceled" }), deps);
    await del.deleteAccount(await seller("sub3@example.com"), deps);
    delete process.env.STRIPE_SECRET_KEY;
    await del.deleteAccount(await seller("sub4@example.com", { stripeSubscriptionId: "sub_4", subscriptionStatus: "active" }), deps);
    assert.deepEqual(calls, ["sub_1"]);
  });

  it("if Stripe can't cancel, nothing is deleted and the person is told", async () => {
    process.env.STRIPE_SECRET_KEY = "sk_test_x"; process.env.STRIPE_WEBHOOK_SECRET = "whsec_x";
    const u = await seller("stripefail@example.com", { stripeSubscriptionId: "sub_f", subscriptionStatus: "active" });
    const reported: string[] = [];
    const r = await del.deleteAccount(u, { cancelSubscription: async () => { throw new Error("down"); }, removePhotos: async () => {}, report: async (what) => { reported.push(what); } });
    assert.equal(r.ok, false);
    assert.equal(reported.length, 1, "the failure is reported to the owner");
    assert.match(r.ok ? "" : r.error, /nothing has been deleted/);
    assert.equal(Number((await dbm.pool.query("select count(*) n from users where id=$1", [u.id])).rows[0].n), 1);
    assert.equal(Number((await dbm.pool.query("select count(*) n from items where user_id=$1", [u.id])).rows[0].n), 1);
  });

  it("if the photos can't be removed, nothing is deleted and the person can try again", async () => {
    const u = await seller("photofail@example.com");
    const reported: string[] = [];
    const r = await del.deleteAccount(u, { cancelSubscription: async () => {}, removePhotos: async () => { throw new Error("blob down"); }, report: async (what) => { reported.push(what); } });
    assert.equal(r.ok, false);
    assert.equal(reported.length, 1, "the failure is reported to the owner");
    assert.match(r.ok ? "" : r.error, /nothing has been deleted/);
    assert.equal(Number((await dbm.pool.query("select count(*) n from users where id=$1", [u.id])).rows[0].n), 1);
    const again = await del.deleteAccount(u, { cancelSubscription: async () => {}, removePhotos: async () => {} });
    assert.deepEqual(again, { ok: true });
  });

  it("admins can't delete themselves", async () => {
    const admin = await seller("admin-del@example.com", { role: "admin" });
    const r = await del.deleteAccount(admin, { cancelSubscription: async () => {}, removePhotos: async () => {} });
    assert.equal(r.ok, false);
    assert.equal(Number((await dbm.pool.query("select count(*) n from users where id=$1", [admin.id])).rows[0].n), 1);
  });
});
