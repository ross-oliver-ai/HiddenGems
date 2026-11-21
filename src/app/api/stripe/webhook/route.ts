import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { stripeEvents } from "@/db/schema";
import { handleStripeEvent, verifyWebhook, type StripeEvent } from "@/lib/stripe";

// Stripe calls this when someone pays, cancels, or a payment fails. It's the only thing that can unlock an account,
// so the signature is checked before anything is read from the message.
export async function POST(request: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) return NextResponse.json({ error: "Not configured" }, { status: 501 });

  const raw = await request.text();
  if (!verifyWebhook(raw, request.headers.get("stripe-signature"), secret)) {
    return NextResponse.json({ error: "Bad signature" }, { status: 400 });
  }

  let event: StripeEvent;
  try {
    event = JSON.parse(raw) as StripeEvent;
  } catch {
    return NextResponse.json({ error: "Bad body" }, { status: 400 });
  }

  // Stripe can send the same event twice
  const [seen] = await db.select({ id: stripeEvents.id }).from(stripeEvents).where(eq(stripeEvents.id, event.id)).limit(1);
  if (seen) return NextResponse.json({ received: true, duplicate: true });

  try {
    await handleStripeEvent(event);
  } catch (e) {
    console.error("Stripe webhook failed", event.type, e);
    return NextResponse.json({ error: "Failed" }, { status: 500 }); // Stripe will try again later
  }
  await db.insert(stripeEvents).values({ id: event.id, type: event.type }).onConflictDoNothing();
  return NextResponse.json({ received: true });
}
