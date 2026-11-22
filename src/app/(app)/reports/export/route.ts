import { asc, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { categories, items, listings, platforms, postalServices, shops } from "@/db/schema";
import { HANDOVER_LABEL } from "@/lib/listing-labels";
import { alias } from "drizzle-orm/pg-core";
import { getCurrentUser } from "@/lib/auth";
import { itemProfit } from "@/lib/items";

// Spreadsheet apps run text starting with = + - @ as formulas, so prefix those with an apostrophe
const cell = (v: string | number | null | undefined) => {
  let s = v === null || v === undefined ? "" : String(v);
  if (/^[=+\-@\t\r]/.test(s) && Number.isNaN(Number(s))) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export async function GET() {
  const user = await getCurrentUser();
  if (!user || user.mustChangePassword) return new Response("Not signed in", { status: 401 });

  const soldPlatform = alias(platforms, "sold_platform");
  const rows = await db
    .select({ item: items, shop: shops.name, category: categories.name, postal: postalServices.name, soldOn: soldPlatform.name })
    .from(items)
    .leftJoin(soldPlatform, eq(items.soldPlatformId, soldPlatform.id))
    .leftJoin(shops, eq(items.shopId, shops.id))
    .leftJoin(categories, eq(items.categoryId, categories.id))
    .leftJoin(postalServices, eq(items.postalServiceId, postalServices.id))
    .where(eq(items.userId, user.id))
    .orderBy(desc(items.boughtAt), desc(items.id));

  // Links from every listing of each item (several platforms are joined with " | "); older items fall back to the stored link
  const links = new Map<number, string[]>();
  for (const l of await db
    .select({ itemId: listings.itemId, url: listings.url })
    .from(listings)
    .innerJoin(items, eq(listings.itemId, items.id))
    .where(eq(items.userId, user.id))
    .orderBy(asc(listings.id))) {
    if (l.url) links.set(l.itemId, [...(links.get(l.itemId) ?? []), l.url]);
  }

  const head = [
    "Item", "Status", "Brand", "Size", "Condition", "Category", "Charity shop", "Date bought", "Paid",
    "Date listed", "Asking price", "Date sold", "Sold for", "Sold on", "How it got there", "Postage service", "Date posted",
    "Date returned", "Refund", "Fees", "Postage paid", "Profit", "Notes", "Listing link",
  ];
  const lines = [head.map(cell).join(",")];
  for (const { item: i, shop, category, postal, soldOn } of rows) {
    const profit = itemProfit(i);
    lines.push(
      [
        i.name, i.status, i.brand, i.size, i.condition, category, shop, i.boughtAt, i.buyPrice,
        i.listedAt, i.listPrice, i.soldAt, i.soldPrice, soldOn, i.handover ? HANDOVER_LABEL[i.handover] : "", postal, i.postedAt,
        i.returnedAt, i.refundAmount, i.fees, i.postagePaid, profit === null ? "" : profit.toFixed(2), i.notes, (links.get(i.id) ?? (i.vintedUrl ? [i.vintedUrl] : [])).join(" | "),
      ].map(cell).join(","),
    );
  }

  const stamp = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London" }).format(new Date());
  return new Response("﻿" + lines.join("\r\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="hidden-gems-${stamp}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
