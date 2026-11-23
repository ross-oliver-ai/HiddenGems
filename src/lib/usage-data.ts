import { count, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { items, users, waitlist } from "@/db/schema";
import { addDays } from "./periods";
import { todayLondon } from "./format";
import type { UserActivity } from "./usage";

/** One row per person who has any items: how many, when one was last added or changed, and sales in the last 30 days. */
export async function loadActivity(): Promise<Map<number, UserActivity>> {
  const since = addDays(todayLondon(), -30);
  const rows = await db
    .select({
      userId: items.userId,
      items: count(),
      lastActive: sql`max(${items.updatedAt})`.mapWith(items.updatedAt),
      sales30: sql<number>`count(*) filter (where ${items.soldAt} >= ${since})`.mapWith(Number),
    })
    .from(items)
    .groupBy(items.userId);
  return new Map(rows.map((r) => [r.userId, { items: Number(r.items), lastActive: r.lastActive ?? null, sales30: r.sales30 }]));
}

export async function loadUsers() {
  return db.select().from(users);
}

/** People on the waitlist who haven't been invited yet; null when the waitlist table doesn't exist yet */
export async function waitingCount(): Promise<number | null> {
  try {
    const [r] = await db.select({ n: count() }).from(waitlist).where(isNull(waitlist.invitedAt));
    return Number(r.n);
  } catch {
    return null;
  }
}
