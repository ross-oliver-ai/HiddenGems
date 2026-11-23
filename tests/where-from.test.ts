// "Where from": the starter entries (new accounts and the one-off migration for existing accounts) and remembering the last place used.
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { Pool } from "pg";
import { readFileSync } from "node:fs";
import { TEST_DATABASE_URL, applyMigrationFiles, dbSkipReason, pointAppAtTestDatabase, resetAndMigrate, resetEmpty } from "./helpers/testdb";

describe("starter list", { skip: dbSkipReason }, () => {
  it("is Car Boot, Charity Shop, Online Auction, Own Wardrobe, A to Z", async () => {
    pointAppAtTestDatabase(); // the defaults file loads the database module, which needs a database address (it isn't used here)
    const { DEFAULT_SHOPS } = await import("@/lib/defaults");
    assert.deepEqual(DEFAULT_SHOPS, ["Car Boot", "Charity Shop", "Online Auction", "Own Wardrobe"]);
    assert.deepEqual([...DEFAULT_SHOPS].sort((a, b) => a.localeCompare(b)), DEFAULT_SHOPS);
  });
});

describe("migration 0009: starter entries for existing accounts", { skip: dbSkipReason }, () => {
  let pool: Pool;
  let a: number, b: number, c: number;
  const names = async (uid: number) => (await pool.query("select name, archived from shops where user_id=$1 order by name", [uid])).rows;

  before(async () => {
    const url = TEST_DATABASE_URL!;
    await resetEmpty(url);
    await applyMigrationFiles(url, 0, 8);
    pool = new Pool({ connectionString: url, max: 1 });
    const mk = async (email: string) => (await pool.query("insert into users (email, name, password_hash) values ($1,$1,'x') returning id", [email])).rows[0].id as number;
    a = await mk("a@example.com"); // no places at all
    b = await mk("b@example.com"); // has "car boot" in lower case, and Oxfam, which has an item
    c = await mk("c@example.com"); // hid Charity Shop on purpose
    await pool.query("insert into shops (user_id, name) values ($1,'car boot'), ($1,'Oxfam')", [b]);
    await pool.query("insert into shops (user_id, name, archived) values ($1,'Charity Shop', true)", [c]);
    const oxfam = (await pool.query("select id from shops where user_id=$1 and name='Oxfam'", [b])).rows[0].id;
    await pool.query("insert into items (user_id, name, status, bought_at, buy_price, shop_id) values ($1,'Coat','bought','2026-01-01','5.00',$2)", [b, oxfam]);
    await applyMigrationFiles(url, 9, 9);
  });
  after(async () => { await pool?.end(); });

  it("gives an account with no places all four", async () => {
    assert.deepEqual((await names(a)).map((r) => r.name), ["Car Boot", "Charity Shop", "Online Auction", "Own Wardrobe"]);
  });

  it("adds only what is missing, matching names whatever the capitalisation", async () => {
    assert.deepEqual((await names(b)).map((r) => r.name), ["Charity Shop", "Online Auction", "Own Wardrobe", "Oxfam", "car boot"]);
  });

  it("leaves a place the seller hid hidden, and doesn't add a second one", async () => {
    const rows = await names(c);
    assert.deepEqual(rows.filter((r) => r.name === "Charity Shop"), [{ name: "Charity Shop", archived: true }]);
    assert.equal(rows.length, 4);
  });

  it("leaves existing items and their place alone", async () => {
    const { rows } = await pool.query("select i.name, s.name as shop from items i join shops s on s.id = i.shop_id");
    assert.deepEqual(rows, [{ name: "Coat", shop: "Oxfam" }]);
  });

  it("does nothing the second time it is run", async () => {
    const before = (await pool.query("select count(*)::int as n from shops")).rows[0].n;
    for (const stmt of readFileSync("./drizzle/0009_where_from_starters.sql", "utf8").split("--> statement-breakpoint")) if (stmt.trim()) await pool.query(stmt);
    assert.equal((await pool.query("select count(*)::int as n from shops")).rows[0].n, before);
  });
});

describe("new accounts and the remembered place", { skip: dbSkipReason }, () => {
  let dbm: typeof import("@/db");
  let seed: typeof import("@/lib/defaults").seedUserDefaults;
  let last: typeof import("@/lib/queries").lastShopName;
  let s: typeof import("@/db/schema");
  let DEFAULT_SHOPS: string[];

  before(async () => {
    const url = pointAppAtTestDatabase();
    await resetAndMigrate(url);
    dbm = await import("@/db");
    s = await import("@/db/schema");
    ({ seedUserDefaults: seed, DEFAULT_SHOPS } = await import("@/lib/defaults"));
    last = (await import("@/lib/queries")).lastShopName;
  });
  after(async () => { await dbm?.pool.end(); });

  const newUser = async (email: string) => (await dbm.db.insert(s.users).values({ email, name: email, passwordHash: "x" }).returning())[0];
  const shopId = async (userId: number, name: string) => (await dbm.db.query.shops.findFirst({ where: (t, { and, eq }) => and(eq(t.userId, userId), eq(t.name, name)) }))!.id;
  const add = (userId: number, name: string, shop: number | null, at: number) =>
    dbm.db.insert(s.items).values({ userId, name, boughtAt: "2026-01-01", buyPrice: "1.00", shopId: shop, createdAt: new Date(Date.UTC(2026, 0, 1) + at * 1000) });

  it("a new account starts with the four starter places and nothing pre-selected", async () => {
    const u = await newUser("fresh@example.com");
    await seed(u.id);
    const rows = await dbm.db.select().from(s.shops).where((await import("drizzle-orm")).eq(s.shops.userId, u.id));
    assert.deepEqual(rows.map((r) => r.name).sort(), DEFAULT_SHOPS);
    assert.equal(await last(u.id), "");
  });

  it("remembers the place of the newest item", async () => {
    const u = await newUser("remember@example.com");
    await seed(u.id);
    await add(u.id, "First", await shopId(u.id, "Charity Shop"), 1);
    await add(u.id, "Second", await shopId(u.id, "Car Boot"), 2);
    assert.equal(await last(u.id), "Car Boot");
    await add(u.id, "Third, no place", null, 3);
    assert.equal(await last(u.id), "Car Boot"); // an item with no place doesn't wipe it
  });

  it("skips a place the seller has hidden, using the most recent one still showing", async () => {
    const u = await newUser("hidden@example.com");
    await seed(u.id);
    const cb = await shopId(u.id, "Car Boot");
    await add(u.id, "First", await shopId(u.id, "Charity Shop"), 1);
    await add(u.id, "Second", cb, 2);
    await dbm.db.update(s.shops).set({ archived: true }).where((await import("drizzle-orm")).eq(s.shops.id, cb));
    assert.equal(await last(u.id), "Charity Shop");
  });

  it("is blank when every place used has been hidden, and never uses another account's", async () => {
    const u = await newUser("blank@example.com");
    const other = await newUser("blank-other@example.com");
    await seed(u.id);
    await seed(other.id);
    await add(other.id, "Theirs", await shopId(other.id, "Own Wardrobe"), 5);
    assert.equal(await last(u.id), "");
    const ow = await shopId(u.id, "Own Wardrobe");
    await add(u.id, "Mine", ow, 6);
    await dbm.db.update(s.shops).set({ archived: true }).where((await import("drizzle-orm")).eq(s.shops.id, ow));
    assert.equal(await last(u.id), "");
  });
});
