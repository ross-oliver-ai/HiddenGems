import { asc, desc, eq } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { strToU8, zipSync } from "fflate";
import { db } from "@/db";
import { categories, items, listings, platforms, postalServices, priceChanges, shops, type User } from "@/db/schema";
import { HANDOVER_LABEL } from "./listing-labels";
import { itemProfit } from "./items";

// Spreadsheet apps run text starting with = + - @ as formulas, so prefix those with an apostrophe
export const csvCell = (v: string | number | null | undefined) => {
  let s = v === null || v === undefined ? "" : String(v);
  if (/^[=+\-@\t\r]/.test(s) && Number.isNaN(Number(s))) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

const csv = (head: string[], rows: (string | number | null | undefined)[][]) =>
  [head, ...rows].map((r) => r.map(csvCell).join(",")).join("\r\n");

/** Excel needs a byte-order mark to read £ and accents correctly */
export const withBom = (text: string) => "﻿" + text;

/** Every item with its sale, fees, postage and profit, one row each. This is the Reports download. */
export async function itemsCsv(userId: number): Promise<string> {
  const soldPlatform = alias(platforms, "sold_platform");
  const rows = await db
    .select({ item: items, shop: shops.name, category: categories.name, postal: postalServices.name, soldOn: soldPlatform.name })
    .from(items)
    .leftJoin(soldPlatform, eq(items.soldPlatformId, soldPlatform.id))
    .leftJoin(shops, eq(items.shopId, shops.id))
    .leftJoin(categories, eq(items.categoryId, categories.id))
    .leftJoin(postalServices, eq(items.postalServiceId, postalServices.id))
    .where(eq(items.userId, userId))
    .orderBy(desc(items.boughtAt), desc(items.id));

  // Links from every listing of each item (several platforms are joined with " | "); older items fall back to the stored link
  const links = new Map<number, string[]>();
  for (const l of await db
    .select({ itemId: listings.itemId, url: listings.url })
    .from(listings)
    .innerJoin(items, eq(listings.itemId, items.id))
    .where(eq(items.userId, userId))
    .orderBy(asc(listings.id))) {
    if (l.url) links.set(l.itemId, [...(links.get(l.itemId) ?? []), l.url]);
  }

  const head = [
    "Item", "Status", "Brand", "Size", "Condition", "Category", "Where from", "Date bought", "Paid",
    "Date listed", "Asking price", "Date sold", "Sold for", "Sold on", "How it got there", "Postage service", "Date posted",
    "Date returned", "Refund", "Fees", "Postage paid", "Profit", "Notes", "Listing link",
  ];
  return csv(
    head,
    rows.map(({ item: i, shop, category, postal, soldOn }) => {
      const profit = itemProfit(i);
      return [
        i.name, i.status, i.brand, i.size, i.condition, category, shop, i.boughtAt, i.buyPrice,
        i.listedAt, i.listPrice, i.soldAt, i.soldPrice, soldOn, i.handover ? HANDOVER_LABEL[i.handover] : "", postal, i.postedAt,
        i.returnedAt, i.refundAmount, i.fees, i.postagePaid, profit === null ? "" : profit.toFixed(2), i.notes, (links.get(i.id) ?? (i.vintedUrl ? [i.vintedUrl] : [])).join(" | "),
      ];
    }),
  );
}

const README = `Your Hidden Gems data
=====================

This download holds everything you have entered in Hidden Gems, as spreadsheet (CSV) files that open in Excel, Numbers or Google Sheets.

items.csv        Every item: what you paid, what it sold for, fees, postage, refund, dates, status and profit.
listings.csv     Each place an item was listed, with its price, dates and link.
price-drops.csv  Each time you reduced an asking price.
photos.csv       A link to each item's photo. Photos are not inside this file; the links work until you delete your account or the item.
settings.csv     Your account details, goals, platforms and their fees, postal services, where-from places and categories.

Your photos are stored at web addresses that can't be guessed. Anyone who has a link can open that photo, so don't share these links.
`;

/** All the files in the full download, as text, keyed by file name. */
export async function exportFiles(user: User): Promise<Record<string, string>> {
  const soldItems = await db.select({ id: items.id, name: items.name, photoUrl: items.photoUrl }).from(items).where(eq(items.userId, user.id)).orderBy(asc(items.id));
  const nameOf = new Map(soldItems.map((i) => [i.id, i.name]));

  const listingRows = await db
    .select({ itemId: listings.itemId, platform: platforms.name, price: listings.price, listedAt: listings.listedAt, endedAt: listings.endedAt, url: listings.url })
    .from(listings)
    .innerJoin(items, eq(listings.itemId, items.id))
    .innerJoin(platforms, eq(listings.platformId, platforms.id))
    .where(eq(items.userId, user.id))
    .orderBy(asc(listings.id));

  const dropRows = await db
    .select({ itemId: priceChanges.itemId, changedAt: priceChanges.changedAt, oldPrice: priceChanges.oldPrice, newPrice: priceChanges.newPrice })
    .from(priceChanges)
    .innerJoin(items, eq(priceChanges.itemId, items.id))
    .where(eq(items.userId, user.id))
    .orderBy(asc(priceChanges.id));

  const lists = async (table: typeof shops | typeof categories | typeof postalServices | typeof platforms, type: string) =>
    (await db.select().from(table).where(eq(table.userId, user.id)).orderBy(asc(table.id))).map(
      (r) => [type, r.name, [r.archived ? "Hidden" : "", "feePercent" in r ? `Fee ${r.feePercent}%` : ""].filter(Boolean).join(", ")] as const,
    );

  const settings: (readonly [string, string, string])[] = [
    ["Account", "Name", user.name],
    ["Account", "Email", user.email],
    ["Account", "Joined", user.createdAt.toISOString().slice(0, 10)],
    ["Setting", "Monthly profit goal", user.monthlyProfitGoal ?? ""],
    ["Setting", "Stale after (days)", String(user.staleAfterDays)],
    ...(await lists(platforms, "Platform")),
    ...(await lists(postalServices, "Postal service")),
    ...(await lists(shops, "Where from")),
    ...(await lists(categories, "Category")),
  ];

  return {
    "README.txt": README,
    "items.csv": withBom(await itemsCsv(user.id)),
    "listings.csv": withBom(
      csv(["Item", "Platform", "Price", "Listed", "Ended", "Link"], listingRows.map((l) => [nameOf.get(l.itemId), l.platform, l.price, l.listedAt, l.endedAt, l.url])),
    ),
    "price-drops.csv": withBom(csv(["Item", "Date", "Old price", "New price"], dropRows.map((d) => [nameOf.get(d.itemId), d.changedAt, d.oldPrice, d.newPrice]))),
    "photos.csv": withBom(csv(["Item", "Photo link"], soldItems.filter((i) => i.photoUrl).map((i) => [i.name, i.photoUrl]))),
    "settings.csv": withBom(csv(["Type", "Name", "Detail"], settings.map((s) => [...s]))),
  };
}

/** The full download as one zip file */
export async function exportZip(user: User): Promise<Uint8Array> {
  const files = await exportFiles(user);
  return zipSync(Object.fromEntries(Object.entries(files).map(([name, text]) => [name, strToU8(text)])));
}
