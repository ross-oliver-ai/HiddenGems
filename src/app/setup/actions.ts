"use server";

import { timingSafeEqual } from "node:crypto";
import path from "node:path";
import { eq } from "drizzle-orm";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { z } from "zod";
import { db } from "@/db";
import { users } from "@/db/schema";
import { hashPassword } from "@/lib/password";

export type SetupState = { error?: string; ok?: boolean; email?: string };

const schema = z.object({
  token: z.string().min(1, "Enter the setup code."),
  email: z.string().trim().toLowerCase().pipe(z.email("Enter a valid email.")),
  password: z.string().min(10, "Password must be at least 10 characters."),
});

function tokenMatches(given: string): boolean {
  const expected = process.env.SETUP_TOKEN;
  if (!expected || expected.length < 12) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function adminExists(): Promise<boolean> {
  try {
    const rows = await db.select({ id: users.id }).from(users).where(eq(users.role, "admin")).limit(1);
    return rows.length > 0;
  } catch {
    return false; // tables not created yet
  }
}

export async function setupAction(_prev: SetupState, formData: FormData): Promise<SetupState> {
  const email = String(formData.get("email") ?? "");
  if (!process.env.SETUP_TOKEN || process.env.SETUP_TOKEN.length < 12) {
    return { error: "SETUP_TOKEN isn't set in Vercel (it needs at least 12 characters).", email };
  }
  if (await adminExists()) return { error: "Setup has already been completed.", email };

  const parsed = schema.safeParse({ token: formData.get("token"), email, password: formData.get("password") });
  if (!parsed.success) return { error: parsed.error.issues[0].message, email };
  if (!tokenMatches(parsed.data.token)) return { error: "That setup code isn't right.", email };

  try {
    await migrate(db, { migrationsFolder: path.join(process.cwd(), "drizzle") });
  } catch (e) {
    console.error("Migration failed", e);
    return { error: "Couldn't create the database tables. Check DATABASE_URL is the public Railway URL.", email };
  }

  if (await adminExists()) return { error: "Setup has already been completed.", email };

  await db.insert(users).values({
    email: parsed.data.email,
    name: "Admin",
    passwordHash: await hashPassword(parsed.data.password),
    role: "admin",
    mustChangePassword: false,
  });
  return { ok: true, email: parsed.data.email };
}
