"use server";

import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { billingEnforced } from "@/lib/billing";
import { appUrl } from "@/lib/email";
import { createCheckoutUrl, createPortalUrl } from "@/lib/stripe";

/** "Subscribe": sends them to Stripe's secure payment page. We never see their card details. */
export async function startCheckoutAction() {
  const user = await requireUser();
  if (!billingEnforced()) redirect("/billing");
  // Already paying? Send them to manage it instead of starting a second subscription
  if (user.stripeCustomerId && (user.subscriptionStatus === "active" || user.subscriptionStatus === "past_due" || user.subscriptionStatus === "trialing")) {
    return openPortalAction();
  }
  let url: string;
  try {
    url = await createCheckoutUrl(user, await appUrl());
  } catch (e) {
    console.error("Couldn't start checkout", e);
    redirect("/billing?error=1");
  }
  redirect(url);
}

/** "Manage subscription": Stripe's page for changing card, seeing receipts and cancelling. */
export async function openPortalAction() {
  const user = await requireUser();
  if (!billingEnforced() || !user.stripeCustomerId) redirect("/billing");
  let url: string;
  try {
    url = await createPortalUrl(user.stripeCustomerId, `${await appUrl()}/billing`);
  } catch (e) {
    console.error("Couldn't open the billing portal", e);
    redirect("/billing?error=1");
  }
  redirect(url);
}
