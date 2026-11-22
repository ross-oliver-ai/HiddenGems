// All the rules for listing an item on platforms, changing prices, taking it off, selling it and handing it over.
// The page actions only check who is signed in and read the form; everything that changes data lives here so it can be tested.
import { and, asc, desc, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@/db";
import { items, listings, platforms, postalServices, priceChanges, type Item, type ItemStatus } from "@/db/schema";
import { isHandover } from "./listing-labels";

export { HANDOVER_LABEL, HANDOVERS, isHandover } from "./listing-labels";

export type Result = { error: string } | { ok: true };
const fail = (error: string): Result => ({ error });

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Q = typeof db | Tx;

// ---------- Reading ----------

/** The platforms someone can currently choose (hidden ones excluded), in the order they were added. */
export async function activePlatforms(userId: number, q: Q = db) {
  return q.select({ id: platforms.id, name: platforms.name }).from(platforms).where(and(eq(platforms.userId, userId), eq(platforms.archived, false))).orderBy(asc(platforms.id));
}

export async function listingsFor(itemId: number, q: Q = db) {
  return q
    .select({ listing: listings, platform: platforms.name })
    .from(listings)
    .innerJoin(platforms, eq(listings.platformId, platforms.id))
    .where(eq(listings.itemId, itemId))
    .orderBy(asc(listings.id));
}

/** Platforms used on the most recent item that was listed, to pre-select when listing the next one. */
export async function lastUsedPlatformIds(userId: number): Promise<number[]> {
  const [last] = await db
    .select({ itemId: listings.itemId })
    .from(listings)
    .innerJoin(items, eq(listings.itemId, items.id))
    .where(eq(items.userId, userId))
    .orderBy(desc(listings.createdAt), desc(listings.id))
    .limit(1);
  if (!last) return [];
  const rows = await db.select({ platformId: listings.platformId }).from(listings).where(eq(listings.itemId, last.itemId));
  return rows.map((r) => r.platformId);
}

// ---------- Reading form data ----------

export type ListEntry = { platformId: number; price: string | null; url: string | null };

/** Links must be web addresses (they are shown as tappable links). Returns undefined if invalid. */
export function cleanUrl(raw: FormDataEntryValue | null): string | null | undefined {
  const s = String(raw ?? "").trim();
  if (!s) return null;
  return /^https?:\/\/\S+$/i.test(s) && s.length <= 300 ? s : undefined;
}

/** Reads the "list it" fields: platformId (repeated), price_<platformId>, url_<platformId>. */
export function parseListEntries(formData: FormData, parseMoney: (v: FormDataEntryValue | null) => string | null): ListEntry[] | { error: string } {
  const ids = [...new Set(formData.getAll("platformId").map(Number).filter((n) => Number.isInteger(n) && n > 0))];
  if (ids.length === 0) return { error: "Choose at least one platform." };
  const out: ListEntry[] = [];
  for (const platformId of ids) {
    const url = cleanUrl(formData.get(`url_${platformId}`));
    if (url === undefined) return { error: "Links must start with http:// or https://" };
    out.push({ platformId, price: parseMoney(formData.get(`price_${platformId}`)), url });
  }
  return out;
}

// ---------- Helpers that keep the item in step with its listings ----------

/** items.listedAt / listPrice summarise the live listings: earliest listing date, and the first listing's price. */
export async function syncItemFromListings(q: Q, itemId: number): Promise<void> {
  const live = await q.select().from(listings).where(and(eq(listings.itemId, itemId), isNull(listings.endedAt))).orderBy(asc(listings.id));
  if (live.length === 0) return;
  const earliest = live.reduce((m, l) => (l.listedAt < m ? l.listedAt : m), live[0].listedAt);
  await q.update(items).set({ listedAt: earliest, listPrice: live[0].price, updatedAt: new Date() }).where(eq(items.id, itemId));
}

async function endAllLive(q: Q, itemId: number, when: string) {
  await q.update(listings).set({ endedAt: when }).where(and(eq(listings.itemId, itemId), isNull(listings.endedAt)));
}

async function loadItem(q: Q, userId: number, itemId: number): Promise<Item | null> {
  const [item] = await q.select().from(items).where(and(eq(items.id, itemId), eq(items.userId, userId))).limit(1);
  return item ?? null;
}

async function checkEntries(q: Q, userId: number, entries: ListEntry[]): Promise<Result & { names?: Map<number, string> }> {
  if (entries.length === 0) return fail("Choose at least one platform.");
  const rows = await q.select({ id: platforms.id, name: platforms.name, userId: platforms.userId }).from(platforms).where(inArray(platforms.id, entries.map((e) => e.platformId)));
  const names = new Map(rows.filter((r) => r.userId === userId).map((r) => [r.id, r.name]));
  for (const e of entries) {
    const name = names.get(e.platformId);
    if (!name) return fail("Unknown platform.");
    if (e.price === null) return fail(`Enter the asking price for ${name}.`);
  }
  return { ok: true, names };
}

// ---------- Listing ----------

/**
 * list:   a to-list item goes live on one or more platforms
 * more:   an already-listed item is also listed on further platforms
 * relist: a returned item goes live again (its sale details are cleared)
 */
export async function listOn(userId: number, itemId: number, entries: ListEntry[], when: string, mode: "list" | "more" | "relist"): Promise<Result> {
  return db.transaction(async (tx) => {
    const item = await loadItem(tx, userId, itemId);
    if (!item) return fail("Item not found.");
    const needs: ItemStatus = mode === "list" ? "bought" : mode === "more" ? "listed" : "returned";
    if (item.status !== needs) return fail("That step isn't available for this item any more. Refresh the page.");
    if (when < item.boughtAt) return fail("You can't list it before you bought it.");
    const checked = await checkEntries(tx, userId, entries);
    if ("error" in checked) return checked;

    if (mode === "more") {
      const live = await tx.select({ platformId: listings.platformId }).from(listings).where(and(eq(listings.itemId, itemId), isNull(listings.endedAt)));
      const liveIds = new Set(live.map((l) => l.platformId));
      const dupe = entries.find((e) => liveIds.has(e.platformId));
      if (dupe) return fail(`It's already listed on ${checked.names!.get(dupe.platformId)}.`);
    }

    await tx.insert(listings).values(entries.map((e) => ({ itemId, platformId: e.platformId, price: e.price!, url: e.url, listedAt: when })));
    if (mode === "more") {
      await syncItemFromListings(tx, itemId);
    } else {
      await tx
        .update(items)
        .set({
          status: "listed",
          listedAt: when,
          listPrice: entries[0].price!,
          ...(mode === "relist" ? { soldAt: null, soldPrice: null, postedAt: null, returnedAt: null, refundAmount: null, postalServiceId: null, soldPlatformId: null, handover: null } : {}),
          updatedAt: new Date(),
        })
        .where(eq(items.id, itemId));
    }
    return { ok: true } as Result;
  });
}

/** Changes the asking price on some of an item's live listings. `prices` is keyed by listing id. */
export async function reducePrices(userId: number, itemId: number, prices: Map<number, string | null>, when: string): Promise<Result> {
  return db.transaction(async (tx) => {
    const item = await loadItem(tx, userId, itemId);
    if (!item) return fail("Item not found.");
    if (item.status !== "listed") return fail("That step isn't available for this item any more. Refresh the page.");
    const live = await tx.select().from(listings).where(and(eq(listings.itemId, itemId), isNull(listings.endedAt))).orderBy(asc(listings.id));
    const changes: { listing: (typeof live)[number]; price: string }[] = [];
    for (const l of live) {
      if (!prices.has(l.id)) continue;
      const price = prices.get(l.id);
      if (price === null || price === undefined) return fail("Enter a valid price for each platform.");
      if (price !== l.price) changes.push({ listing: l, price });
    }
    if (changes.length === 0) return fail("No prices have changed.");
    for (const c of changes) {
      await tx.insert(priceChanges).values({ itemId, listingId: c.listing.id, changedAt: when, oldPrice: c.listing.price, newPrice: c.price });
      await tx.update(listings).set({ price: c.price }).where(eq(listings.id, c.listing.id));
    }
    await syncItemFromListings(tx, itemId);
    return { ok: true } as Result;
  });
}

/** Takes the item off one platform. If it was the last live one, the item goes back to "to list". */
export async function endListing(userId: number, itemId: number, listingId: number, when: string): Promise<Result> {
  return db.transaction(async (tx) => {
    const item = await loadItem(tx, userId, itemId);
    if (!item) return fail("Item not found.");
    if (item.status !== "listed") return fail("That step isn't available for this item any more. Refresh the page.");
    const [l] = await tx.select().from(listings).where(and(eq(listings.id, listingId), eq(listings.itemId, itemId), isNull(listings.endedAt))).limit(1);
    if (!l) return fail("That listing isn't live any more. Refresh the page.");
    await tx.update(listings).set({ endedAt: when }).where(eq(listings.id, listingId));
    const stillLive = await tx.select({ id: listings.id }).from(listings).where(and(eq(listings.itemId, itemId), isNull(listings.endedAt)));
    if (stillLive.length === 0) {
      await tx.update(items).set({ status: "bought", listedAt: null, listPrice: null, updatedAt: new Date() }).where(eq(items.id, itemId));
    } else {
      await syncItemFromListings(tx, itemId);
    }
    return { ok: true } as Result;
  });
}

/** Takes the item off every platform (back to "to list"). */
export async function unlistAll(userId: number, itemId: number, when: string): Promise<Result> {
  return db.transaction(async (tx) => {
    const item = await loadItem(tx, userId, itemId);
    if (!item) return fail("Item not found.");
    if (item.status !== "listed") return fail("That step isn't available for this item any more. Refresh the page.");
    await endAllLive(tx, itemId, when);
    await tx.update(items).set({ status: "bought", listedAt: null, listPrice: null, updatedAt: new Date() }).where(eq(items.id, itemId));
    return { ok: true } as Result;
  });
}

/** Gives up on an item (unsold) or gives it back to charity (donated). */
export async function writeOff(userId: number, itemId: number, status: "unsold" | "donated", when: string): Promise<Result> {
  return db.transaction(async (tx) => {
    const item = await loadItem(tx, userId, itemId);
    if (!item) return fail("Item not found.");
    const allowed: ItemStatus[] = status === "unsold" ? ["bought", "listed"] : ["bought", "listed", "unsold"];
    if (!allowed.includes(item.status)) return fail("That step isn't available for this item any more. Refresh the page.");
    await endAllLive(tx, itemId, when);
    await tx.update(items).set({ status, updatedAt: new Date() }).where(eq(items.id, itemId));
    return { ok: true } as Result;
  });
}

// ---------- Selling and handing over ----------

export type SaleInput = {
  platformId: number;
  price: string | null;
  when: string;
  handover: string;
  postalServiceId: number | null;
  /** For collected / delivered items: has it been handed over already? */
  handedOver: boolean;
};

export async function sellItem(userId: number, itemId: number, sale: SaleInput): Promise<Result> {
  return db.transaction(async (tx) => {
    const item = await loadItem(tx, userId, itemId);
    if (!item) return fail("Item not found.");
    if (item.status !== "listed" && item.status !== "bought") return fail("That step isn't available for this item any more. Refresh the page.");
    if (sale.price === null) return fail("Enter what it sold for.");
    if (sale.when < item.boughtAt) return fail("You can't sell it before you bought it.");
    if (!isHandover(sale.handover)) return fail("Choose how it got to the buyer.");

    const [platform] = await tx.select({ id: platforms.id }).from(platforms).where(and(eq(platforms.id, sale.platformId), eq(platforms.userId, userId))).limit(1);
    if (!platform) return fail("Choose which platform it sold on.");

    let postalId: number | null = null;
    if (sale.handover === "posted" && sale.postalServiceId) {
      const [ok] = await tx.select({ id: postalServices.id }).from(postalServices).where(and(eq(postalServices.id, sale.postalServiceId), eq(postalServices.userId, userId)));
      if (!ok) return fail("Unknown postal service.");
      postalId = ok.id;
    }

    const handedOver = sale.handover !== "posted" && sale.handedOver;
    await endAllLive(tx, itemId, sale.when);
    await tx
      .update(items)
      .set({
        status: handedOver ? "completed" : "sold",
        soldAt: sale.when,
        soldPrice: sale.price,
        soldPlatformId: platform.id,
        handover: sale.handover,
        postalServiceId: postalId,
        postedAt: handedOver ? sale.when : null,
        updatedAt: new Date(),
      })
      .where(eq(items.id, itemId));
    return { ok: true } as Result;
  });
}

/** A collected / delivered item has now been handed over: the sale is complete. */
export async function markHandedOver(userId: number, itemId: number, when: string): Promise<Result> {
  const item = await loadItem(db, userId, itemId);
  if (!item) return fail("Item not found.");
  if (item.status !== "sold") return fail("That step isn't available for this item any more. Refresh the page.");
  if (item.handover === "posted" || item.handover === null) return fail("This one is sent by post: use the posted step.");
  await db.update(items).set({ status: "completed", postedAt: when, updatedAt: new Date() }).where(eq(items.id, itemId));
  return { ok: true };
}

// ---------- Editing details ----------

export type ListingEdit = { listingId: number; price: string | null; url: string | null; listedAt: string | null };

/** Applies edits from the "Edit details" form to an item's listings (price, link, date). */
export async function editListings(userId: number, itemId: number, edits: ListingEdit[]): Promise<Result> {
  return db.transaction(async (tx) => {
    const item = await loadItem(tx, userId, itemId);
    if (!item) return fail("Item not found.");
    const mine = new Set((await tx.select({ id: listings.id }).from(listings).where(eq(listings.itemId, itemId))).map((r) => r.id));
    for (const e of edits) {
      if (!mine.has(e.listingId)) return fail("Unknown listing.");
      if (e.price === null || !e.listedAt) return fail("Check each listing's date and price.");
      await tx.update(listings).set({ price: e.price, url: e.url, listedAt: e.listedAt }).where(eq(listings.id, e.listingId));
    }
    await syncItemFromListings(tx, itemId);
    return { ok: true } as Result;
  });
}
