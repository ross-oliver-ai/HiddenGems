// Helpers for tests that need a real (throwaway) Postgres database.
//
// SAFETY: these tests wipe the whole database they connect to. They only ever read TEST_DATABASE_URL
// (never DATABASE_URL) and refuse to run unless the database name contains "test".
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { readdirSync, readFileSync } from "node:fs";

export const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;

/** Use as: describe("...", { skip: dbSkipReason }, () => ...) so the file is skipped (loudly) when no test database is configured. */
export const dbSkipReason: string | false = TEST_DATABASE_URL ? false : "TEST_DATABASE_URL is not set (see README: Tests)";

export function assertSafeTestUrl(url: string): void {
  const name = decodeURIComponent(new URL(url).pathname.replace(/^\//, ""));
  if (!/test/i.test(name)) {
    throw new Error(`Refusing to run: the database name "${name}" doesn't contain "test". These tests wipe the database.`);
  }
}

/** Empties the test database and applies every migration from scratch, exactly as a production deploy would. */
export async function resetAndMigrate(url: string): Promise<void> {
  assertSafeTestUrl(url);
  const pool = new Pool({ connectionString: url, max: 1 });
  try {
    await pool.query("drop schema if exists public cascade");
    await pool.query("drop schema if exists drizzle cascade");
    await pool.query("create schema public");
    await migrate(drizzle(pool), { migrationsFolder: "./drizzle" });
  } finally {
    await pool.end();
  }
}

/** Points the app's own database module at the test database. Call before importing "@/db". */
export function pointAppAtTestDatabase(): string {
  if (!TEST_DATABASE_URL) throw new Error("TEST_DATABASE_URL is not set");
  assertSafeTestUrl(TEST_DATABASE_URL);
  process.env.DATABASE_URL = TEST_DATABASE_URL;
  return TEST_DATABASE_URL;
}

/** Applies migration files by number (inclusive range) straight from the drizzle folder, so a test can stop part-way and
 *  put realistic "old" data in place before the next migration runs. Only for tests. */
export async function applyMigrationFiles(url: string, from: number, to: number): Promise<void> {
  assertSafeTestUrl(url);
  const files = readdirSync("./drizzle").filter((f) => /^\d{4}_.*\.sql$/.test(f)).sort();
  const pool = new Pool({ connectionString: url, max: 1 });
  try {
    for (const f of files) {
      const n = Number(f.slice(0, 4));
      if (n < from || n > to) continue;
      for (const stmt of readFileSync(`./drizzle/${f}`, "utf8").split("--> statement-breakpoint")) {
        if (stmt.trim()) await pool.query(stmt);
      }
    }
  } finally {
    await pool.end();
  }
}

/** Empties the test database without migrating (for tests that apply migrations themselves). */
export async function resetEmpty(url: string): Promise<void> {
  assertSafeTestUrl(url);
  const pool = new Pool({ connectionString: url, max: 1 });
  try {
    await pool.query("drop schema if exists public cascade");
    await pool.query("drop schema if exists drizzle cascade");
    await pool.query("create schema public");
  } finally {
    await pool.end();
  }
}
