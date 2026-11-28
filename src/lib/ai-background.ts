import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { categories, items } from "@/db/schema";
import type { AiImage } from "@/lib/ai-claude";
import { fetchItemPhoto } from "@/lib/ai-image";
import { UNTITLED_NAME } from "@/lib/ai-rules";
import { suggestDetails } from "@/lib/ai-service";

/**
 * For an item that was saved while the AI was still reading its photo: finish the job after saving.
 * Fills only what is still empty (the name only while it is still "Untitled item"), and leaves the item flagged
 * "Check details" whether or not the AI managed it. Never throws: it runs after the page has already moved on.
 */
export async function fillItemInBackground(
  input: { userId: number; itemId: number; tag?: AiImage | null },
  deps: { suggest?: typeof suggestDetails; fetchPhoto?: typeof fetchItemPhoto } = {},
): Promise<void> {
  try {
    const [item] = await db.select().from(items).where(and(eq(items.id, input.itemId), eq(items.userId, input.userId))).limit(1);
    if (!item || !item.photoUrl) return;
    const photo = await (deps.fetchPhoto ?? fetchItemPhoto)(item.photoUrl);
    if (!photo) return;

    const cats = await db
      .select({ id: categories.id, name: categories.name })
      .from(categories)
      .where(and(eq(categories.userId, input.userId), eq(categories.archived, false)))
      .orderBy(asc(categories.name));
    const result = await (deps.suggest ?? suggestDetails)({ userId: input.userId, images: input.tag ? [photo, input.tag] : [photo], categories: cats });
    if (!result.ok) return;

    // Read again so anything the seller edited while the AI was working is kept
    const [now] = await db.select().from(items).where(and(eq(items.id, input.itemId), eq(items.userId, input.userId))).limit(1);
    if (!now) return;
    const s = result.suggestion;
    const patch: Partial<typeof items.$inferInsert> = {};
    if (s.name && now.name === UNTITLED_NAME) patch.name = s.name;
    if (s.brand && !now.brand) patch.brand = s.brand;
    if (s.size && !now.size) patch.size = s.size;
    if (s.categoryId !== null && !now.categoryId) patch.categoryId = s.categoryId;
    if (s.condition && !now.condition) patch.condition = s.condition;
    if (Object.keys(patch).length) await db.update(items).set({ ...patch, updatedAt: new Date() }).where(and(eq(items.id, input.itemId), eq(items.userId, input.userId)));
  } catch (e) {
    console.error("AI fill after saving failed:", e instanceof Error ? e.message : "unknown error");
  }
}
