"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq, sql } from "drizzle-orm";
import { del } from "@vercel/blob";
import { db } from "@/db";
import { items, platforms, shops } from "@/db/schema";
import { requireWritableUser } from "@/lib/auth";
import { parseMoney, parseOptionalMoney, todayLondon } from "@/lib/format";
import { CONDITIONS } from "@/lib/items";
import { cleanUrl, editListings, isHandover, type ListingEdit } from "@/lib/listings";

export type ItemState = { error?: string };

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const str = (v: FormDataEntryValue | null, max = 200) => {
  const s = String(v ?? "").trim().slice(0, max);
  return s || null;
};
const date = (v: FormDataEntryValue | null) => {
  const s = String(v ?? "").trim();
  return DATE_RE.test(s) && !Number.isNaN(Date.parse(s)) ? s : null;
};

async function shopIdFor(userId: number, name: string | null): Promise<number | null> {
  if (!name) return null;
  const [found] = await db
    .select({ id: shops.id, archived: shops.archived })
    .from(shops)
    .where(and(eq(shops.userId, userId), sql`lower(${shops.name}) = lower(${name})`))
    .limit(1);
  if (found) {
    if (found.archived) await db.update(shops).set({ archived: false }).where(eq(shops.id, found.id));
    return found.id;
  }
  const [created] = await db.insert(shops).values({ userId: userId, name }).returning({ id: shops.id });
  return created.id;
}

function safePhoto(v: FormDataEntryValue | null): string | null {
  const s = String(v ?? "").trim();
  return /^https:\/\/[a-z0-9.-]+\.public\.blob\.vercel-storage\.com\//i.test(s) ? s : null;
}

async function removeBlob(url: string | null | undefined) {
  if (!url || (!process.env.BLOB_READ_WRITE_TOKEN && !process.env.BLOB_STORE_ID)) return;
  try {
    await del(url);
  } catch {
    /* best effort */
  }
}

export async function createItemAction(_prev: ItemState, formData: FormData): Promise<ItemState> {
  const user = await requireWritableUser();
  const name = str(formData.get("name"), 120);
  const buyPrice = parseMoney(formData.get("buyPrice"));
  const boughtAt = date(formData.get("boughtAt"));
  if (!name) return { error: "Give the item a name." };
  if (buyPrice === null) return { error: "Enter what you paid (0 if it was free)." };
  if (!boughtAt) return { error: "Choose the date you bought it." };
  if (boughtAt > todayLondon()) return { error: "The buy date can't be in the future." };

  const condition = str(formData.get("condition"));
  const categoryId = Number(formData.get("categoryId")) || null;

  const [created] = await db
    .insert(items)
    .values({
      userId: user.id,
      name,
      buyPrice,
      boughtAt,
      shopId: await shopIdFor(user.id, str(formData.get("shop"), 60)),
      categoryId,
      brand: str(formData.get("brand"), 60),
      size: str(formData.get("size"), 30),
      condition: condition && CONDITIONS.includes(condition) ? condition : null,
      notes: str(formData.get("notes"), 500),
      photoUrl: safePhoto(formData.get("photoUrl")),
      status: "bought",
    })
    .returning({ id: items.id });

  revalidatePath("/items");
  revalidatePath("/");
  if (formData.get("again")) redirect("/items/new?added=1");
  redirect(`/items/${created.id}`);
}

export async function updateItemAction(_prev: ItemState, formData: FormData): Promise<ItemState> {
  const user = await requireWritableUser();
  const id = Number(formData.get("id"));
  const [item] = await db.select().from(items).where(and(eq(items.id, id), eq(items.userId, user.id))).limit(1);
  if (!item) return { error: "Item not found." };

  const name = str(formData.get("name"), 120);
  const buyPrice = parseMoney(formData.get("buyPrice"));
  const boughtAt = date(formData.get("boughtAt"));
  if (!name) return { error: "Give the item a name." };
  if (buyPrice === null) return { error: "Enter what you paid." };
  if (!boughtAt) return { error: "Choose the date you bought it." };

  const condition = str(formData.get("condition"));
  const patch: Partial<typeof items.$inferInsert> = {
    name,
    buyPrice,
    boughtAt,
    shopId: await shopIdFor(user.id, str(formData.get("shop"), 60)),
    categoryId: Number(formData.get("categoryId")) || null,
    brand: str(formData.get("brand"), 60),
    size: str(formData.get("size"), 30),
    condition: condition && CONDITIONS.includes(condition) ? condition : null,
    notes: str(formData.get("notes"), 500),
    photoUrl: safePhoto(formData.get("photoUrl")),
    updatedAt: new Date(),
  };

  // Stage-specific fields are only present on the form when the item has reached that stage
  const listingIds = formData.getAll("listingIds").map(Number).filter((n) => Number.isInteger(n) && n > 0);
  const edits: ListingEdit[] = [];
  for (const lid of listingIds) {
    const url = cleanUrl(formData.get(`listing_${lid}_url`));
    if (url === undefined) return { error: "Listing links must start with http:// or https://" };
    edits.push({ listingId: lid, price: parseMoney(formData.get(`listing_${lid}_price`)), url, listedAt: date(formData.get(`listing_${lid}_date`)) });
  }
  if (formData.has("soldAt")) {
    const soldAt = date(formData.get("soldAt"));
    const soldPrice = parseMoney(formData.get("soldPrice"));
    if (!soldAt || soldPrice === null) return { error: "Check the sold date and price." };
    const fees = parseOptionalMoney(formData.get("fees"));
    const postagePaid = parseOptionalMoney(formData.get("postagePaid"));
    if (fees === null || postagePaid === null) return { error: "Check the fees and postage amounts (numbers only, or leave blank)." };
    patch.soldAt = soldAt;
    patch.soldPrice = soldPrice;
    patch.fees = fees;
    patch.postagePaid = postagePaid;

    const platformId = Number(formData.get("soldPlatformId")) || null;
    if (platformId) {
      const [own] = await db.select({ id: platforms.id }).from(platforms).where(and(eq(platforms.id, platformId), eq(platforms.userId, user.id))).limit(1);
      if (!own) return { error: "Unknown platform." };
    }
    patch.soldPlatformId = platformId;

    const handoverRaw = formData.get("handover");
    const handover = isHandover(handoverRaw) ? handoverRaw : null;
    patch.handover = handover;
    // Postage only applies to posted items
    patch.postalServiceId = handover === "posted" || handover === null ? Number(formData.get("postalServiceId")) || null : null;
  }
  if (formData.has("postedAt")) patch.postedAt = date(formData.get("postedAt"));

  if (edits.length) {
    const r = await editListings(user.id, id, edits);
    if ("error" in r) return { error: r.error };
  }
  await db.update(items).set(patch).where(eq(items.id, id));
  if (item.photoUrl && item.photoUrl !== patch.photoUrl) await removeBlob(item.photoUrl);

  revalidatePath("/items");
  revalidatePath(`/items/${id}`);
  revalidatePath("/");
  redirect(`/items/${id}`);
}

export async function deleteItemAction(formData: FormData) {
  const user = await requireWritableUser();
  const id = Number(formData.get("id"));
  const [item] = await db.select().from(items).where(and(eq(items.id, id), eq(items.userId, user.id))).limit(1);
  if (!item) redirect("/items");
  await db.delete(items).where(eq(items.id, id));
  await removeBlob(item.photoUrl);
  revalidatePath("/items");
  revalidatePath("/");
  redirect("/items");
}
