import { createHmac, timingSafeEqual } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users, type User } from "@/db/schema";
import { pricePence } from "./billing";

// A small Stripe client using plain fetch (like the Resend email code), so there's no extra package to keep up to date.
// STRIPE_API_BASE only exists so the tests can point at a fake Stripe; leave it unset in real life.

const base = () => (process.env.STRIPE_API_BASE ?? "https://api.stripe.com").replace(/\/$/, "");

type Param = string | number | boolean | null | undefined | Param[] | { [k: string]: Param };

/** Stripe wants nested form fields like line_items[0][price_data][currency]=gbp */
export function formEncode(params: Record<string, Param>): string {
  const out: [string, string][] = [];
  const walk = (key: string, v: Param) => {
    if (v === undefined || v === null) return;
    if (Array.isArray(v)) v.forEach((x, i) => walk(`${key}[${i}]`, x));
    else if (typeof v === "object") for (const [k, x] of Object.entries(v)) walk(`${key}[${k}]`, x);
    else out.push([key, String(v)]);
  };
  for (const [k, v] of Object.entries(params)) walk(k, v);
  return out.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join("&");
}

async function call<T>(method: "GET" | "POST", path: string, params: Record<string, Param> = {}): Promise<T> {
  const body = formEncode(params);
  const res = await fetch(`${base()}${path}${method === "GET" && body ? `?${body}` : ""}`, {
    method,
    headers: {
      Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`,
      ...(method === "POST" ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
    },
    body: method === "POST" ? body : undefined,
    signal: AbortSignal.timeout(15_000),
  });
  const json = (await res.json().catch(() => null)) as (T & { error?: { message?: string } }) | null;
  if (!res.ok || !json) throw new Error(`Stripe ${method} ${path} failed (${res.status}): ${json?.error?.message ?? "no details"}`);
  return json;
}

// ---- Shapes we use (only the fields we read) ----
export type StripeSubscription = {
  id: string;
  status: string;
  customer: string | { id: string };
  cancel_at_period_end?: boolean;
  cancel_at?: number | null;
  current_period_end?: number; // older API versions
  items?: { data?: { current_period_end?: number }[] }; // newer API versions
  metadata?: Record<string, string>;
};
export type StripeCheckoutSession = {
  id: string;
  mode?: string;
  client_reference_id?: string | null;
  customer?: string | { id: string } | null;
  subscription?: string | StripeSubscription | null;
};
export type StripeEvent = { id: string; type: string; data: { object: Record<string, unknown> } };

const idOf = (v: string | { id: string } | null | undefined) => (typeof v === "string" ? v : v?.id ?? null);

// ---- Calls ----
export async function createCheckoutUrl(user: User, siteUrl: string): Promise<string> {
  const price = process.env.STRIPE_PRICE_ID?.trim();
  const session = await call<{ url: string }>("POST", "/v1/checkout/sessions", {
    mode: "subscription",
    client_reference_id: String(user.id),
    // {CHECKOUT_SESSION_ID} is filled in by Stripe, so we can confirm the payment as soon as they come back
    success_url: `${siteUrl}/billing?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${siteUrl}/billing`,
    line_items: [
      price
        ? { price, quantity: 1 }
        : {
            quantity: 1,
            price_data: { currency: "gbp", unit_amount: pricePence(), recurring: { interval: "month" }, product_data: { name: "Hidden Gems" } },
          },
    ],
    // Reuse their Stripe customer if they've subscribed before, otherwise pre-fill their email
    customer: user.stripeCustomerId ?? undefined,
    customer_email: user.stripeCustomerId ? undefined : user.email,
    subscription_data: { metadata: { user_id: String(user.id) } },
    metadata: { user_id: String(user.id) },
    custom_text: { submit: { message: "You'll be charged every month until you cancel. You can cancel at any time from the Billing page in the app." } },
  });
  return session.url;
}

export async function createPortalUrl(customerId: string, returnUrl: string): Promise<string> {
  const session = await call<{ url: string }>("POST", "/v1/billing_portal/sessions", { customer: customerId, return_url: returnUrl });
  return session.url;
}

export function retrieveCheckoutSession(id: string) {
  return call<StripeCheckoutSession>("GET", `/v1/checkout/sessions/${encodeURIComponent(id)}`, { expand: ["subscription"] });
}

export function retrieveSubscription(id: string) {
  return call<StripeSubscription>("GET", `/v1/subscriptions/${encodeURIComponent(id)}`);
}

// ---- Webhook signature check (https://docs.stripe.com/webhooks#verify-manually) ----
export function verifyWebhook(rawBody: string, header: string | null, secret: string, nowMs: number = Date.now(), toleranceSec = 300): boolean {
  if (!header) return false;
  let t = "";
  const sigs: string[] = [];
  for (const part of header.split(",")) {
    const [k, v] = part.split("=");
    if (k === "t") t = v ?? "";
    else if (k === "v1" && v) sigs.push(v);
  }
  const ts = Number(t);
  if (!Number.isFinite(ts) || !sigs.length) return false;
  if (Math.abs(nowMs / 1000 - ts) > toleranceSec) return false; // too old (or from the future): could be a replay
  const expected = createHmac("sha256", secret).update(`${t}.${rawBody}`).digest();
  return sigs.some((s) => {
    const got = Buffer.from(s, "hex");
    return got.length === expected.length && timingSafeEqual(got, expected);
  });
}

// ---- Keeping our database in step with Stripe ----
const periodEnd = (s: StripeSubscription): Date | null => {
  const sec = s.current_period_end ?? s.items?.data?.[0]?.current_period_end;
  return sec ? new Date(sec * 1000) : null;
};

/** Copies a Stripe subscription onto the matching user. Safe to run many times, and in any order. */
export async function applySubscription(sub: StripeSubscription, userIdHint?: number | null): Promise<boolean> {
  const customerId = idOf(sub.customer);
  const hint = userIdHint ?? (Number(sub.metadata?.user_id) || null);
  let user: User | undefined;
  if (hint) [user] = await db.select().from(users).where(eq(users.id, hint)).limit(1);
  if (!user && customerId) [user] = await db.select().from(users).where(eq(users.stripeCustomerId, customerId)).limit(1);
  if (!user) return false;

  // If they've re-subscribed, a late "cancelled" message about their OLD subscription mustn't undo the new one
  if (user.stripeSubscriptionId && user.stripeSubscriptionId !== sub.id && sub.status === "canceled") return true;

  const healthy = sub.status === "active" || sub.status === "trialing";
  await db
    .update(users)
    .set({
      stripeCustomerId: customerId ?? user.stripeCustomerId,
      stripeSubscriptionId: sub.id,
      subscriptionStatus: sub.status,
      subscriptionPeriodEnd: periodEnd(sub),
      cancelAtPeriodEnd: !!sub.cancel_at_period_end || !!sub.cancel_at,
      paymentFailedAt: healthy ? null : user.paymentFailedAt,
    })
    .where(eq(users.id, user.id));
  return true;
}

/** A payment failed: start the grace period (once). A payment worked: clear it. */
export async function markPayment(customerId: string, failed: boolean): Promise<void> {
  const [user] = await db.select().from(users).where(eq(users.stripeCustomerId, customerId)).limit(1);
  if (!user) return;
  if (failed) {
    if (!user.paymentFailedAt) await db.update(users).set({ paymentFailedAt: new Date() }).where(eq(users.id, user.id));
  } else if (user.paymentFailedAt) {
    await db.update(users).set({ paymentFailedAt: null }).where(eq(users.id, user.id));
  }
}

/** Handles one verified Stripe event. Anything we don't care about is ignored. */
export async function handleStripeEvent(event: StripeEvent): Promise<void> {
  const obj = event.data.object;
  switch (event.type) {
    case "checkout.session.completed": {
      const session = obj as unknown as StripeCheckoutSession;
      if (session.mode !== "subscription") return;
      const subId = idOf(session.subscription as string | { id: string } | null);
      if (!subId) return;
      await applySubscription(await retrieveSubscription(subId), Number(session.client_reference_id) || null);
      return;
    }
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted":
      await applySubscription(obj as unknown as StripeSubscription);
      return;
    case "invoice.payment_failed":
    case "invoice.paid": {
      const customer = idOf(obj.customer as string | { id: string } | null);
      if (customer) await markPayment(customer, event.type === "invoice.payment_failed");
      return;
    }
  }
}
