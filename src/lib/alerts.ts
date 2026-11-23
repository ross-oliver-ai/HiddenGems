import { and, count, desc, eq, gt, isNull, lt, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { errorAlerts } from "@/db/schema";
import { SUPPORT_EMAIL } from "./contact";
import { emailLayout, sendEmail } from "./email";
import {
  ALERT_COOLDOWN_MS, ALERT_RETENTION_DAYS, DAILY_ALERT_CAP, alertsOff, errorMessage, isNormalControlFlow, scrub, scrubRoute, signatureFor,
} from "./alert-rules";

/** Where alerts go: ALERT_EMAIL if set, otherwise the support mailbox (which forwards to the owner). */
export function alertRecipient(): string {
  return process.env.ALERT_EMAIL?.trim() || SUPPORT_EMAIL;
}

export type AlertDeps = {
  send: (to: string, subject: string, content: { html: string; text: string }) => Promise<boolean>;
  now: () => Date;
};
export const realAlertDeps: AlertDeps = { send: sendEmail, now: () => new Date() };

type Alert = { source: string; route: string | null; message: string; digest: string | null; count: number; firstSeenAt: Date; test: boolean };

function alertEmail(a: Alert) {
  const when = a.firstSeenAt.toLocaleString("en-GB", { timeZone: "Europe/London", dateStyle: "medium", timeStyle: "short" });
  const lines = [
    `Where: ${a.source}${a.route ? ` (${a.route})` : ""}`,
    `What: ${a.message || "(no message)"}`,
    a.digest ? `Log id (search for it in Vercel's logs): ${a.digest}` : "",
    `First seen: ${when}`,
    "You won't get another email for this same problem for an hour. Nothing about any customer is included here.",
  ].filter(Boolean);
  return emailLayout({
    heading: a.test ? "Test alert: the alert emails work" : "Something went wrong on Hidden Gems",
    body: a.test ? "This is a test from the admin Overview. If you can read this, real alerts will reach you." : lines.slice(0, 2).join(". "),
    footer: a.test ? "Nothing is wrong." : lines.slice(2).join(" "),
  });
}

/**
 * Records a server-side problem and, if it is new (or the last email about it was over an hour ago, and fewer than
 * DAILY_ALERT_CAP problems were emailed in the last day), emails the owner. Never throws, so reporting can never make things worse.
 */
export async function recordError(
  input: { source: string; error: unknown; route?: string | null; digest?: string | null },
  deps: AlertDeps = realAlertDeps,
): Promise<void> {
  try {
    if (alertsOff() || isNormalControlFlow(input.error)) return;
    const now = deps.now();
    const route = scrubRoute(input.route);
    const message = scrub(errorMessage(input.error));
    const digest = input.digest ?? (typeof input.error === "object" && input.error !== null && "digest" in input.error ? String((input.error as { digest: unknown }).digest).slice(0, 40) : null);
    const signature = signatureFor(input.source, route, input.error);

    const [{ n: emailedToday }] = await db
      .select({ n: count() })
      .from(errorAlerts)
      .where(gt(errorAlerts.lastEmailedAt, new Date(now.getTime() - 24 * 3600_000)));
    const mayEmail = Number(emailedToday) < DAILY_ALERT_CAP;
    const cutoff = new Date(now.getTime() - ALERT_COOLDOWN_MS);

    // Step 1: record the occurrence (never touches the "last emailed" time).
    const [row] = await db
      .insert(errorAlerts)
      .values({ signature, source: input.source, route, message, digest, firstSeenAt: now, lastSeenAt: now })
      .onConflictDoUpdate({
        target: errorAlerts.signature,
        set: {
          count: sql`${errorAlerts.count} + 1`,
          lastSeenAt: now,
          message,
          digest: sql`coalesce(${digest}, ${errorAlerts.digest})`,
        },
      })
      .returning({ count: errorAlerts.count, firstSeenAt: errorAlerts.firstSeenAt });

    // Step 2: one atomic statement decides who "owns" the email. If a burst of identical errors arrives together,
    // the database lets exactly one of them through; the rest see the fresh timestamp and stay quiet.
    if (!mayEmail) return;
    const claimed = await db
      .update(errorAlerts)
      .set({ lastEmailedAt: now })
      .where(and(eq(errorAlerts.signature, signature), or(isNull(errorAlerts.lastEmailedAt), lt(errorAlerts.lastEmailedAt, cutoff))))
      .returning({ signature: errorAlerts.signature });

    if (claimed.length > 0 && row) {
      const sent = await deps.send(alertRecipient(), `[Hidden Gems] Problem: ${input.source}`, alertEmail({ source: input.source, route, message, digest, count: row.count, firstSeenAt: row.firstSeenAt, test: false }));
      if (!sent) console.error("Error alert could not be emailed:", input.source, message);
    }
  } catch (e) {
    console.error("Recording an error failed", e); // never rethrow
  }
}

/** The admin's "Send a test alert" button: goes the whole way (database row, real email) and ignores the hourly and daily limits. */
export async function sendTestAlert(deps: AlertDeps = realAlertDeps): Promise<{ emailed: boolean; to: string }> {
  const now = deps.now();
  const to = alertRecipient();
  await db
    .insert(errorAlerts)
    .values({ signature: "test-alert", source: "Test", message: "Test alert sent from the admin Overview", isTest: true, firstSeenAt: now, lastSeenAt: now, lastEmailedAt: now })
    .onConflictDoUpdate({ target: errorAlerts.signature, set: { count: sql`${errorAlerts.count} + 1`, lastSeenAt: now, lastEmailedAt: now } });
  const emailed = await deps.send(to, "[Hidden Gems] TEST alert", alertEmail({ source: "Test", route: null, message: "Test", digest: null, count: 1, firstSeenAt: now, test: true }));
  return { emailed, to };
}

export async function recentAlerts(limit = 8) {
  return db.select().from(errorAlerts).orderBy(desc(errorAlerts.lastSeenAt)).limit(limit);
}

/** Problems that haven't recurred for 30 days are forgotten. Called by the daily job. */
export async function purgeOldAlerts(now: Date = new Date()): Promise<void> {
  const cutoff = new Date(now.getTime() - ALERT_RETENTION_DAYS * 24 * 3600_000);
  await db.delete(errorAlerts).where(and(lt(errorAlerts.lastSeenAt, cutoff)));
}
