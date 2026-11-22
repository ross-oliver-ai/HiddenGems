// Every migration must apply cleanly to an empty database, in order, exactly as a production deploy runs them.
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { Pool } from "pg";
import { dbSkipReason, resetAndMigrate, pointAppAtTestDatabase } from "./helpers/testdb";

describe("database migrations", { skip: dbSkipReason }, () => {
  let pool: Pool;
  before(async () => {
    const url = pointAppAtTestDatabase();
    await resetAndMigrate(url);
    pool = new Pool({ connectionString: url, max: 1 });
  });
  after(async () => { await pool?.end(); });

  const names = async (sql: string) => (await pool.query(sql)).rows.map((r) => Object.values(r)[0] as string);

  it("create every table the app uses", async () => {
    const tables = await names("select table_name from information_schema.tables where table_schema='public' order by 1");
    for (const t of ["users", "shops", "categories", "postal_services", "items", "price_changes", "waitlist", "auth_tokens", "stripe_events"]) {
      assert.ok(tables.includes(t), `missing table ${t}`);
    }
  });

  it("give new accounts the intended defaults", async () => {
    await pool.query("insert into users (email, name, password_hash) values ('d@example.com','D','x')");
    const { rows } = await pool.query("select color_mode, theme, role, billing_exempt, must_change_password from users where email='d@example.com'");
    assert.deepEqual(rows[0], { color_mode: "dark", theme: "blossom", role: "seller", billing_exempt: false, must_change_password: true });
  });

  it("support every item status and token kind the code uses", async () => {
    const statuses = await names("select enumlabel from pg_enum e join pg_type t on t.oid=e.enumtypid where t.typname='item_status' order by e.enumsortorder");
    assert.deepEqual(statuses, ["bought", "listed", "sold", "posted", "completed", "returned", "unsold", "donated"]);
    const kinds = await names("select enumlabel from pg_enum e join pg_type t on t.oid=e.enumtypid where t.typname='token_kind' order by e.enumsortorder");
    assert.deepEqual(kinds, ["verify_email", "reset_password", "change_email"]);
  });

  it("keep one account per email address (case-insensitive handling is done in code, uniqueness here)", async () => {
    await pool.query("insert into users (email, name, password_hash) values ('u@example.com','U','x')");
    await assert.rejects(pool.query("insert into users (email, name, password_hash) values ('u@example.com','U2','x')"));
  });

  it("delete an account's data with the account", async () => {
    const u = (await pool.query("insert into users (email, name, password_hash) values ('c@example.com','C','x') returning id")).rows[0].id;
    await pool.query("insert into items (user_id, name, bought_at) values ($1,'x','2026-01-01')", [u]);
    await pool.query("delete from users where id=$1", [u]);
    assert.equal((await pool.query("select count(*)::int as n from items where user_id=$1", [u])).rows[0].n, 0);
  });
});
