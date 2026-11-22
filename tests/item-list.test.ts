// The Items page list: how many show at first, "Show more", the total count, search, and keeping accounts apart.
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { PAGE_SIZE, parseShowCount } from "@/lib/items";
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
});
