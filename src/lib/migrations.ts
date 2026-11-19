import { readFileSync } from "node:fs";
import path from "node:path";
import { sql } from "drizzle-orm";
import { db } from "@/db";

/** How many database updates (migrations) haven't been applied yet. Null if it can't tell. */
export async function pendingMigrations(): Promise<number | null> {
  try {
    const journal = JSON.parse(readFileSync(path.join(process.cwd(), "drizzle", "meta", "_journal.json"), "utf8")) as {
      entries: unknown[];
    };
    let applied = 0;
    try {
      const res = await db.execute(sql`select count(*)::int as n from drizzle.__drizzle_migrations`);
      applied = Number((res.rows[0] as { n: number }).n);
    } catch {
      applied = 0; // never migrated
    }
    return Math.max(0, journal.entries.length - applied);
  } catch {
    return null;
  }
}
