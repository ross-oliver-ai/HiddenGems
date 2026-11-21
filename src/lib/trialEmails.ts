import { and, eq, isNotNull, or, isNull, notInArray } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { DAY_MS, billingEnforced, entitlement, fmtDate, priceLabel, trialEnd } from "./billing";
import { appUrl, emailLayout, sendEmail } from "./email";

/**
 * Sent by the daily scheduler. Two reminders per person: about a week before the trial ends, and again in the last two days.
 * Nobody is charged automatically, so these are friendly heads-ups, not payment warnings.
 */
export async function sendTrialReminders(now: Date = new Date()): Promise<{ checked: number; sent: number }> {
  if (!billingEnforced()) return { checked: 0, sent: 0 };

  const candidates = await db
    .select()
    .from(users)
    .where(
      and(
        eq(users.role, "seller"),
        eq(users.disabled, false),
        eq(users.billingExempt, false),
        isNotNull(users.emailVerifiedAt),
        or(isNull(users.subscriptionStatus), notInArray(users.subscriptionStatus, ["active", "trialing", "past_due"])),
        or(isNull(users.trialReminder7SentAt), isNull(users.trialReminder1SentAt)),
      ),
    );

  const site = await appUrl();
  let sent = 0;
  for (const u of candidates) {
    const msLeft = trialEnd(u).getTime() - now.getTime();
    if (msLeft <= 0 || msLeft > 7 * DAY_MS) continue; // trial over, or not yet close
    const final = msLeft <= 2 * DAY_MS;
    if (final ? u.trialReminder1SentAt : u.trialReminder7SentAt || u.trialReminder1SentAt) continue;
    if (!entitlement(u, now).canWrite) continue;

    const ends = fmtDate(trialEnd(u));
    const price = priceLabel();
    const ok = await sendEmail(
      u.email,
      final ? "Your Hidden Gems free trial ends very soon" : "Your Hidden Gems free trial ends in a week",
      emailLayout({
        heading: final ? "Your free trial ends very soon" : "Your free trial ends in a week",
        body: `Hi ${u.name.split(" ")[0]}, your free trial of Hidden Gems ends on ${ends}. To keep adding and editing items after that, you can subscribe for ${price} a month. You don't have to do anything if you'd rather not: we won't charge you unless you subscribe. Your account would simply become read-only, your data would stay safe, and you could still download everything as a spreadsheet.`,
        buttonText: "See my options",
        buttonUrl: `${site}/billing`,
        footer: "You can cancel a subscription at any time from the Billing page in the app.",
      }),
    );
    if (!ok) continue;
    // Skipping straight to the final reminder counts as having had the week-ahead one too
    await db.update(users).set(final ? { trialReminder1SentAt: now, trialReminder7SentAt: u.trialReminder7SentAt ?? now } : { trialReminder7SentAt: now }).where(eq(users.id, u.id));
    sent++;
  }
  return { checked: candidates.length, sent };
}
