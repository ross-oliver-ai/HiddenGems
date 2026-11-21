"use server";

import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { users } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { verifyPassword } from "@/lib/password";
import { emailConfigured } from "@/lib/email";
import { recentTokens } from "@/lib/tokens";
import { sendChangeEmailConfirm } from "@/lib/authEmails";

export type ChangeEmailState = { error?: string; sentTo?: string };

const schema = z.object({
  email: z.string().trim().toLowerCase().max(254).pipe(z.email("That doesn't look like an email address.")),
  password: z.string().min(1, "Enter your current password."),
});

export async function requestEmailChangeAction(_prev: ChangeEmailState, formData: FormData): Promise<ChangeEmailState> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const parsed = schema.safeParse({ email: formData.get("email"), password: formData.get("password") });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  if (!emailConfigured()) return { error: "Email isn't switched on yet, so we can't send a confirmation link. Please ask the admin to change it for you." };
  if (!(await verifyPassword(parsed.data.password, user.passwordHash))) return { error: "Current password is incorrect." };
  if (parsed.data.email === user.email) return { error: "That's already your email address." };
  if ((await recentTokens(user.id, "change_email")) >= 3) return { error: "You've asked for a few of these already. Please wait an hour and try again." };

  // Same answer whether or not the address is already in use, so this can't be used to discover who has an account
  const [taken] = await db.select({ id: users.id }).from(users).where(eq(users.email, parsed.data.email)).limit(1);
  if (!taken) await sendChangeEmailConfirm(user.id, parsed.data.email, user.name);
  return { sentTo: parsed.data.email };
}
