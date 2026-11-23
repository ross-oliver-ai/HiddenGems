import { and, count, desc, eq, exists, isNotNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { items, listings, users, type User } from "@/db/schema";
import { entitlement } from "@/lib/billing";
import type { ChecklistFacts } from "@/lib/checklist-steps";

/** Is the first-run checklist something to show this person at all? New accounts that haven't hidden it and can still add things. */
export function checklistAvailable(user: User, enforced?: boolean): boolean {
  return !user.checklistHidden && entitlement(user, new Date(), enforced).canWrite;
}

/** Everything the checklist needs, worked out from the account's own data (nothing extra is tracked except "fees reviewed"). */
export async function checklistFacts(user: User): Promise<ChecklistFacts> {
  const [{ n: itemCount }] = await db.select({ n: count() }).from(items).where(eq(items.userId, user.id));
  const [{ yes: hasListing }] = await db
    .select({ yes: exists(db.select({ x: sql`1` }).from(listings).innerJoin(items, eq(items.id, listings.itemId)).where(eq(items.userId, user.id))) })
    .from(sql`(select 1) as one`);
  const [{ yes: hasSale }] = await db
    .select({ yes: exists(db.select({ x: sql`1` }).from(items).where(and(eq(items.userId, user.id), isNotNull(items.soldAt)))) })
    .from(sql`(select 1) as one`);
  const newest = async (status: "bought" | "listed") =>
    (await db.select({ id: items.id }).from(items).where(and(eq(items.userId, user.id), eq(items.status, status))).orderBy(desc(items.createdAt), desc(items.id)).limit(1))[0]?.id ?? null;
  return {
    feesReviewed: user.feesReviewedAt !== null,
    itemCount,
    hasListing: !!hasListing,
    hasSale: !!hasSale,
    toListItemId: await newest("bought"),
    listedItemId: await newest("listed"),
  };
}

export async function hideChecklist(userId: number): Promise<void> {
  await db.update(users).set({ checklistHidden: true }).where(eq(users.id, userId));
}

/** Called whenever the selling-fees form is saved. Saving with every fee at 0 still counts: some platforms don't charge sellers. */
export async function markFeesReviewed(userId: number): Promise<void> {
  await db.update(users).set({ feesReviewedAt: sql`coalesce(${users.feesReviewedAt}, now())` }).where(eq(users.id, userId));
}
