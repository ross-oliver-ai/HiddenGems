// The Items page list: how many show at first, "Show more", the total count, search, and keeping accounts apart.
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { FILTERS, PAGE_SIZE, parseShowCount } from "@/lib/items";
import { dbSkipReason, pointAppAtTestDatabase, resetAndMigrate } from "./helpers/testdb";

describe("parseShowCount()", () => {
  it("starts at one page and never goes below it", () => {
    assert.equal(PAGE_SIZE, 50);
    assert.equal(parseShowCount(undefined), 50);
    assert.equal(parseShowCount(""), 50);
    assert.equal(parseShowCount("0"), 50);
    assert.equal(parseShowCount("-20"), 50);
  });
  it("ignores rubbish in the address", () => {
    assert.equal(parseShowCount("lots"), 50);
    assert.equal(parseShowCount("Infinity"), 50);
  });
  it("accepts whole numbers and caps very large ones", () => {
    assert.equal(parseShowCount("100"), 100);
    assert.equal(parseShowCount("150.9"), 150);
    assert.equal(parseShowCount("99999999"), 5000);
  });
});

describe("itemList()", { skip: dbSkipReason }, () => {
  let dbm: typeof import("@/db");
  let list: typeof import("@/lib/item-list").itemList;
  let userId: number;
  let otherId: number;

  before(async () => {
    const url = pointAppAtTestDatabase();
    await resetAndMigrate(url);
    dbm = await import("@/db");
    const s = await import("@/db/schema");
    list = (await import("@/lib/item-list")).itemList;
    const mk = async (email: string) => (await dbm.db.insert(s.users).values({ email, name: email, passwordHash: "x" }).returning())[0];
    userId = (await mk("list@example.com")).id;
    otherId = (await mk("list-other@example.com")).id;
    const [shop] = await dbm.db.insert(s.shops).values({ userId, name: "Oxfam" }).returning();

    // 120 items, created one second apart so "newest first" is well defined: "Item 1" is the oldest, "Item 120" the newest.
    // Every 10th one is sold; items 5 and 6 are Nike; item 7 was bought at the Oxfam shop.
    const t0 = Date.UTC(2026, 0, 1);
    await dbm.db.insert(s.items).values(
      Array.from({ length: 120 }, (_, i) => ({
        userId,
        name: `Item ${i + 1}`,
        brand: i + 1 === 5 || i + 1 === 6 ? "Nike" : null,
        shopId: i + 1 === 7 ? shop.id : null,
        status: ((i + 1) % 10 === 0 ? "sold" : "bought") as "sold" | "bought",
        boughtAt: "2026-01-01",
        buyPrice: "1.00",
        createdAt: new Date(t0 + i * 1000),
      })),
    );
    await dbm.db.insert(s.items).values({ userId: otherId, name: "Someone else's", boughtAt: "2026-01-01", buyPrice: "1.00" });
  });
  after(async () => { await dbm?.pool.end(); });

  it("shows the newest first page and says how many there are in total", async () => {
    const { rows, total } = await list({ userId, statuses: null, term: "", show: 50 });
    assert.equal(rows.length, 50);
    assert.equal(total, 120);
    assert.equal(rows[0].item.name, "Item 120");
    assert.equal(rows[49].item.name, "Item 71");
  });

  it("'Show more' reaches older items, and the whole list is reachable", async () => {
    const more = await list({ userId, statuses: null, term: "", show: 100 });
    assert.equal(more.rows.length, 100);
    assert.equal(more.rows[99].item.name, "Item 21");
    const all = await list({ userId, statuses: null, term: "", show: 150 });
    assert.equal(all.rows.length, 120);
    assert.equal(all.total, 120);
    assert.equal(all.rows[119].item.name, "Item 1"); // the oldest is no longer hidden
  });

  it("counts only the items that match a filter", async () => {
    const sold = await list({ userId, statuses: ["sold"], term: "", show: 50 });
    assert.equal(sold.total, 12);
    assert.equal(sold.rows.length, 12);
    assert.ok(sold.rows.every((r) => r.item.status === "sold"));
  });

  it("search matches name, brand or shop, and the total counts the matches", async () => {
    assert.equal((await list({ userId, statuses: null, term: "nike", show: 50 })).total, 2);
    assert.equal((await list({ userId, statuses: null, term: "oxfam", show: 50 })).total, 1);
    const byName = await list({ userId, statuses: null, term: "Item 11", show: 50 });
    assert.equal(byName.total, 11); // Item 11, 110-119
    assert.equal(byName.rows.length, 11);
  });

  it("never shows or counts another account's items", async () => {
    const { rows, total } = await list({ userId, statuses: null, term: "else", show: 50 });
    assert.equal(total, 0);
    assert.equal(rows.length, 0);
    const theirs = await list({ userId: otherId, statuses: null, term: "", show: 50 });
    assert.equal(theirs.total, 1);
  });

  it("each filter chip uses the right statuses and ordering", () => {
    const f = (id: string) => FILTERS.find((x) => x.id === id)!;
    assert.deepEqual(f("waiting").statuses, ["posted"]);
    assert.equal(f("waiting").label, "Waiting for money");
    assert.equal(f("waiting").order, "waiting");
    assert.equal(f("sold").order, "sold");
    assert.equal(f("send").order, "sold");
    assert.equal(f("listed").order, "listed");
    assert.equal(f("all").order, "newest");
  });

  it("orders sold items by sale date, newest sale first (not by when they were added)", async () => {
    const s = await import("@/db/schema");
    const [u] = await dbm.db.insert(s.users).values({ email: "order-sold@example.com", name: "o", passwordHash: "x" }).returning();
    const base = { userId: u.id, boughtAt: "2026-01-01", buyPrice: "1.00", status: "sold" as const };
    await dbm.db.insert(s.items).values([
      { ...base, name: "Added first, sold last", soldAt: "2026-03-10", createdAt: new Date(Date.UTC(2026, 0, 1)) },
      { ...base, name: "Added last, sold first", soldAt: "2026-02-01", createdAt: new Date(Date.UTC(2026, 0, 3)) },
      { ...base, name: "Added middle, sold middle", soldAt: "2026-03-01", createdAt: new Date(Date.UTC(2026, 0, 2)) },
      { ...base, name: "No sale date", soldAt: null, createdAt: new Date(Date.UTC(2026, 0, 4)) },
    ]);
    const { rows } = await list({ userId: u.id, statuses: null, term: "", show: 50, order: "sold" });
    assert.deepEqual(rows.map((r) => r.item.name), ["Added first, sold last", "Added middle, sold middle", "Added last, sold first", "No sale date"]);
  });

  it("orders listed items longest-listed first, with undated ones last", async () => {
    const s = await import("@/db/schema");
    const [u] = await dbm.db.insert(s.users).values({ email: "order-listed@example.com", name: "o", passwordHash: "x" }).returning();
    const base = { userId: u.id, boughtAt: "2026-01-01", buyPrice: "1.00", status: "listed" as const };
    await dbm.db.insert(s.items).values([
      { ...base, name: "Listed recently", listedAt: "2026-03-01", createdAt: new Date(Date.UTC(2026, 0, 1)) },
      { ...base, name: "Listed longest ago", listedAt: "2026-01-05", createdAt: new Date(Date.UTC(2026, 0, 2)) },
      { ...base, name: "Listed in between", listedAt: "2026-02-01", createdAt: new Date(Date.UTC(2026, 0, 3)) },
      { ...base, name: "No listed date", listedAt: null, createdAt: new Date(Date.UTC(2026, 0, 4)) },
    ]);
    const { rows } = await list({ userId: u.id, statuses: ["listed"], term: "", show: 50, order: "listed" });
    assert.deepEqual(rows.map((r) => r.item.name), ["Listed longest ago", "Listed in between", "Listed recently", "No listed date"]);
  });

  it("'Waiting for money' lists only posted items, longest wait first", async () => {
    const s = await import("@/db/schema");
    const [u] = await dbm.db.insert(s.users).values({ email: "order-waiting@example.com", name: "o", passwordHash: "x" }).returning();
    const base = { userId: u.id, boughtAt: "2026-01-01", buyPrice: "1.00" };
    await dbm.db.insert(s.items).values([
      { ...base, name: "Posted last week", status: "posted", postedAt: "2026-03-10" },
      { ...base, name: "Posted a month ago", status: "posted", postedAt: "2026-02-10" },
      { ...base, name: "Paid already", status: "completed", postedAt: "2026-01-10" },
      { ...base, name: "Not posted yet", status: "sold", postedAt: null },
    ]);
    const w = FILTERS.find((x) => x.id === "waiting")!;
    const { rows, total } = await list({ userId: u.id, statuses: w.statuses, term: "", show: 50, order: w.order });
    assert.equal(total, 2);
    assert.deepEqual(rows.map((r) => r.item.name), ["Posted a month ago", "Posted last week"]);
  });

  it("without an order it stays newest added first", async () => {
    const { rows } = await list({ userId, statuses: null, term: "", show: 3 });
    assert.deepEqual(rows.map((r) => r.item.name), ["Item 120", "Item 119", "Item 118"]);
  });
});
