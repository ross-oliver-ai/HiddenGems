"use server";

import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { users } from "@/db/schema";
import { createSession } from "@/lib/session";
import { dummyHash, verifyPassword } from "@/lib/password";

export type LoginState = { error?: string; email?: string };

const schema = z.object({ email: z.string().trim().toLowerCase().min(1), password: z.string().min(1) });

export async function loginAction(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const rawEmail = String(formData.get("email") ?? "");
  const parsed = schema.safeParse({ email: rawEmail, password: formData.get("password") });
  if (!parsed.success) return { error: "Enter your email and password.", email: rawEmail };

  const [user] = await db.select().from(users).where(eq(users.email, parsed.data.email)).limit(1);
  const ok = await verifyPassword(parsed.data.password, user?.passwordHash ?? dummyHash());
  if (!user || !ok || user.disabled) return { error: "Email or password is incorrect.", email: rawEmail };

  await createSession(user.id);
  redirect(user.mustChangePassword ? "/change-password" : "/");
}
