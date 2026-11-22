// The multi-platform migration (0007) copies existing data into new tables. This builds a database exactly as it was
// BEFORE that migration, with realistic items in every state, runs the migration, and proves that
//   (a) nothing about the existing items changed, and (b) the new tables were filled in correctly.
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { Pool } from "pg";
import { applyMigrationFiles, dbSkipReason, resetEmpty, TEST_DATABASE_URL } from "./helpers/testdb";

describe("migration 0007: existing data moves to platforms and listings", { skip: dbSkipReason }, () => {
  let pool: Pool;
  let before0007: Record<string, unknown>[];
  const ids: Record<string, number> = {};
  let userId: number;
  let emptyUserId: number;

  const ITEM_COLUMNS = `id, user_id, name, brand, size, condition, notes, photo_url, category_id, status, shop_id, bought_at, buy_price,
    listed_at, list_price, vinted_url, sold_at, sold_price, postal_service_id, posted_at, returned_at, refund_amount, created_at, updated_at`;

  before(async () => {
    const url = TEST_DATABASE_URL!;
    await resetEmpty(url);
    await applyMigrationFiles(url, 0, 6); // the database as it was before this change
    pool = new Pool({ connectionString: url, max: 1 });

    userId = (await pool.query("insert into users (email, name, password_hash) values ('seller@example.com','Seller','x') returning id")).rows[0].id;
    emptyUserId = (await pool.query("insert into users (email, name, password_hash) values ('empty@example.com','Empty','x') returning id")).rows[0].id;
    const postal = (await pool.query("insert into postal_services (user_id, name) values ($1,'Royal Mail') returning id", [userId])).rows[0].id;

    const add = async (key: string, cols: string, vals: unknown[]) => {
      const names = ["user_id", "name", "bought_at", "buy_price", ...cols.split(",")];
      const params = [userId, key, "2026-01-01", "5.00", ...vals];
      const r = await pool.query(`insert into items (${names.join(",")}) values (${params.map((_, i) => `$${i + 1}`).join(",")}) returning id`, params);
      ids[key] = r.rows[0].id;
    };
    await add("bought", "status", ["bought"]);
    await add("listed", "status,listed_at,list_price,vinted_url", ["listed", "2026-01-03", "25.00", "https://www.vinted.co.uk/items/1"]);
    await add("completed", "status,listed_at,list_price,sold_at,sold_price,postal_service_id,posted_at", ["completed", "2026-01-03", "25.00", "2026-01-10", "20.00", postal, "2026-01-11"]);
    await add("returned", "status,listed_at,list_price,sold_at,sold_price,returned_at,refund_amount", ["returned", "2026-01-04", "15.00", "2026-01-09", "12.00", "2026-01-20", "12.00"]);
    await add("unsold", "status,listed_at,list_price,updated_at", ["unsold", "2026-01-05", "9.00", "2026-01-25T12:00:00Z"]);
    await add("directsale", "status,sold_at,sold_price,posted_at", ["posted", "2026-01-12", "8.00", "2026-01-13"]);
    await pool.query("insert into price_changes (item_id, changed_at, old_price, new_price) values ($1,'2026-01-08','30.00','25.00')", [ids.listed]);

    before0007 = (await pool.query(`select ${ITEM_COLUMNS} from items order by id`)).rows;
    await applyMigrationFiles(url, 7, 7);
  });
  after(async () => { await pool?.end(); });

  it("does not change a single existing column of any item", async () => {
    const after0007 = (await pool.query(`select ${ITEM_COLUMNS} from items order by id`)).rows;
    assert.equal(after0007.length, 6);
    assert.deepEqual(after0007, before0007);
  });

  it("gives every account the five default platforms, Vinted first", async () => {
    for (const uid of [userId, emptyUserId]) {
      const names = (await pool.query("select name from platforms where user_id=$1 order by id", [uid])).rows.map((r) => r.name);
      assert.deepEqual(names, ["Vinted", "eBay", "Depop", "Facebook Marketplace", "Gumtree"]);
    }
  });

  const listingFor = async (key: string) => (await pool.query("select l.id, l.price, l.url, l.listed_at::text as listed_at, l.ended_at::text as ended_at, p.name as platform from listings l join platforms p on p.id=l.platform_id where l.item_id=$1", [ids[key]])).rows;

  it("makes a Vinted listing for every item that was ever listed, and none for the others", async () => {
    assert.equal((await pool.query("select count(*)::int as n from listings")).rows[0].n, 4);
    assert.equal((await listingFor("bought")).length, 0);
    assert.equal((await listingFor("directsale")).length, 0);
    for (const k of ["listed", "completed", "returned", "unsold"]) {
      const l = await listingFor(k);
      assert.equal(l.length, 1, k);
      assert.equal(l[0].platform, "Vinted", k);
    }
  });

  it("keeps an item that is still listed live, with its price, link and date", async () => {
    const [l] = await listingFor("listed");
    assert.equal(l.price, "25.00");
    assert.equal(l.url, "https://www.vinted.co.uk/items/1");
    assert.equal(l.listed_at, "2026-01-03");
    assert.equal(l.ended_at, null);
  });

  it("ends the listing on the sale date for sold and returned items", async () => {
    assert.equal((await listingFor("completed"))[0].ended_at, "2026-01-10");
    assert.equal((await listingFor("returned"))[0].ended_at, "2026-01-09");
  });

  it("ends the listing of an item that was given up on, on the day it was last changed", async () => {
    assert.equal((await listingFor("unsold"))[0].ended_at, "2026-01-25");
  });

  it("records every existing sale as sold on Vinted and posted", async () => {
    for (const k of ["completed", "returned", "directsale"]) {
      const r = (await pool.query("select p.name as platform, i.handover from items i left join platforms p on p.id=i.sold_platform_id where i.id=$1", [ids[k]])).rows[0];
      assert.deepEqual(r, { platform: "Vinted", handover: "posted" }, k);
    }
    for (const k of ["bought", "listed", "unsold"]) {
      const r = (await pool.query("select sold_platform_id, handover from items where id=$1", [ids[k]])).rows[0];
      assert.deepEqual(r, { sold_platform_id: null, handover: null }, k);
    }
  });

  it("attaches existing price drops to the item's listing", async () => {
    const [pc] = (await pool.query("select listing_id from price_changes")).rows;
    assert.equal(pc.listing_id, (await listingFor("listed"))[0].id);
  });
});
