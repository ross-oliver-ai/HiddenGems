// The first-run checklist and the spotlight: what each step needs, how it's worked out from real data, who sees it, and that every
// spotlight target named in code really exists in a screen.
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { Pool } from "pg";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { TOURS, checklistDone, checklistSteps, isTourName, nextStep, type ChecklistFacts } from "@/lib/checklist-steps";
import { TEST_DATABASE_URL, applyMigrationFiles, dbSkipReason, pointAppAtTestDatabase, resetAndMigrate, resetEmpty } from "./helpers/testdb";

const none: ChecklistFacts = { feesReviewed: false, itemCount: 0, hasListing: false, hasSale: false, toListItemId: null, listedItemId: null };
const ids = (f: ChecklistFacts) => checklistSteps(f).map((s) => [s.id, s.done]);

describe("checklistSteps()", () => {
  it("has four steps in order: fees, first item, list it, first sale", () => {
    assert.deepEqual(checklistSteps(none).map((s) => s.id), ["fees", "first-item", "list", "sale"]);
  });
  it("starts with nothing done, and only the first two steps can be opened", () => {
    const s = checklistSteps(none);
    assert.deepEqual(s.map((x) => x.done), [false, false, false, false]);
    assert.deepEqual(s.map((x) => x.href !== null), [true, true, false, false]);
    assert.equal(s[2].blockedHint, "Add an item first.");
    assert.equal(s[3].blockedHint, "List an item first.");
  });
  it("ticks each step from the matching fact", () => {
    assert.deepEqual(ids({ ...none, feesReviewed: true }), [["fees", true], ["first-item", false], ["list", false], ["sale", false]]);
    assert.deepEqual(ids({ ...none, itemCount: 2 }), [["fees", false], ["first-item", true], ["list", false], ["sale", false]]);
    assert.deepEqual(ids({ ...none, hasListing: true }), [["fees", false], ["first-item", false], ["list", true], ["sale", false]]);
    assert.deepEqual(ids({ ...none, hasSale: true }), [["fees", false], ["first-item", false], ["list", false], ["sale", true]]);
  });
  it("points 'list it' at the newest item waiting to be listed, and 'sale' at the newest listed one", () => {
    const s = checklistSteps({ ...none, itemCount: 2, toListItemId: 7, listedItemId: 9 });
    assert.equal(s[2].href, "/items/7?tour=list-step");
    assert.equal(s[3].href, "/items/9?tour=sell-step");
  });
  it("falls back to the Items list when there are items but none waiting to be listed", () => {
    assert.equal(checklistSteps({ ...none, itemCount: 1 })[2].href, "/items");
  });
  it("every link's tour name is a real one", () => {
    const f = { ...none, itemCount: 1, toListItemId: 1, listedItemId: 2 };
    for (const s of checklistSteps(f)) {
      const t = s.href && new URL(s.href, "http://x").searchParams.get("tour");
      if (t) assert.ok(isTourName(t), `${s.id}: ${t}`);
    }
  });
  it("is finished only when every step is", () => {
    assert.equal(checklistDone(checklistSteps(none)), false);
    assert.equal(checklistDone(checklistSteps({ ...none, feesReviewed: true, itemCount: 1, hasListing: true })), false);
    assert.equal(checklistDone(checklistSteps({ ...none, feesReviewed: true, itemCount: 1, hasListing: true, hasSale: true })), true);
  });
  it("gives the main button to the first step still to do that can be opened", () => {
    assert.equal(nextStep(checklistSteps(none))?.id, "fees");
    assert.equal(nextStep(checklistSteps({ ...none, feesReviewed: true }))?.id, "first-item");
    assert.equal(nextStep(checklistSteps({ ...none, feesReviewed: true, itemCount: 1, toListItemId: 3 }))?.id, "list");
    assert.equal(nextStep(checklistSteps({ feesReviewed: true, itemCount: 1, hasListing: true, hasSale: true, toListItemId: null, listedItemId: null })), null);
  });
});

describe("spotlight targets", () => {
  /** Every .tsx file under src */
  const files = (dir: string): string[] => readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? files(p) : p.endsWith(".tsx") ? [p] : [];
  });
  const used = new Map<string, string[]>();
  for (const f of files("src")) {
    for (const m of readFileSync(f, "utf8").matchAll(/(?:data-tour|\btour)=(?:\{[^"{}]*?)?"([a-z-]+)"/g)) {
      used.set(m[1], [...(used.get(m[1]) ?? []), f]);
    }
  }
  it("every target named in TOURS is on a screen (data-tour=...), so a screen change that removes one fails here", () => {
    for (const name of Object.keys(TOURS)) assert.ok(used.has(name), `no screen has data-tour="${name}"`);
  });
  it("every data-tour on a screen is named in TOURS, so it has a caption", () => {
    for (const name of used.keys()) assert.ok(isTourName(name), `data-tour="${name}" isn't in TOURS`);
  });
  it("each caption is a short single sentence or two", () => {
    for (const [k, v] of Object.entries(TOURS)) assert.ok(v.length > 20 && v.length < 140, k);
  });
  it("only accepts known names from the address bar", () => {
    assert.equal(isTourName("fees"), true);
    for (const bad of ["", "FEES", "constructor", "__proto__", "toString", null, undefined, 3]) assert.equal(isTourName(bad), false, String(bad));
  });
});

describe("migration 0010: new accounts only", { skip: dbSkipReason }, () => {
  let pool: Pool;
  before(async () => {
    const url = TEST_DATABASE_URL!;
    await resetEmpty(url);
    await applyMigrationFiles(url, 0, 9);
    pool = new Pool({ connectionString: url, max: 1 });
    await pool.query("insert into users (email, name, password_hash) values ('old1@example.com','o','x'), ('old2@example.com','o','x')");
    await applyMigrationFiles(url, 10, 10);
  });
  after(async () => { await pool?.end(); });

  it("hides the checklist for every account that already existed", async () => {
    const { rows } = await pool.query("select checklist_hidden, fees_reviewed_at from users order by email");
    assert.deepEqual(rows, [{ checklist_hidden: true, fees_reviewed_at: null }, { checklist_hidden: true, fees_reviewed_at: null }]);
  });
  it("leaves it on for accounts created afterwards", async () => {
    await pool.query("insert into users (email, name, password_hash) values ('new@example.com','n','x')");
    const { rows } = await pool.query("select checklist_hidden from users where email='new@example.com'");
    assert.deepEqual(rows, [{ checklist_hidden: false }]);
  });
});

describe("checklistFacts() and friends", { skip: dbSkipReason }, () => {
  let dbm: typeof import("@/db");
  let s: typeof import("@/db/schema");
  let c: typeof import("@/lib/checklist");
  let user: (email: string) => Promise<import("@/db/schema").User>;

  before(async () => {
    const url = pointAppAtTestDatabase();
    await resetAndMigrate(url);
    dbm = await import("@/db");
    s = await import("@/db/schema");
    c = await import("@/lib/checklist");
    user = async (email) => (await dbm.db.insert(s.users).values({ email, name: email, passwordHash: "x" }).returning())[0];
  });
  after(async () => { await dbm?.pool.end(); });

  const reload = async (id: number) => (await dbm.db.query.users.findFirst({ where: (u, { eq }) => eq(u.id, id) }))!;
  const item = async (userId: number, name: string, extra: Partial<typeof import("@/db/schema").items.$inferInsert> = {}) =>
    (await dbm.db.insert(s.items).values({ userId, name, boughtAt: "2026-01-01", buyPrice: "1.00", ...extra }).returning())[0];

  it("a brand-new account has nothing done", async () => {
    const u = await user("fresh@example.com");
    assert.deepEqual(await c.checklistFacts(u), { feesReviewed: false, itemCount: 0, hasListing: false, hasSale: false, toListItemId: null, listedItemId: null });
  });

  it("counts items, finds the newest to-list and listed items, and sees listings and sales", async () => {
    const u = await user("busy@example.com");
    const [p] = await dbm.db.insert(s.platforms).values({ userId: u.id, name: "Vinted" }).returning();
    const a = await item(u.id, "A", { status: "bought", createdAt: new Date(Date.UTC(2026, 0, 1)) });
    const b = await item(u.id, "B", { status: "bought", createdAt: new Date(Date.UTC(2026, 0, 2)) });
    const l = await item(u.id, "L", { status: "listed", createdAt: new Date(Date.UTC(2026, 0, 3)) });
    let f = await c.checklistFacts(u);
    assert.deepEqual(f, { feesReviewed: false, itemCount: 3, hasListing: false, hasSale: false, toListItemId: b.id, listedItemId: l.id });
    await dbm.db.insert(s.listings).values({ itemId: l.id, platformId: p.id, price: "10.00", listedAt: "2026-01-03" });
    f = await c.checklistFacts(u);
    assert.equal(f.hasListing, true);
    assert.equal(f.hasSale, false);
    await item(u.id, "Sold one", { status: "sold", soldAt: "2026-02-01", soldPrice: "9.00" });
    f = await c.checklistFacts(u);
    assert.equal(f.hasSale, true);
    assert.notEqual(a.id, f.toListItemId);
  });

  it("never looks at another account's items, listings or sales", async () => {
    const a = await user("mine@example.com");
    const b = await user("theirs@example.com");
    const [p] = await dbm.db.insert(s.platforms).values({ userId: b.id, name: "eBay" }).returning();
    const theirs = await item(b.id, "Theirs", { status: "sold", soldAt: "2026-02-01" });
    await dbm.db.insert(s.listings).values({ itemId: theirs.id, platformId: p.id, price: "5.00", listedAt: "2026-01-01" });
    assert.deepEqual(await c.checklistFacts(a), { feesReviewed: false, itemCount: 0, hasListing: false, hasSale: false, toListItemId: null, listedItemId: null });
  });

  it("saving the fees form counts as reviewing them, even with every fee at 0, and keeps the first date", async () => {
    const u = await user("fees@example.com");
    await c.markFeesReviewed(u.id);
    const first = (await reload(u.id)).feesReviewedAt;
    assert.ok(first);
    assert.equal((await c.checklistFacts(await reload(u.id))).feesReviewed, true);
    await new Promise((r) => setTimeout(r, 20));
    await c.markFeesReviewed(u.id);
    assert.equal((await reload(u.id)).feesReviewedAt?.getTime(), first!.getTime());
  });

  it("hiding the checklist sticks, and only for that account", async () => {
    const u = await user("hide@example.com");
    const other = await user("hide-other@example.com");
    assert.equal(c.checklistAvailable(u), true);
    await c.hideChecklist(u.id);
    assert.equal(c.checklistAvailable(await reload(u.id)), false);
    assert.equal(c.checklistAvailable(await reload(other.id)), true);
  });

  it("isn't offered to an account whose trial has ended (it can't add anything)", async () => {
    const u = await user("expired@example.com");
    const expired = { ...(await reload(u.id)), trialEndsAt: new Date(Date.now() - 86_400_000), subscriptionStatus: null, billingExempt: false };
    assert.equal(c.checklistAvailable(expired, true), false); // billing switched on: read-only, so no checklist
    assert.equal(c.checklistAvailable(expired, false), true); // billing off: everyone can write
  });
});
