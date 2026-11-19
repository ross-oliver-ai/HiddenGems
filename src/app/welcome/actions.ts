"use server";

import { count } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { waitlist } from "@/db/schema";

export type WaitlistState = { ok?: boolean; error?: string; email?: string };

const emailSchema = z.string().trim().toLowerCase().max(254).pipe(z.email());
const MAX_ENTRIES = 20000; // stops a bot filling the table

export async function joinWaitlistAction(_prev: WaitlistState, formData: FormData): Promise<WaitlistState> {
  const raw = String(formData.get("email") ?? "");
  // Hidden field real people never fill in; bots do. Pretend it worked.
  if (String(formData.get("website") ?? "") !== "") return { ok: true };

  const parsed = emailSchema.safeParse(raw);
  if (!parsed.success) return { error: "That doesn't look like an email address. Please check it.", email: raw };

  try {
    const [{ n }] = await db.select({ n: count() }).from(waitlist);
    if (n >= MAX_ENTRIES) return { error: "The list is full right now. Please try again later.", email: raw };
    // Already on the list? Same friendly answer, so nobody can use this to check who's signed up.
    await db.insert(waitlist).values({ email: parsed.data }).onConflictDoNothing();
  } catch (e) {
    console.error("Waitlist sign-up failed", e);
    return { error: "Sorry, sign-ups aren't working just yet. Please try again soon.", email: raw };
  }
  return { ok: true };
}
