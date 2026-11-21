import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { stripeConfigured } from "./billing";
import { updateCustomerEmail } from "./stripe";
import { sendEmailChangedNotice } from "./authEmails";
import { revokeTokens } from "./tokens";

export type ChangeResult = { ok: true; oldEmail: string } | { ok: false; reason: "taken" | "missing" };

/**
 * Switches an account to a new sign-in email. The caller has already checked the person is allowed
 * (they proved they own the new mailbox, or an admin is doing it). The new address counts as confirmed.
 */
export async function applyEmailChange(userId: number, newEmail: string): Promise<ChangeResult> {
  const email = newEmail.trim().toLowerCase();
  const [user] = await db.select().from(users).where(eq(users.id, userId));
  if (!user) return { ok: false, reason: "missing" };
  const [clash] = await db.select({ id: users.id }).from(users).where(eq(users.email, email));
  if (clash && clash.id !== userId) return { ok: false, reason: "taken" };

  try {
    await db.update(users).set({ email, emailVerifiedAt: new Date() }).where(eq(users.id, userId));
  } catch (e) {
    if ((e as { code?: string; cause?: { code?: string } })?.code === "23505" || (e as { cause?: { code?: string } })?.cause?.code === "23505") return { ok: false, reason: "taken" };
    throw e;
  }

  // Links already sent to the old address must stop working
  await revokeTokens(userId, ["verify_email", "reset_password", "change_email"]);

  // The rest is best-effort: the account is already switched, so a hiccup here must not undo or fail it
  if (user.stripeCustomerId && stripeConfigured()) {
    await updateCustomerEmail(user.stripeCustomerId, email).catch((e) => console.error("Couldn't update the Stripe email", e));
  }
  if (user.email !== email) await sendEmailChangedNotice(user.email, email).catch(() => false);
  return { ok: true, oldEmail: user.email };
}
