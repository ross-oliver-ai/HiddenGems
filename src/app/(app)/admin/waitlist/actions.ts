"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { waitlist } from "@/db/schema";
import { requireAdmin } from "@/lib/auth";

export async function toggleInvitedAction(formData: FormData) {
  await requireAdmin();
  const id = Number(formData.get("id"));
  if (!Number.isInteger(id)) return;
  const [row] = await db.select().from(waitlist).where(eq(waitlist.id, id));
  if (!row) return;
  await db.update(waitlist).set({ invitedAt: row.invitedAt ? null : new Date() }).where(eq(waitlist.id, id));
  revalidatePath("/admin/waitlist");
}

export async function removeWaitlistAction(formData: FormData) {
  await requireAdmin();
  const id = Number(formData.get("id"));
  if (!Number.isInteger(id)) return;
  await db.delete(waitlist).where(eq(waitlist.id, id));
  revalidatePath("/admin/waitlist");
}
