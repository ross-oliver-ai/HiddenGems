import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { items, shops } from "@/db/schema";

/** The place the newest item came from, to pre-fill the add-item form. Hidden (archived) places are skipped, so it never pre-fills one you have put away. */
export async function lastShopName(userId: number): Promise<string> {
  const [row] = await db
    .select({ name: shops.name })
    .from(items)
    .innerJoin(shops, eq(items.shopId, shops.id))
    .where(and(eq(items.userId, userId), eq(shops.archived, false)))
    .orderBy(desc(items.createdAt), desc(items.id))
    .limit(1);
  return row?.name ?? "";
}
