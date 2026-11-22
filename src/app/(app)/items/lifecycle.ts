"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { items, type ItemStatus } from "@/db/schema";
import { requireWritableUser } from "@/lib/auth";
import { parseMoney, parseOptionalMoney, todayLondon } from "@/lib/format";
import { endListing, listOn, markHandedOver, parseListEntries, reducePrices, sellItem, unlistAll, writeOff, type Result } from "@/lib/listings";

export type LifecycleState = { error?: string; ok?: boolean };

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const date = (v: FormDataEntryValue | null) => {
  const s = String(v ?? "").trim();
  return DATE_RE.test(s) && !Number.isNaN(Date.parse(s)) ? s : null;
};

// Which statuses each step may start from
const FROM: Record<string, ItemStatus[]> = {
  list: ["bought"],
  listmore: ["listed"],
  reduce: ["listed"],
  endlisting: ["listed"],
  sell: ["listed", "bought"],
  post: ["sold"],
  handover: ["sold"],
  complete: ["posted", "sold"],
  return: ["sold", "posted", "completed"],
  relist: ["returned"],
  unsold: ["bought", "listed"],
  donate: ["bought", "listed", "unsold"],
  reopen: ["unsold", "donated"],
  unlist: ["listed"],
};

const done = (r: Result): LifecycleState => ("error" in r ? { error: r.error } : { ok: true });

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

  let state: LifecycleState = { ok: true };
  switch (intent) {
    case "list":
    case "listmore":
    case "relist": {
      const entries = parseListEntries(formData, parseMoney);
      if ("error" in entries) return entries;
      state = done(await listOn(user.id, id, entries, when, intent === "list" ? "list" : intent === "listmore" ? "more" : "relist"));
      break;
    }
    case "reduce": {
      const prices = new Map<number, string | null>();
      for (const [key, value] of formData.entries()) {
        const m = /^price_(\d+)$/.exec(key);
        if (m) prices.set(Number(m[1]), parseMoney(value));
      }
      state = done(await reducePrices(user.id, id, prices, when));
      break;
    }
    case "endlisting":
      state = done(await endListing(user.id, id, Number(formData.get("listingId")), when));
      break;
    case "unlist":
      state = done(await unlistAll(user.id, id, today));
      break;
    case "sell": {
      const fees = parseOptionalMoney(formData.get("fees"));
      const postagePaid = parseOptionalMoney(formData.get("postagePaid"));
      if (fees === null || postagePaid === null) return { error: "Check the fees and postage amounts (numbers only, or leave blank)." };
      state = done(
        await sellItem(user.id, id, {
          platformId: Number(formData.get("platformId")),
          price: parseMoney(formData.get("price")),
          when,
          handover: String(formData.get("handover") ?? ""),
          postalServiceId: Number(formData.get("postalServiceId")) || null,
          fees,
          postagePaid,
          handedOver: formData.get("handedOver") === "1",
        }),
      );
      break;
    }
    case "handover":
      state = done(await markHandedOver(user.id, id, when));
      break;
    case "post":
      if (item.handover && item.handover !== "posted") return { error: "This one wasn't posted. Use “Mark as handed over”." };
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
    case "unsold":
      state = done(await writeOff(user.id, id, "unsold", today));
      break;
    case "donate":
      state = done(await writeOff(user.id, id, "donated", today));
      break;
    case "reopen":
      await set({ status: "bought", listedAt: null, listPrice: null });
      break;
  }

  if (state.error) return state;
  revalidatePath("/items");
  revalidatePath(`/items/${id}`);
  revalidatePath("/");
  return { ok: true };
}
