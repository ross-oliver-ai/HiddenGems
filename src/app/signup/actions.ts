"use server";

import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { users } from "@/db/schema";
import { hashPassword } from "@/lib/password";
import { seedUserDefaults } from "@/lib/defaults";
import { signupsOpen } from "@/lib/email";
import { sendAlreadyHaveAccountEmail, sendVerificationEmail } from "@/lib/authEmails";
import { recentTokens } from "@/lib/tokens";
import { DAY_MS, trialDays } from "@/lib/billing";

export type SignupState = { ok?: boolean; error?: string; name?: string; email?: string; terms?: boolean };

const schema = z.object({
  name: z.string().trim().min(1, "Please tell us your name.").max(80),
  email: z.string().trim().toLowerCase().max(254).pipe(z.email("That doesn't look like an email address.")),
  password: z.string().min(10, "Your password needs at least 10 characters.").max(72, "Your password can be at most 72 characters."),
  terms: z.literal("on", { error: "Please tick the box to agree to the terms." }),
});

export async function signupAction(_prev: SignupState, formData: FormData): Promise<SignupState> {
  const name = String(formData.get("name") ?? "");
  const email = String(formData.get("email") ?? "");
  if (!signupsOpen()) return { error: "Sign-ups aren't open yet.", name, email };
  if (String(formData.get("website") ?? "") !== "") return { ok: true, email }; // bot trap

  const parsed = schema.safeParse({ name, email, password: formData.get("password"), terms: formData.get("terms") ?? "" });
  if (!parsed.success) return { error: parsed.error.issues[0].message, name, email, terms: formData.get("terms") === "on" };

  // A daily cap so a bot can't flood the database
  const cap = Number(process.env.SIGNUPS_PER_DAY) || 100;
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(users).where(sql`${users.createdAt} >= now() - interval '1 day'`);
  if (n >= cap) return { error: "We're very busy right now. Please try again tomorrow.", name, email, terms: true };

  const [existing] = await db.select().from(users).where(eq(users.email, parsed.data.email)).limit(1);
  if (existing) {
    // Same answer as a brand-new sign-up, so nobody can use this form to find out who has an account
    if (!existing.disabled && (await recentTokens(existing.id, "reset_password")) < 3) {
      await sendAlreadyHaveAccountEmail(existing.id, existing.email);
    }
    return { ok: true, email: parsed.data.email };
  }

  const [created] = await db
    .insert(users)
    .values({
      name: parsed.data.name,
      email: parsed.data.email,
      passwordHash: await hashPassword(parsed.data.password),
      role: "seller",
      mustChangePassword: false,
      emailVerifiedAt: null,
      trialEndsAt: new Date(Date.now() + trialDays() * DAY_MS),
    })
    .returning({ id: users.id });
  await seedUserDefaults(created.id);

  const sent = await sendVerificationEmail(created.id, parsed.data.email, parsed.data.name);
  if (!sent) {
    await db.delete(users).where(eq(users.id, created.id)); // so they can try again
    return { error: "We couldn't send your confirmation email. Please check the address and try again.", name, email, terms: true };
  }
  return { ok: true, email: parsed.data.email };
}
