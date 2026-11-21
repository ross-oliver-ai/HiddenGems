"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { items, postalServices, priceChanges, type ItemStatus } from "@/db/schema";
import { requireWritableUser } from "@/lib/auth";
import { parseMoney, todayLondon } from "@/lib/format";

export type LifecycleState = { error?: string; ok?: boolean };

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const date = (v: FormDataEntryValue | null) => {
  const s = String(v ?? "").trim();
  return DATE_RE.test(s) && !Number.isNaN(Date.parse(s)) ? s : null;
};

// Which statuses each step may start from
const FROM: Record<string, ItemStatus[]> = {
  list: ["bought"],
  reduce: ["listed"],
  sell: ["listed", "bought"],
  post: ["sold"],
  complete: ["posted", "sold"],
  return: ["sold", "posted", "completed"],
  relist: ["returned"],
  unsold: ["bought", "listed"],
  donate: ["bought", "listed", "unsold"],
  reopen: ["unsold", "donated"],
  unlist: ["listed"],
};

export async function lifecycleAction(_prev: LifecycleState, formData: FormData): Promise<LifecycleState> {
  const user = await requireWritableUser();
  const id = Number(formData.get("id"));
  const intent = String(formData.get("intent") ?? "");
  if (!Number.isInteger(id) || !(intent in FROM)) return { error: "Something went wrong." };

  const [item] = await db.select().from(items).where(and(eq(items.id, id), eq(items.userId, user.id))).limit(1);
  if (!item) return { error: "Item not found." };
  if (!FROM[intent].includes(item.status)) return { error: "That step isn't available for this item any more. Refresh the page." };

  const today = todayLondon();
  const when = date(formData.get("date")) ?? today;
  const set = (patch: Partial<typeof items.$inferInsert>) =>
    db.update(items).set({ ...patch, updatedAt: new Date() }).where(eq(items.id, id));

  switch (intent) {
    case "list": {
      const price = parseMoney(formData.get("price"));
      if (price === null) return { error: "Enter your asking price." };
      if (when < item.boughtAt) return { error: "You can't list it before you bought it." };
      const url = String(formData.get("url") ?? "").trim();
      await set({ status: "listed", listedAt: when, listPrice: price, vintedUrl: url || null });
      break;
    }
    case "reduce": {
      const price = parseMoney(formData.get("price"));
      if (price === null) return { error: "Enter the new price." };
      if (item.listPrice === price) return { error: "That's the same as the current price." };
      await db.insert(priceChanges).values({ itemId: id, changedAt: when, oldPrice: item.listPrice ?? price, newPrice: price });
      await set({ listPrice: price });
      break;
    }
    case "sell": {
      const price = parseMoney(formData.get("price"));
      if (price === null) return { error: "Enter what it sold for." };
      if (when < item.boughtAt) return { error: "You can't sell it before you bought it." };
      const postalId = Number(formData.get("postalServiceId")) || null;
      if (postalId) {
        const [ok] = await db
          .select({ id: postalServices.id })
          .from(postalServices)
          .where(and(eq(postalServices.id, postalId), eq(postalServices.userId, user.id)));
        if (!ok) return { error: "Unknown postal service." };
      }
      await set({ status: "sold", soldAt: when, soldPrice: price, postalServiceId: postalId });
      break;
    }
    case "post":
      await set({ status: "posted", postedAt: when });
      break;
    case "complete":
      await set({ status: "completed", postedAt: item.postedAt ?? when });
      break;
    case "return": {
      const refund = parseMoney(formData.get("price"));
      if (refund === null) return { error: "Enter the amount refunded (0 if none)." };
      await set({ status: "returned", returnedAt: when, refundAmount: refund });
      break;
    }
    case "relist": {
      const price = parseMoney(formData.get("price"));
      if (price === null) return { error: "Enter your new asking price." };
      await set({
        status: "listed",
        listedAt: when,
        listPrice: price,
        soldAt: null,
        soldPrice: null,
        postedAt: null,
        returnedAt: null,
        refundAmount: null,
        postalServiceId: null,
      });
      break;
    }
    case "unlist":
      await set({ status: "bought", listedAt: null, listPrice: null, vintedUrl: null });
      break;
    case "unsold":
      await set({ status: "unsold" });
      break;
    case "donate":
      await set({ status: "donated" });
      break;
    case "reopen":
      await set({ status: "bought", listedAt: null, listPrice: null, vintedUrl: null });
      break;
  }

  revalidatePath("/items");
  revalidatePath(`/items/${id}`);
  revalidatePath("/");
  return { ok: true };
}
