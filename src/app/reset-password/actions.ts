"use server";

import { redirect } from "next/navigation";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { hashPassword } from "@/lib/password";
import { consumeToken, peekToken } from "@/lib/tokens";

export type ResetState = { error?: string };

export async function resetPasswordAction(_prev: ResetState, formData: FormData): Promise<ResetState> {
  const token = String(formData.get("token") ?? "");
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");
  if (password.length < 10) return { error: "Your password needs at least 10 characters." };
  if (password.length > 72) return { error: "Your password can be at most 72 characters." };
  if (password !== confirm) return { error: "The two passwords don't match." };
  if (!(await peekToken(token, "reset_password"))) return { error: "That link has expired or was already used. Please ask for a new one." };

  const userId = await consumeToken(token, "reset_password");
  if (!userId) return { error: "That link has expired or was already used. Please ask for a new one." };
  await db
    .update(users)
    .set({
      passwordHash: await hashPassword(password),
      mustChangePassword: false,
      emailVerifiedAt: sql`coalesce(${users.emailVerifiedAt}, now())`, // they've proved they own the address
    })
    .where(eq(users.id, userId));
  redirect("/login?reset=1");
}
