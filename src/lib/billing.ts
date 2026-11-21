import type { User } from "@/db/schema";

// Billing is OFF until BILLING_ENABLED=true and Stripe is connected. Until then every account has full access,
// exactly as before. This file has no framework imports so it can be tested on its own.

export const DAY_MS = 86_400_000;
/** How long someone with a failed payment keeps full access while Stripe retries the card. */
export const GRACE_DAYS = 7;

export function stripeConfigured(): boolean {
  return !!process.env.STRIPE_SECRET_KEY && !!process.env.STRIPE_WEBHOOK_SECRET;
}

/** Limits are only enforced when billing is switched on AND Stripe is connected (so nobody is ever locked out with no way to pay). */
export function billingEnforced(): boolean {
  return process.env.BILLING_ENABLED === "true" && stripeConfigured();
}

export function trialDays(): number {
  const n = Number(process.env.TRIAL_DAYS);
  return Number.isInteger(n) && n > 0 && n <= 365 ? n : 30;
}

export function pricePence(): number {
  const n = Number(process.env.PRICE_PENCE);
  return Number.isInteger(n) && n >= 100 ? n : 300;
}

export function priceLabel(): string {
  const p = pricePence();
  return p % 100 === 0 ? `£${p / 100}` : `£${(p / 100).toFixed(2)}`;
}

export type AccessState =
  | "off" // billing not switched on
  | "exempt" // admin or "free forever"
  | "subscribed"
  | "past_due" // a payment failed but still inside the grace period
  | "trial"
  | "locked"; // read-only

export type LockedReason = "trial_ended" | "subscription_ended" | "payment_failed";

export type Entitlement = {
  state: AccessState;
  canWrite: boolean;
  trialEndsAt: Date | null;
  daysLeft: number | null; // whole days of trial left (rounded up)
  /** For a subscription that's been cancelled but is paid up: when access stops. */
  endsOn: Date | null;
  graceEndsAt: Date | null;
  lockedReason: LockedReason | null;
};

type BillingUser = Pick<
  User,
  | "role"
  | "billingExempt"
  | "trialEndsAt"
  | "createdAt"
  | "subscriptionStatus"
  | "subscriptionPeriodEnd"
  | "cancelAtPeriodEnd"
  | "paymentFailedAt"
>;

export function trialEnd(user: Pick<User, "trialEndsAt" | "createdAt">): Date {
  return user.trialEndsAt ?? new Date(user.createdAt.getTime() + trialDays() * DAY_MS);
}

export function entitlement(user: BillingUser, now: Date = new Date(), enforced: boolean = billingEnforced()): Entitlement {
  const base = { trialEndsAt: null, daysLeft: null, endsOn: null, graceEndsAt: null, lockedReason: null } as const;
  if (!enforced) return { ...base, state: "off", canWrite: true };
  if (user.role === "admin" || user.billingExempt) return { ...base, state: "exempt", canWrite: true };

  const end = trialEnd(user);
  const msLeft = end.getTime() - now.getTime();
  const trial = { trialEndsAt: end, daysLeft: msLeft > 0 ? Math.ceil(msLeft / DAY_MS) : 0 };

  const status = user.subscriptionStatus;
  if (status === "active" || status === "trialing") {
    return {
      ...base,
      ...trial,
      state: "subscribed",
      canWrite: true,
      endsOn: user.cancelAtPeriodEnd ? user.subscriptionPeriodEnd : null,
    };
  }
  if (status === "past_due") {
    const failedAt = user.paymentFailedAt ?? now;
    const graceEndsAt = new Date(failedAt.getTime() + GRACE_DAYS * DAY_MS);
    if (now < graceEndsAt) return { ...base, ...trial, state: "past_due", canWrite: true, graceEndsAt };
    return { ...base, ...trial, state: "locked", canWrite: false, lockedReason: "payment_failed", graceEndsAt };
  }

  // Never subscribed, or the subscription has ended: fall back to whatever trial is left
  if (msLeft > 0) return { ...base, ...trial, state: "trial", canWrite: true };
  const reason: LockedReason = status === "canceled" || status === "unpaid" || status === "incomplete_expired" ? "subscription_ended" : "trial_ended";
  return { ...base, ...trial, state: "locked", canWrite: false, lockedReason: reason };
}

/** e.g. "12 December 2026" */
export function fmtDate(d: Date): string {
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/London" }).format(d);
}

export function daysLabel(n: number): string {
  return n === 1 ? "1 day" : `${n} days`;
}
