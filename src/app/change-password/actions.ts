"use server";

import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { users } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { hashPassword, verifyPassword } from "@/lib/password";
import { landingPathFor } from "@/lib/landing";

export type PasswordState = { error?: string; ok?: boolean };

const schema = z
  .object({
    current: z.string().min(1, "Enter your current password."),
    next: z.string().min(10, "New password must be at least 10 characters."),
    confirm: z.string(),
  })
  .refine((v) => v.next === v.confirm, { message: "New passwords don't match.", path: ["confirm"] });

export async function changePasswordAction(_prev: PasswordState, formData: FormData): Promise<PasswordState> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const parsed = schema.safeParse({
    current: formData.get("current"),
    next: formData.get("next"),
    confirm: formData.get("confirm"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  if (!(await verifyPassword(parsed.data.current, user.passwordHash))) {
    return { error: "Current password is incorrect." };
  }
  if (parsed.data.current === parsed.data.next) return { error: "Choose a different password." };

  await db
    .update(users)
    .set({ passwordHash: await hashPassword(parsed.data.next), mustChangePassword: false })
    .where(eq(users.id, user.id));

  if (user.mustChangePassword) redirect(landingPathFor(user.role));
  return { ok: true };
}
