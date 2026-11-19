"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { users } from "@/db/schema";
import { requireAdmin } from "@/lib/auth";
import { hashPassword } from "@/lib/password";
import { seedUserDefaults } from "@/lib/defaults";

export type AdminState = { error?: string; ok?: string; values?: { name: string; email: string } };

const createSchema = z.object({
  name: z.string().trim().min(1, "Enter a name.").max(80),
  email: z.string().trim().toLowerCase().pipe(z.email("Enter a valid email.")),
  password: z.string().min(10, "Temporary password must be at least 10 characters."),
});

export async function createUserAction(_prev: AdminState, formData: FormData): Promise<AdminState> {
  await requireAdmin();
  const values = { name: String(formData.get("name") ?? ""), email: String(formData.get("email") ?? "") };
  const parsed = createSchema.safeParse({ ...values, password: formData.get("password") });
  if (!parsed.success) return { error: parsed.error.issues[0].message, values };

  const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, parsed.data.email));
  if (existing) return { error: "An account with that email already exists.", values };

  const [created] = await db
    .insert(users)
    .values({
      name: parsed.data.name,
      email: parsed.data.email,
      passwordHash: await hashPassword(parsed.data.password),
      role: "seller",
      mustChangePassword: true,
      emailVerifiedAt: new Date(), // the admin vouches for accounts they create
    })
    .returning({ id: users.id });
  await seedUserDefaults(created.id);

  revalidatePath("/admin/users");
  return { ok: `Account created for ${parsed.data.name}. Give them the temporary password.` };
}

export async function resetPasswordAction(_prev: AdminState, formData: FormData): Promise<AdminState> {
  const admin = await requireAdmin();
  const id = Number(formData.get("userId"));
  const password = String(formData.get("password") ?? "");
  if (password.length < 10) return { error: "Temporary password must be at least 10 characters." };
  if (!Number.isInteger(id)) return { error: "Unknown user." };
  if (id === admin.id) return { error: "Change your own password from Settings." };

  await db
    .update(users)
    .set({ passwordHash: await hashPassword(password), mustChangePassword: true })
    .where(eq(users.id, id));
  revalidatePath("/admin/users");
  return { ok: "Password reset. They'll be asked to choose a new one at next login." };
}

export async function toggleDisabledAction(formData: FormData) {
  const admin = await requireAdmin();
  const id = Number(formData.get("userId"));
  if (!Number.isInteger(id) || id === admin.id) return;
  const [target] = await db.select().from(users).where(eq(users.id, id));
  if (!target) return;
  await db.update(users).set({ disabled: !target.disabled }).where(eq(users.id, id));
  revalidatePath("/admin/users");
}
