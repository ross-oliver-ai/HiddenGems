// The free trial / read-only lock rules. These decide who can write and who is locked out, so they are pinned down hard.
import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { entitlement, billingEnforced, trialDays, pricePence, priceLabel, DAY_MS } from "@/lib/billing";

const NOW = new Date("2026-11-22T12:00:00Z");
const days = (n: number) => new Date(NOW.getTime() + n * DAY_MS);

function user(over: Partial<Parameters<typeof entitlement>[0]> = {}): Parameters<typeof entitlement>[0] {
  return {
    role: "seller",
    billingExempt: false,
    trialEndsAt: days(20),
    createdAt: days(-10),
    subscriptionStatus: null,
    subscriptionPeriodEnd: null,
    cancelAtPeriodEnd: false,
    paymentFailedAt: null,
    ...over,
  };
}
const ent = (u = user()) => entitlement(u, NOW, true);

describe("entitlement()", () => {
  it("everyone has full access when billing is not enforced, even with an expired trial", () => {
    const e = entitlement(user({ trialEndsAt: days(-30) }), NOW, false);
    assert.equal(e.state, "off");
    assert.equal(e.canWrite, true);
  });

  it("admins and free-forever accounts are never locked", () => {
    for (const u of [user({ role: "admin", trialEndsAt: days(-99) }), user({ billingExempt: true, trialEndsAt: days(-99) })]) {
      const e = ent(u);
      assert.equal(e.state, "exempt");
      assert.equal(e.canWrite, true);
    }
  });

  it("an account in its trial can write and shows whole days left", () => {
    const e = ent();
    assert.equal(e.state, "trial");
    assert.equal(e.canWrite, true);
    assert.equal(e.daysLeft, 20);
    assert.equal(e.lockedReason, null);
  });

  it("days left rounds up, so the last partial day still counts as 1", () => {
    assert.equal(ent(user({ trialEndsAt: new Date(NOW.getTime() + 12 * 3_600_000) })).daysLeft, 1);
  });

  it("locks read-only the moment the trial ends", () => {
    const e = ent(user({ trialEndsAt: NOW }));
    assert.equal(e.state, "locked");
    assert.equal(e.canWrite, false);
    assert.equal(e.lockedReason, "trial_ended");
    assert.equal(e.daysLeft, 0);
  });

  it("falls back to created_at + trial length when no trial end is stored", () => {
    delete process.env.TRIAL_DAYS;
    assert.equal(ent(user({ trialEndsAt: null, createdAt: days(-29) })).state, "trial");
    assert.equal(ent(user({ trialEndsAt: null, createdAt: days(-31) })).state, "locked");
  });

  it("an active subscription can write even after the trial has ended", () => {
    const e = ent(user({ trialEndsAt: days(-50), subscriptionStatus: "active" }));
    assert.equal(e.state, "subscribed");
    assert.equal(e.canWrite, true);
    assert.equal(e.endsOn, null);
  });

  it("'trialing' counts as subscribed", () => {
    assert.equal(ent(user({ subscriptionStatus: "trialing" })).state, "subscribed");
  });

  it("a cancelled-but-paid-up subscription can still write and reports when access stops", () => {
    const end = days(9);
    const e = ent(user({ trialEndsAt: days(-50), subscriptionStatus: "active", cancelAtPeriodEnd: true, subscriptionPeriodEnd: end }));
    assert.equal(e.state, "subscribed");
    assert.equal(e.canWrite, true);
    assert.equal(e.endsOn?.getTime(), end.getTime());
  });

  it("a failed payment keeps full access during the grace period", () => {
    const failedAt = days(-3);
    const e = ent(user({ trialEndsAt: days(-50), subscriptionStatus: "past_due", paymentFailedAt: failedAt }));
    assert.equal(e.state, "past_due");
    assert.equal(e.canWrite, true);
    assert.equal(e.graceEndsAt?.getTime(), failedAt.getTime() + 7 * DAY_MS, "the promise to customers is a 7 day grace period");
  });

  it("is still open on day 6 and locks after day 7 (hard-coded: this is the promise made to customers)", () => {
    const open = ent(user({ trialEndsAt: days(-50), subscriptionStatus: "past_due", paymentFailedAt: days(-6) }));
    assert.equal(open.canWrite, true);
    const e = ent(user({ trialEndsAt: days(-50), subscriptionStatus: "past_due", paymentFailedAt: days(-8) }));
    assert.equal(e.state, "locked");
    assert.equal(e.canWrite, false);
    assert.equal(e.lockedReason, "payment_failed");
  });

  it("past_due with no recorded failure time starts the grace period now (never locks instantly)", () => {
    const e = ent(user({ trialEndsAt: days(-50), subscriptionStatus: "past_due", paymentFailedAt: null }));
    assert.equal(e.state, "past_due");
    assert.equal(e.canWrite, true);
  });

  it("an ended subscription locks with the right reason once the trial is over", () => {
    for (const status of ["canceled", "unpaid", "incomplete_expired"]) {
      const e = ent(user({ trialEndsAt: days(-5), subscriptionStatus: status }));
      assert.equal(e.state, "locked", status);
      assert.equal(e.lockedReason, "subscription_ended", status);
    }
  });

  it("someone who never paid and whose trial is over is locked as 'trial_ended'", () => {
    assert.equal(ent(user({ trialEndsAt: days(-5), subscriptionStatus: "incomplete" })).lockedReason, "trial_ended");
  });

  it("a cancelled subscriber with trial time still left falls back to the trial", () => {
    const e = ent(user({ trialEndsAt: days(4), subscriptionStatus: "canceled" }));
    assert.equal(e.state, "trial");
    assert.equal(e.canWrite, true);
  });
});

describe("billing settings from environment variables", () => {
  const keys = ["BILLING_ENABLED", "STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET", "TRIAL_DAYS", "PRICE_PENCE"] as const;
  const saved: Record<string, string | undefined> = {};
  beforeEach(() => { for (const k of keys) { saved[k] = process.env[k]; delete process.env[k]; } });
  afterEach(() => { for (const k of keys) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; } });

  it("limits are only enforced when billing is switched on AND both Stripe keys are present", () => {
    assert.equal(billingEnforced(), false);
    process.env.BILLING_ENABLED = "true";
    assert.equal(billingEnforced(), false, "no Stripe keys");
    process.env.STRIPE_SECRET_KEY = "sk_test_x";
    assert.equal(billingEnforced(), false, "no webhook secret");
    process.env.STRIPE_WEBHOOK_SECRET = "whsec_x";
    assert.equal(billingEnforced(), true);
    process.env.BILLING_ENABLED = "false";
    assert.equal(billingEnforced(), false, "switched off");
  });

  it("trial length defaults to 30 days and ignores nonsense values", () => {
    assert.equal(trialDays(), 30);
    for (const bad of ["0", "-5", "400", "abc", "7.5"]) { process.env.TRIAL_DAYS = bad; assert.equal(trialDays(), 30, bad); }
    process.env.TRIAL_DAYS = "14";
    assert.equal(trialDays(), 14);
  });

  it("price defaults to £3 and formats pence sensibly", () => {
    assert.equal(pricePence(), 300);
    assert.equal(priceLabel(), "£3");
    process.env.PRICE_PENCE = "450";
    assert.equal(priceLabel(), "£4.50");
    process.env.PRICE_PENCE = "50"; // below the minimum, ignored
    assert.equal(pricePence(), 300);
  });
});
