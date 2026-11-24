"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { users } from "@/db/schema";
import { createSession } from "@/lib/session";
import { landingPathFor } from "@/lib/landing";
import { dummyHash, verifyPassword } from "@/lib/password";
import { beginSignIn, blockedMessage, finishSignIn, visitorIp } from "@/lib/sign-in-limit";

export type LoginState = { error?: string; email?: string; unverified?: boolean };

const schema = z.object({ email: z.string().trim().toLowerCase().min(1), password: z.string().min(1) });

export async function loginAction(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const rawEmail = String(formData.get("email") ?? "");
  const parsed = schema.safeParse({ email: rawEmail, password: formData.get("password") });
  if (!parsed.success) return { error: "Enter your email and password.", email: rawEmail };

  // Slow down password guessing: too many recent wrong passwords for this email (or from this network) means wait.
  // This is keyed on what was typed, not on whether the account exists, so it reveals nothing about who has an account.
  const attempt = await beginSignIn(parsed.data.email, visitorIp(await headers()));
  if (!attempt.allowed) return { error: blockedMessage(attempt.retryAfterMinutes), email: rawEmail };

  const [user] = await db.select().from(users).where(eq(users.email, parsed.data.email)).limit(1);
  const ok = await verifyPassword(parsed.data.password, user?.passwordHash ?? dummyHash());
  await finishSignIn(parsed.data.email, attempt.attemptId, !!user && ok && !user.disabled);
  if (!user || !ok || user.disabled) return { error: "Email or password is incorrect.", email: rawEmail };

  if (!user.emailVerifiedAt) {
    return { error: "Please confirm your email first. We sent you a link when you signed up.", email: rawEmail, unverified: true };
  }

  await createSession(user.id);
  redirect(user.mustChangePassword ? "/change-password" : landingPathFor(user.role));
}
