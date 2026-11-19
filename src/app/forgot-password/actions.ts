"use server";

import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { users } from "@/db/schema";
import { sendResetEmail } from "@/lib/authEmails";
import { emailConfigured } from "@/lib/email";
import { recentTokens } from "@/lib/tokens";
import type { SimpleState } from "@/app/verify/actions";

export async function forgotPasswordAction(_prev: SimpleState, formData: FormData): Promise<SimpleState> {
  const raw = String(formData.get("email") ?? "");
  const parsed = z.string().trim().toLowerCase().max(254).pipe(z.email()).safeParse(raw);
  if (!parsed.success) return { error: "That doesn't look like an email address.", email: raw };
  if (!emailConfigured()) return { error: "Password reset by email isn't switched on yet. Please ask the person who set up your account.", email: raw };
  const [user] = await db.select().from(users).where(eq(users.email, parsed.data)).limit(1);
  if (user && !user.disabled && (await recentTokens(user.id, "reset_password")) < 3) {
    await sendResetEmail(user.id, user.email);
  }
  return { ok: true, email: parsed.data }; // same answer whether or not the account exists
}
