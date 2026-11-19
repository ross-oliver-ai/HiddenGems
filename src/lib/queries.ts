import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { items, shops } from "@/db/schema";

/** Last shop used, to pre-fill the add-item form. */
export async function lastShopName(userId: number): Promise<string> {
  const [row] = await db
    .select({ name: shops.name })
    .from(items)
    .innerJoin(shops, eq(items.shopId, shops.id))
    .where(eq(items.userId, userId))
    .orderBy(desc(items.createdAt))
    .limit(1);
  return row?.name ?? "";
}
