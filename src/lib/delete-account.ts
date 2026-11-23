import { del } from "@vercel/blob";
import { and, eq, isNotNull } from "drizzle-orm";
import { db } from "@/db";
import { items, loginAttempts, users, waitlist, type User } from "@/db/schema";
import { recordError } from "./alerts";
import { stripeConfigured } from "./billing";
import { cancelSubscription } from "./stripe";

export type DeleteDeps = {
  cancelSubscription: (id: string) => Promise<void>;
  removePhotos: (urls: string[]) => Promise<void>;
  /** Tells the owner a deletion failed (a customer is waiting on this). Optional so tests can leave it out. */
  report?: (what: string, error: unknown) => Promise<void>;
};

/** Photos live in Vercel Blob. Nothing to remove when Blob isn't set up (local development). */
async function removePhotos(urls: string[]): Promise<void> {
  if (!process.env.BLOB_READ_WRITE_TOKEN && !process.env.BLOB_STORE_ID) return;
  for (let i = 0; i < urls.length; i += 100) await del(urls.slice(i, i + 100));
}

export const realDeps: DeleteDeps = {
  cancelSubscription,
  removePhotos,
  report: (what, error) => recordError({ source: `Account deletion (${what})`, error, route: "/settings/account/delete" }),
};

export type DeleteResult = { ok: true } | { ok: false; error: string };

/**
 * Permanently deletes an account and everything in it. The order matters: the subscription is cancelled first (so nobody is
 * charged for an account that no longer exists), then the photos, and only then the data. If the cancellation or the photo
 * removal fails, nothing has been deleted from the account and the person can simply try again.
 */
export async function deleteAccount(user: User, deps: DeleteDeps = realDeps): Promise<DeleteResult> {
  if (user.role === "admin") return { ok: false, error: "Admin accounts can't be deleted here." };

  if (user.stripeSubscriptionId && user.subscriptionStatus !== "canceled" && stripeConfigured()) {
    try {
      await deps.cancelSubscription(user.stripeSubscriptionId);
    } catch (e) {
      await deps.report?.("cancelling the subscription", e);
      return { ok: false, error: "We couldn't cancel your subscription, so nothing has been deleted. Please try again in a minute, or email us." };
    }
  }

  const photos = (await db.select({ url: items.photoUrl }).from(items).where(and(eq(items.userId, user.id), isNotNull(items.photoUrl)))).map((r) => r.url!);
  if (photos.length) {
    try {
      await deps.removePhotos(photos);
    } catch (e) {
      await deps.report?.("removing photos", e);
      return { ok: false, error: "We couldn't remove your photos, so nothing has been deleted. Please try again in a minute, or email us." };
    }
  }

  // Everything that belongs to the account goes with the user row (items, listings, price drops, lists, platforms, tokens)
  await db.delete(users).where(eq(users.id, user.id));
  await db.delete(loginAttempts).where(eq(loginAttempts.email, user.email.toLowerCase()));
  await db.delete(waitlist).where(eq(waitlist.email, user.email.toLowerCase()));
  return { ok: true };
}
