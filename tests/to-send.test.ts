// The "To send" view: grouping, which items appear, and undoing a tick-off.
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { groupToSend, type SendInput } from "@/lib/send-groups";
import { dbSkipReason, pointAppAtTestDatabase, resetAndMigrate } from "./helpers/testdb";

const row = (id: number, over: Partial<SendInput> = {}): SendInput => ({
  id, name: `Item ${id}`, photoUrl: null, soldAt: "2026-01-10", daysAgo: 0, soldOn: "Vinted", handover: "posted", postalId: null, postalName: null, ...over,
});

describe("groupToSend()", () => {
  it("makes one group per postal service in use, A to Z, then the fixed groups", () => {
    const g = groupToSend([
      row(1, { postalId: 2, postalName: "Royal Mail" }),
      row(2, { postalId: 1, postalName: "Evri" }),
      row(3, { handover: "delivered" }),
      row(4, { handover: "collected" }),
      row(5),
      row(6, { handover: null }),
      row(7, { postalId: 3, postalName: "DPD" }),
    ]);
    assert.deepEqual(g.map((x) => x.title), ["DPD", "Evri", "Royal Mail", "No service chosen", "Collection", "Delivery", "No method set"]);
  });

  it("groups by whatever services exist, not a fixed list", () => {
    const g = groupToSend([row(1, { postalId: 9, postalName: "Yodel" })]);
    assert.deepEqual(g.map((x) => [x.title, x.unit, x.rows.length]), [["Yodel", "parcel", 1]]);
  });

  it("hides empty groups, and returns nothing when nothing is waiting", () => {
    assert.deepEqual(groupToSend([]), []);
    assert.deepEqual(groupToSend([row(1, { handover: "collected" })]).map((x) => x.title), ["Collection"]);
  });

  it("puts the longest-waiting sale first in each group", () => {
    const g = groupToSend([
      row(1, { postalId: 1, postalName: "Evri", soldAt: "2026-01-12" }),
      row(2, { postalId: 1, postalName: "Evri", soldAt: "2026-01-08" }),
      row(3, { postalId: 1, postalName: "Evri", soldAt: "2026-01-08" }),
    ]);
    assert.deepEqual(g[0].rows.map((r) => r.id), [2, 3, 1]);
  });

  it("counts parcels for post and items for in-person handovers", () => {
    const g = groupToSend([row(1, { postalId: 1, postalName: "Evri" }), row(2, { handover: "collected" })]);
    assert.deepEqual(g.map((x) => x.unit), ["parcel", "item"]);
  });

  it("keeps every item in exactly one group", () => {
    const input = [row(1, { postalId: 1, postalName: "Evri" }), row(2), row(3, { handover: "delivered" }), row(4, { handover: null }), row(5, { handover: "collected" })];
    const ids = groupToSend(input).flatMap((x) => x.rows.map((r) => r.id)).sort();
    assert.deepEqual(ids, [1, 2, 3, 4, 5]);
  });
});

describe("toSendGroups() and undoSend()", { skip: dbSkipReason }, () => {
  let dbm: typeof import("@/db");
  let s: typeof import("@/db/schema");
  let T: typeof import("@/lib/to-send");
  let L: typeof import("@/lib/listings");
  let eq: typeof import("drizzle-orm").eq;

  before(async () => {
    const url = pointAppAtTestDatabase();
    await resetAndMigrate(url);
    dbm = await import("@/db");
    s = await import("@/db/schema");
    T = await import("@/lib/to-send");
    L = await import("@/lib/listings");
    eq = (await import("drizzle-orm")).eq;
  });
  after(async () => { await dbm?.pool.end(); });

  async function setup(email: string) {
    const { seedUserDefaults } = await import("@/lib/defaults");
    const [u] = await dbm.db.insert(s.users).values({ email, name: email, passwordHash: "x" }).returning();
    await seedUserDefaults(u.id);
    const [evri] = await dbm.db.select().from(s.postalServices).where(eq(s.postalServices.userId, u.id)).limit(1);
    const [vinted] = await dbm.db.select().from(s.platforms).where(eq(s.platforms.userId, u.id)).limit(1);
    const add = async (name: string, v: Partial<typeof s.items.$inferInsert>) =>
      (await dbm.db.insert(s.items).values({ userId: u.id, name, status: "sold", boughtAt: "2026-01-01", buyPrice: "2.00", soldAt: "2026-01-10", soldPrice: "9.00", soldPlatformId: vinted.id, handover: "posted", ...v }).returning())[0];
    const get = async (id: number) => (await dbm.db.select().from(s.items).where(eq(s.items.id, id)))[0];
    return { u, evri, add, get };
  }

  it("lists only sold items still waiting, never listed, posted, completed or returned ones", async () => {
    const t = await setup("send1@example.com");
    await t.add("Waiting", { postalServiceId: t.evri.id });
    await t.add("Still listed", { status: "listed", soldAt: null, soldPrice: null, handover: null });
    await t.add("Posted", { status: "posted", postedAt: "2026-01-11", postalServiceId: t.evri.id });
    await t.add("Done", { status: "completed", postedAt: "2026-01-11" });
    await t.add("Returned", { status: "returned", returnedAt: "2026-01-20", refundAmount: "9.00" });
    const g = await T.toSendGroups(t.u.id, "2026-01-15");
    assert.deepEqual(g.map((x) => [x.title, x.rows.map((r) => r.name)]), [[t.evri.name, ["Waiting"]]]);
    assert.equal(g[0].rows[0].daysAgo, 5);
    assert.equal(g[0].rows[0].soldOn, "Vinted");
  });

  it("shows a service even after it has been hidden, because its parcels still need sending", async () => {
    const t = await setup("send2@example.com");
    await dbm.db.update(s.postalServices).set({ archived: true }).where(eq(s.postalServices.id, t.evri.id));
    await t.add("Parcel", { postalServiceId: t.evri.id });
    assert.deepEqual((await T.toSendGroups(t.u.id, "2026-01-15")).map((x) => x.title), [t.evri.name]);
  });

  it("never shows another account's items", async () => {
    const a = await setup("send3a@example.com");
    const b = await setup("send3b@example.com");
    await a.add("Mine", {});
    await b.add("Theirs", {});
    const names = (await T.toSendGroups(a.u.id, "2026-01-15")).flatMap((x) => x.rows.map((r) => r.name));
    assert.deepEqual(names, ["Mine"]);
  });

  it("search narrows the list by name", async () => {
    const t = await setup("send4@example.com");
    await t.add("Blue jumper", {});
    await t.add("Red boots", {});
    assert.deepEqual((await T.toSendGroups(t.u.id, "2026-01-15", "jump")).flatMap((x) => x.rows.map((r) => r.name)), ["Blue jumper"]);
  });

  describe("undoSend()", () => {
    it("puts a posted parcel back to 'sold' and clears the posted date", async () => {
      const t = await setup("undo1@example.com");
      const i = await t.add("Parcel", { status: "posted", postedAt: "2026-01-11" });
      assert.deepEqual(await L.undoSend(t.u.id, i.id), { ok: true });
      const after = await t.get(i.id);
      assert.deepEqual([after.status, after.postedAt], ["sold", null]);
    });
    it("puts a handed-over collection or delivery back to 'sold'", async () => {
      const t = await setup("undo2@example.com");
      for (const handover of ["collected", "delivered"] as const) {
        const i = await t.add(handover, { status: "completed", handover, postedAt: "2026-01-11" });
        assert.deepEqual(await L.undoSend(t.u.id, i.id), { ok: true });
        assert.equal((await t.get(i.id)).status, "sold");
      }
    });
    it("won't undo a completed postal sale, or an item that isn't a finished step", async () => {
      const t = await setup("undo3@example.com");
      const completed = await t.add("Completed by post", { status: "completed", postedAt: "2026-01-11" });
      const waiting = await t.add("Waiting", {});
      const listed = await t.add("Listed", { status: "listed", soldAt: null, soldPrice: null, handover: null });
      for (const i of [completed, waiting, listed]) {
        assert.match((await L.undoSend(t.u.id, i.id) as { error: string }).error, /can't be undone/);
      }
      assert.equal((await t.get(completed.id)).status, "completed");
    });
    it("won't touch another account's item", async () => {
      const a = await setup("undo4a@example.com");
      const b = await setup("undo4b@example.com");
      const theirs = await b.add("Theirs", { status: "posted", postedAt: "2026-01-11" });
      assert.match((await L.undoSend(a.u.id, theirs.id) as { error: string }).error, /not found/i);
      assert.equal((await b.get(theirs.id)).status, "posted");
    });
  });
});
