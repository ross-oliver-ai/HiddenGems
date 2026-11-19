"use server";

import path from "node:path";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { requireAdmin } from "@/lib/auth";

export type DbUpdateState = { ok?: boolean; message?: string };

/** Admin only: apply any database updates (migrations) that haven't been run yet. Safe to tap more than once. */
export async function updateDatabaseAction(): Promise<DbUpdateState> {
  await requireAdmin();
  try {
    await migrate(db, { migrationsFolder: path.join(process.cwd(), "drizzle") });
  } catch (e) {
    console.error("Database update failed", e);
    return { ok: false, message: "The update didn't work. Check the Vercel logs, and that DATABASE_URL is right." };
  }
  revalidatePath("/settings");
  revalidatePath("/admin/waitlist");
  return { ok: true, message: "Database is up to date." };
}
