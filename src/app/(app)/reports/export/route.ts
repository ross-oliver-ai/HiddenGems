import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { categories, items, postalServices, shops } from "@/db/schema";
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

  const rows = await db
    .select({ item: items, shop: shops.name, category: categories.name, postal: postalServices.name })
    .from(items)
    .leftJoin(shops, eq(items.shopId, shops.id))
    .leftJoin(categories, eq(items.categoryId, categories.id))
    .leftJoin(postalServices, eq(items.postalServiceId, postalServices.id))
    .where(eq(items.userId, user.id))
    .orderBy(desc(items.boughtAt), desc(items.id));

  const head = [
    "Item", "Status", "Brand", "Size", "Condition", "Category", "Charity shop", "Date bought", "Paid",
    "Date listed", "Asking price", "Date sold", "Sold for", "Postage service", "Date posted",
    "Date returned", "Refund", "Profit", "Notes", "Listing link",
  ];
  const lines = [head.map(cell).join(",")];
  for (const { item: i, shop, category, postal } of rows) {
    const profit = itemProfit(i);
    lines.push(
      [
        i.name, i.status, i.brand, i.size, i.condition, category, shop, i.boughtAt, i.buyPrice,
        i.listedAt, i.listPrice, i.soldAt, i.soldPrice, postal, i.postedAt,
        i.returnedAt, i.refundAmount, profit === null ? "" : profit.toFixed(2), i.notes, i.vintedUrl,
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
