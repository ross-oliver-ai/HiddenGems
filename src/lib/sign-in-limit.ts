import { and, asc, eq, gt, lt, sql } from "drizzle-orm";
import { db } from "@/db";
import { loginAttempts } from "@/db/schema";
import { SIGN_IN_LIMITS, normaliseEmail, signInLimitEnabled } from "./sign-in-rules";

export { SIGN_IN_LIMITS, blockedMessage, normaliseEmail, signInLimitEnabled, visitorIp } from "./sign-in-rules";

/**
 * Slows down password guessing. Each sign-in attempt is recorded before the password is checked, and removed again if the
 * password turns out to be right. Too many attempts in the window and the person is asked to wait; blocked attempts are
 * not recorded, so hammering the form can't extend the wait.
 */
export type Attempt = { allowed: true; attemptId: number | null } | { allowed: false; retryAfterMinutes: number };

/** How long until `column = value` has dropped back under `limit` attempts, or 0 if it's already under. */
async function waitMinutes(column: typeof loginAttempts.email | typeof loginAttempts.ip, value: string, limit: number, now: Date): Promise<number> {
  const since = new Date(now.getTime() - SIGN_IN_LIMITS.windowMs);
  const rows = await db
    .select({ createdAt: loginAttempts.createdAt })
    .from(loginAttempts)
    .where(and(eq(column, value), gt(loginAttempts.createdAt, since)))
    .orderBy(asc(loginAttempts.createdAt));
  if (rows.length <= limit) return 0;
  // The attempt that has to expire for the count to drop back to the limit.
  const unblocking = rows[rows.length - limit - 1].createdAt;
  return Math.max(1, Math.ceil((unblocking.getTime() + SIGN_IN_LIMITS.windowMs - now.getTime()) / 60000));
}

/** Call before checking a password. If allowed, call `finishSignIn` afterwards with the same attemptId. */
export async function beginSignIn(rawEmail: string, ip: string | null, now: Date = new Date()): Promise<Attempt> {
  if (!signInLimitEnabled()) return { allowed: true, attemptId: null };
  const email = normaliseEmail(rawEmail);

  // Tidy up old rows as we go (cheap: indexed by time).
  await db.delete(loginAttempts).where(lt(loginAttempts.createdAt, new Date(now.getTime() - 24 * 60 * 60 * 1000)));

  // Record first, then count, so a burst of simultaneous guesses can't all slip past the check.
  const [row] = await db.insert(loginAttempts).values({ email, ip, createdAt: now }).returning({ id: loginAttempts.id });

  const waits = [await waitMinutes(loginAttempts.email, email, SIGN_IN_LIMITS.perEmail, now)];
  if (ip) waits.push(await waitMinutes(loginAttempts.ip, ip, SIGN_IN_LIMITS.perIp, now));
  const wait = Math.max(...waits);
  if (wait > 0) {
    await db.delete(loginAttempts).where(eq(loginAttempts.id, row.id)); // blocked attempts don't extend the wait
    return { allowed: false, retryAfterMinutes: wait };
  }
  return { allowed: true, attemptId: row.id };
}

/** A correct password clears that email's recent failures (and this attempt). A wrong one leaves the attempt recorded. */
export async function finishSignIn(rawEmail: string, attemptId: number | null, passwordWasRight: boolean): Promise<void> {
  if (attemptId === null || !passwordWasRight) return;
  await clearFailedSignIns(rawEmail);
}

/** Forget an email's recent failures, e.g. after a successful sign-in or a password reset. */
export async function clearFailedSignIns(rawEmail: string): Promise<void> {
  await db.delete(loginAttempts).where(eq(loginAttempts.email, normaliseEmail(rawEmail)));
}

/** For tests and diagnostics: how many attempts are on record for an email in the window. */
export async function recentAttempts(rawEmail: string, now: Date = new Date()): Promise<number> {
  const since = new Date(now.getTime() - SIGN_IN_LIMITS.windowMs);
  const [r] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(loginAttempts)
    .where(and(eq(loginAttempts.email, normaliseEmail(rawEmail)), gt(loginAttempts.createdAt, since)));
  return r.n;
}
