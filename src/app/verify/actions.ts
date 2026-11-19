"use server";

import { redirect } from "next/navigation";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { users } from "@/db/schema";
import { consumeToken, recentTokens } from "@/lib/tokens";
import { sendVerificationEmail } from "@/lib/authEmails";
import { emailConfigured } from "@/lib/email";

export type SimpleState = { ok?: boolean; error?: string; email?: string };

export async function confirmEmailAction(_prev: SimpleState, formData: FormData): Promise<SimpleState> {
  const userId = await consumeToken(String(formData.get("token") ?? ""), "verify_email");
  if (!userId) return { error: "That link has expired or was already used." };
  await db.update(users).set({ emailVerifiedAt: sql`coalesce(${users.emailVerifiedAt}, now())` }).where(eq(users.id, userId));
  redirect("/login?verified=1");
}

export async function resendVerificationAction(_prev: SimpleState, formData: FormData): Promise<SimpleState> {
  const raw = String(formData.get("email") ?? "");
  const parsed = z.string().trim().toLowerCase().max(254).pipe(z.email()).safeParse(raw);
  if (!parsed.success) return { error: "That doesn't look like an email address.", email: raw };
  if (!emailConfigured()) return { error: "Email isn't switched on yet.", email: raw };
  const [user] = await db.select().from(users).where(eq(users.email, parsed.data)).limit(1);
  if (user && !user.disabled && !user.emailVerifiedAt && (await recentTokens(user.id, "verify_email")) < 3) {
    await sendVerificationEmail(user.id, user.email, user.name);
  }
  return { ok: true, email: parsed.data }; // same answer whether or not the account exists
}
