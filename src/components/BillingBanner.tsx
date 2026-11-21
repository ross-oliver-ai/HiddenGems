import Link from "next/link";
import type { User } from "@/db/schema";
import { daysLabel, entitlement } from "@/lib/billing";

/** A slim notice at the top of the app. Shows nothing for most people, most of the time. */
export function BillingBanner({ user }: { user: User }) {
  const ent = entitlement(user);
  let text: string | null = null;
  let tone = "bg-primary-soft text-primary";

  if (ent.state === "trial" && ent.daysLeft !== null && ent.daysLeft <= 7) {
    text = `${daysLabel(ent.daysLeft)} left in your free trial`;
  } else if (ent.state === "past_due") {
    text = "Your last payment didn't go through. Tap to fix it.";
    tone = "bg-warning/15 text-warning";
  } else if (ent.state === "locked") {
    text = ent.lockedReason === "payment_failed" ? "Payment failed, so your account is read-only." : "Your trial has ended, so your account is read-only.";
    tone = "bg-danger/10 text-danger";
  }
  if (!text) return null;

  return (
    <Link href="/billing" className={`mb-3 flex items-center justify-between gap-3 rounded-xl px-3 py-2 text-sm font-bold ${tone}`}>
      <span>{text}</span>
      <span aria-hidden>→</span>
    </Link>
  );
}
