// The "To send" view: everything sold but not yet posted or handed over, grouped the way a seller works through it.
import { and, asc, eq, ilike, or, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "@/db";
import { items, platforms, postalServices, shops } from "@/db/schema";
import { daysBetween } from "./format";
import { groupToSend, type SendGroup } from "./send-groups";

export type { SendGroup, SendRow } from "./send-groups";

export async function toSendGroups(userId: number, today: string, term = ""): Promise<SendGroup[]> {
  const soldPlatform = alias(platforms, "sold_platform");
  const conds: SQL[] = [eq(items.userId, userId), eq(items.status, "sold")];
  if (term) {
    const like = `%${term.replace(/[%_\\]/g, "\\$&")}%`;
    conds.push(or(ilike(items.name, like), ilike(items.brand, like), ilike(shops.name, like))!);
  }
  const rows = await db
    .select({
      id: items.id,
      name: items.name,
      photoUrl: items.photoUrl,
      soldAt: items.soldAt,
      soldOn: soldPlatform.name,
      handover: items.handover,
      postalId: items.postalServiceId,
      postalName: postalServices.name,
    })
    .from(items)
    .leftJoin(soldPlatform, eq(items.soldPlatformId, soldPlatform.id))
    .leftJoin(postalServices, eq(items.postalServiceId, postalServices.id))
    .leftJoin(shops, eq(items.shopId, shops.id))
    .where(and(...conds))
    .orderBy(asc(items.soldAt), asc(items.id));

  return groupToSend(
    rows.map((r) => {
      const soldAt = r.soldAt ?? today;
      return { ...r, soldAt, daysAgo: Math.max(0, daysBetween(soldAt, today)) };
    }),
  );
}
