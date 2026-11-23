// Usage figures for the admin: sign-ups, who is actually using the app, plans, and how many trials turn into subscriptions.
// Everything here is plain arithmetic on rows passed in, so it can be tested with hand-checkable numbers; the database part is
// in usage-data.ts. "Active" means the person added or changed an item (items.updated_at). Nothing is tracked about page views.
import type { User } from "@/db/schema";
import { DAY_MS, entitlement, trialEnd } from "./billing";

export type UsageUser = Pick<
  User,
  | "id" | "name" | "email" | "role" | "disabled" | "billingExempt" | "trialEndsAt" | "createdAt" | "emailVerifiedAt"
  | "subscriptionStatus" | "subscriptionPeriodEnd" | "cancelAtPeriodEnd" | "paymentFailedAt" | "stripeSubscriptionId"
>;

/** What one person has done in the app (people with no items have no entry). */
export type UserActivity = { items: number; lastActive: Date | null; sales30: number };

export type PlanGroup = "trial" | "paid" | "failed" | "readonly" | "free";

export const PLAN_GROUP_LABEL: Record<PlanGroup, string> = {
  trial: "On trial",
  paid: "Paid",
  failed: "Payment failed",
  readonly: "Read-only",
  free: "Free forever",
};

/** Which plan box a seller belongs in. Always works out the plan as if billing were switched on. */
export function planGroup(u: UsageUser, now: Date): PlanGroup {
  const state = entitlement(u, now, true).state;
  if (state === "exempt") return "free";
  if (state === "subscribed") return "paid";
  if (state === "past_due") return "failed";
  if (state === "trial") return "trial";
  return "readonly";
}

export const NO_ACTIVITY: UserActivity = { items: 0, lastActive: null, sales30: 0 };

/** "today", "yesterday", "5 days ago", or "never" */
export function agoLabel(d: Date | null, now: Date): string {
  if (!d) return "never";
  const days = Math.floor((now.getTime() - d.getTime()) / DAY_MS);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  return `${days} days ago`;
}

export type UsageSeller = { id: number; name: string; email: string; createdAt: Date; group: PlanGroup; items: number; lastActive: Date | null };

export type Usage = {
  /** Everyone except admins */
  sellers: number;
  signups: { last7: number; last30: number; unconfirmed: number };
  plans: Record<PlanGroup, number>;
  /** Of all sellers: how many have added at least one item, and how many never have */
  started: { withItems: number; never: number };
  active: { last7: number; last30: number };
  /** Of the sellers whose free trial has ended (not counting free forever): how many ever subscribed */
  trials: { ended: number; subscribed: number };
  endingSoon: (UsageSeller & { daysLeft: number })[];
  recent: UsageSeller[];
  totals: { items: number; sales30: number };
};

const within = (d: Date | null, now: Date, days: number) => !!d && now.getTime() - d.getTime() < days * DAY_MS;

export function computeUsage(users: UsageUser[], activity: Map<number, UserActivity>, now: Date): Usage {
  const sellers = users.filter((u) => u.role !== "admin");
  const rows: UsageSeller[] = sellers.map((u) => {
    const a = activity.get(u.id) ?? NO_ACTIVITY;
    return { id: u.id, name: u.name, email: u.email, createdAt: u.createdAt, group: planGroup(u, now), items: a.items, lastActive: a.lastActive };
  });

  const plans: Record<PlanGroup, number> = { trial: 0, paid: 0, failed: 0, readonly: 0, free: 0 };
  for (const r of rows) plans[r.group]++;

  const trialsEnded = sellers.filter((u) => !u.billingExempt && trialEnd(u).getTime() <= now.getTime());
  const endingSoon = sellers
    .map((u, i) => ({ u, r: rows[i] }))
    .filter(({ r }) => r.group === "trial")
    .map(({ u, r }) => ({ ...r, daysLeft: entitlement(u, now, true).daysLeft ?? 0 }))
    .filter((r) => r.daysLeft <= 7)
    .sort((a, b) => a.daysLeft - b.daysLeft || a.name.localeCompare(b.name));

  const sums = [...activity.entries()].reduce((t, [id, a]) => (sellers.some((u) => u.id === id) ? { items: t.items + a.items, sales30: t.sales30 + a.sales30 } : t), { items: 0, sales30: 0 });

  return {
    sellers: sellers.length,
    signups: {
      last7: sellers.filter((u) => within(u.createdAt, now, 7)).length,
      last30: sellers.filter((u) => within(u.createdAt, now, 30)).length,
      unconfirmed: sellers.filter((u) => !u.emailVerifiedAt).length,
    },
    plans,
    started: { withItems: rows.filter((r) => r.items > 0).length, never: rows.filter((r) => r.items === 0).length },
    active: { last7: rows.filter((r) => within(r.lastActive, now, 7)).length, last30: rows.filter((r) => within(r.lastActive, now, 30)).length },
    trials: { ended: trialsEnded.length, subscribed: trialsEnded.filter((u) => !!u.stripeSubscriptionId).length },
    endingSoon,
    recent: [...rows].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || b.id - a.id).slice(0, 5),
    totals: sums,
  };
}
