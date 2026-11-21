import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { billingEnforced, daysLabel, entitlement, fmtDate, priceLabel } from "@/lib/billing";
import { applySubscription, retrieveCheckoutSession } from "@/lib/stripe";
import { SubmitButton } from "@/components/SubmitButton";
import { openPortalAction, startCheckoutAction } from "./actions";

export const metadata: Metadata = { title: "Billing · Hidden Gems" };

export default async function BillingPage({ searchParams }: { searchParams: Promise<{ session_id?: string; locked?: string; error?: string; subscribed?: string }> }) {
  let user = await requireUser();
  const sp = await searchParams;

  // Back from Stripe's payment page: confirm the payment straight away rather than waiting for Stripe's message to arrive
  if (sp.session_id && billingEnforced()) {
    try {
      const session = await retrieveCheckoutSession(sp.session_id);
      if (session.client_reference_id === String(user.id) && session.subscription && typeof session.subscription !== "string") {
        await applySubscription(session.subscription, user.id);
      }
    } catch (e) {
      console.error("Couldn't confirm checkout", e);
    }
    redirect("/billing?subscribed=1"); // so refreshing the page doesn't repeat this
  }
  [user] = await db.select().from(users).where(eq(users.id, user.id)).limit(1);

  const ent = entitlement(user);
  const price = priceLabel();

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-extrabold tracking-tight">Billing</h1>

      {sp.subscribed && ent.state === "subscribed" && (
        <p role="status" className="rounded-xl bg-success/10 px-3 py-2 text-sm font-semibold text-success">🎉 Thank you! You&apos;re subscribed.</p>
      )}
      {sp.subscribed && ent.state !== "subscribed" && (
        <p role="status" className="rounded-xl bg-warning/15 px-3 py-2 text-sm font-semibold text-warning">
          We&apos;re just confirming your payment. Refresh this page in a minute.
        </p>
      )}
      {sp.error && <p role="alert" className="rounded-xl bg-danger/10 px-3 py-2 text-sm font-semibold text-danger">Something went wrong talking to the payment page. Please try again.</p>}

      <section className="card space-y-3">
        {ent.state === "off" && (
          <>
            <h2 className="font-extrabold">Free during the trial</h2>
            <p className="text-sm text-muted">Hidden Gems is free to use at the moment.</p>
          </>
        )}

        {ent.state === "exempt" && (
          <>
            <h2 className="font-extrabold">Free account 💎</h2>
            <p className="text-sm text-muted">Your account is free, with nothing to pay. Thank you for helping us test Hidden Gems.</p>
          </>
        )}

        {ent.state === "trial" && ent.trialEndsAt && (
          <>
            <h2 className="font-extrabold">Free trial: {daysLabel(ent.daysLeft ?? 0)} left</h2>
            <p className="text-sm text-muted">
              Your free trial ends on {fmtDate(ent.trialEndsAt)}. You don&apos;t need to do anything now, and you won&apos;t be charged unless you subscribe.
            </p>
            <p className="text-sm text-muted">
              After that it&apos;s {price} a month. If you don&apos;t subscribe, your account becomes read-only: your data stays safe and you can still download it as a spreadsheet.
            </p>
            <form action={startCheckoutAction}>
              <SubmitButton>Subscribe for {price}/month</SubmitButton>
            </form>
            <p className="text-xs text-muted">Your first payment is taken when you subscribe, and the remaining days of your trial don&apos;t carry over, so it&apos;s best to wait until your trial is nearly over. Cancel any time.</p>
          </>
        )}

        {ent.state === "subscribed" && (
          <>
            <h2 className="font-extrabold">Subscribed ✓</h2>
            {ent.endsOn ? (
              <p className="text-sm text-muted">Your subscription is cancelled. You can keep using Hidden Gems until {fmtDate(ent.endsOn)}, and you won&apos;t be charged again.</p>
            ) : (
              <p className="text-sm text-muted">
                {price} a month{user.subscriptionPeriodEnd ? `, next payment around ${fmtDate(user.subscriptionPeriodEnd)}` : ""}. Cancel any time.
              </p>
            )}
            <form action={openPortalAction}>
              <SubmitButton className="btn-soft w-full">Manage subscription</SubmitButton>
            </form>
          </>
        )}

        {ent.state === "past_due" && (
          <>
            <h2 className="font-extrabold text-warning">Your last payment didn&apos;t go through</h2>
            <p className="text-sm text-muted">
              Please update your card{ent.graceEndsAt ? ` by ${fmtDate(ent.graceEndsAt)}` : ""} to keep adding and editing items. We&apos;ll try the payment again automatically once you do.
            </p>
            <form action={openPortalAction}>
              <SubmitButton>Update payment details</SubmitButton>
            </form>
          </>
        )}

        {ent.state === "locked" && (
          <>
            <h2 className="font-extrabold text-danger">
              {ent.lockedReason === "trial_ended" ? "Your free trial has ended" : ent.lockedReason === "payment_failed" ? "Your payment didn't go through" : "Your subscription has ended"}
            </h2>
            <p className="text-sm text-muted">
              Your account is read-only for now. You can still look at everything and download it, but you can&apos;t add or edit items. Subscribe for {price} a month to pick up where you left off, with all your data right where you left it.
            </p>
            <form action={user.stripeCustomerId && ent.lockedReason === "payment_failed" ? openPortalAction : startCheckoutAction}>
              <SubmitButton>{ent.lockedReason === "payment_failed" ? "Update payment details" : `Subscribe for ${price}/month`}</SubmitButton>
            </form>
          </>
        )}
      </section>

      {ent.state !== "off" && ent.state !== "exempt" && (
        <section className="card space-y-2">
          <h2 className="font-extrabold">Your data is yours</h2>
          <p className="text-sm text-muted">Download everything you&apos;ve entered as a spreadsheet at any time, whatever your plan.</p>
          <a href="/reports/export" className="btn-soft w-full">Download my items (CSV)</a>
        </section>
      )}

      <p className="text-center text-xs text-muted">
        Payments are handled securely by Stripe; we never see your card details. See our <Link href="/terms" className="font-bold text-primary">terms</Link>.
      </p>
    </div>
  );
}
