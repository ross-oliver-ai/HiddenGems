import { and, count, desc, eq, ilike, inArray, or, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "@/db";
import { categories, items, platforms, shops, type ItemStatus } from "@/db/schema";
import type { ItemOrder } from "@/lib/items";

export type ItemListInput = {
  userId: number;
  statuses: ItemStatus[] | null;
  term: string;
  show: number;
  /** Defaults to newest added first */
  order?: ItemOrder;
  /** Only items the AI filled in after saving that haven't been checked yet */
  check?: boolean;
};

/** The ORDER BY for each ordering. Dates that are missing go last, and ties fall back to newest added so the order is always stable. */
function orderBy(order: ItemOrder): SQL[] {
  const tail = [desc(items.createdAt), desc(items.id)];
  switch (order) {
    case "sold": return [sql`${items.soldAt} desc nulls last`, ...tail];
    case "listed": return [sql`${items.listedAt} asc nulls last`, ...tail];
    case "waiting": return [sql`${items.postedAt} asc nulls last`, ...tail];
    default: return tail;
  }
}

/** The first `show` items (in the chosen order) matching the filter and search, plus how many match in total (so the page can say "Showing 50 of 212") */
export async function itemList({ userId, statuses, term, show, order = "newest", check = false }: ItemListInput) {
  const conds: SQL[] = [eq(items.userId, userId)];
  if (statuses) conds.push(inArray(items.status, statuses));
  if (check) conds.push(eq(items.aiCheck, true));
  if (term) {
    const like = `%${term.replace(/[%_\\]/g, "\\$&")}%`;
    conds.push(or(ilike(items.name, like), ilike(items.brand, like), ilike(shops.name, like))!);
  }
  const where = and(...conds);
  const soldPlatform = alias(platforms, "sold_platform");

  const [rows, [{ total }]] = await Promise.all([
    db
      .select({ item: items, shop: shops.name, category: categories.name, soldOn: soldPlatform.name })
      .from(items)
      .leftJoin(soldPlatform, eq(items.soldPlatformId, soldPlatform.id))
      .leftJoin(shops, eq(items.shopId, shops.id))
      .leftJoin(categories, eq(items.categoryId, categories.id))
      .where(where)
      .orderBy(...orderBy(order))
      .limit(show),
    db.select({ total: count() }).from(items).leftJoin(shops, eq(items.shopId, shops.id)).where(where),
  ]);
  return { rows, total };
}

/** How many items are waiting on a "Check details" (the AI filled them in after saving and they haven't been checked). */
export async function checkCount(userId: number): Promise<number> {
  const [{ n }] = await db.select({ n: count() }).from(items).where(and(eq(items.userId, userId), eq(items.aiCheck, true)));
  return n;
}
