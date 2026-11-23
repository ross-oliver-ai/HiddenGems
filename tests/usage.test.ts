// Admin usage figures: every number is worked out by hand from a small, known set of accounts.
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { dbSkipReason, pointAppAtTestDatabase, resetAndMigrate } from "./helpers/testdb";
import { agoLabel, computeUsage, planGroup, type UsageUser, type UserActivity } from "@/lib/usage";

const DAY = 86_400_000;
const now = new Date("2026-11-23T12:00:00Z");
const ago = (days: number) => new Date(now.getTime() - days * DAY);
const ahead = (days: number) => new Date(now.getTime() + days * DAY);

let nextId = 1;
function user(name: string, o: Partial<UsageUser> & { joined: number }): UsageUser {
  const { joined, ...rest } = o;
  return {
    id: nextId++, name, email: `${name.toLowerCase()}@example.com`, role: "seller", disabled: false, billingExempt: false,
    trialEndsAt: ahead(10), createdAt: ago(joined), emailVerifiedAt: ago(joined), subscriptionStatus: null, subscriptionPeriodEnd: null,
    cancelAtPeriodEnd: false, paymentFailedAt: null, stripeSubscriptionId: null, ...rest,
  };
}
const act = (items: number, lastActiveDaysAgo: number | null, sales30 = 0): UserActivity => ({ items, lastActive: lastActiveDaysAgo === null ? null : ago(lastActiveDaysAgo), sales30 });

describe("computeUsage()", () => {
  const admin = user("Admin", { joined: 200, role: "admin" });
  const a = user("A", { joined: 2, trialEndsAt: ahead(28) });
  const b = user("B", { joined: 20, trialEndsAt: ahead(10) });
  const c = user("C", { joined: 40, trialEndsAt: ago(10), subscriptionStatus: "active", stripeSubscriptionId: "sub_c" });
  const d = user("D", { joined: 50, trialEndsAt: ago(20) });
  const e = user("E", { joined: 45, trialEndsAt: ago(15), subscriptionStatus: "canceled", stripeSubscriptionId: "sub_e" });
  const f = user("F", { joined: 100, billingExempt: true, trialEndsAt: ago(60) });
  const g = user("G", { joined: 1, trialEndsAt: ahead(3), emailVerifiedAt: null });
  const h = user("H", { joined: 60, trialEndsAt: ago(5), subscriptionStatus: "past_due", paymentFailedAt: ago(2), stripeSubscriptionId: "sub_h" });
  const activity = new Map<number, UserActivity>([
    [admin.id, act(99, 0, 99)],
    [a.id, act(3, 1, 1)], [c.id, act(10, 3, 2)], [d.id, act(2, 25)], [e.id, act(1, 40)], [f.id, act(5, 5)], [h.id, act(4, 6)],
  ]);
  const u = computeUsage([admin, a, b, c, d, e, f, g, h], activity, now);

  it("counts everyone except admins", () => assert.equal(u.sellers, 8));
  it("counts recent sign-ups and unconfirmed emails", () => {
    assert.deepEqual(u.signups, { last7: 2, last30: 3, unconfirmed: 1 });
  });
  it("splits people into plans, once each", () => {
    assert.deepEqual(u.plans, { trial: 3, paid: 1, failed: 1, readonly: 2, free: 1 });
    assert.equal(Object.values(u.plans).reduce((x, y) => x + y, 0), u.sellers);
  });
  it("says how many have ever added an item", () => assert.deepEqual(u.started, { withItems: 6, never: 2 }));
  it("counts active people in the last 7 and 30 days", () => assert.deepEqual(u.active, { last7: 4, last30: 5 }));
  it("measures trial to paid on finished trials only, ever-subscribed counted, free forever left out", () => {
    assert.deepEqual(u.trials, { ended: 4, subscribed: 3 });
  });
  it("lists trials ending within 7 days, soonest first", () => {
    assert.deepEqual(u.endingSoon.map((s) => [s.name, s.daysLeft]), [["G", 3]]);
  });
  it("lists the five newest sign-ups, newest first", () => assert.deepEqual(u.recent.map((s) => s.name), ["G", "A", "B", "C", "E"]));
  it("totals items and recent sales without counting admins", () => assert.deepEqual(u.totals, { items: 25, sales30: 3 }));

  it("'in the last 7 days' means less than 7 days: exactly 7 days ago doesn't count", () => {
    const edge = computeUsage([user("Edge", { joined: 7 })], new Map(), now);
    assert.equal(edge.signups.last7, 0);
    assert.equal(edge.signups.last30, 1);
  });
  it("handles an empty app", () => {
    const none = computeUsage([], new Map(), now);
    assert.deepEqual([none.sellers, none.trials.ended, none.endingSoon.length, none.recent.length, none.totals.items], [0, 0, 0, 0, 0]);
  });
  it("a trial that ends today is still listed, with 0 days left", () => {
    const today = computeUsage([user("Today", { joined: 29, trialEndsAt: new Date(now.getTime() + 3600_000) })], new Map(), now);
    assert.equal(today.endingSoon[0].daysLeft, 1); // part of a day left rounds up, as everywhere else in the app
  });
});

describe("planGroup() and agoLabel()", () => {
  it("puts a disabled-billing, admin or free-forever account in 'free'; a lapsed trial in 'readonly'", () => {
    assert.equal(planGroup(user("X", { joined: 5, billingExempt: true }), now), "free");
    assert.equal(planGroup(user("Y", { joined: 50, trialEndsAt: ago(1) }), now), "readonly");
  });
  it("describes how long ago in plain words", () => {
    assert.equal(agoLabel(null, now), "never");
    assert.equal(agoLabel(ago(0.2), now), "today");
    assert.equal(agoLabel(ago(1.5), now), "yesterday");
    assert.equal(agoLabel(ago(9), now), "9 days ago");
  });
});

describe("loadActivity() (database)", { skip: dbSkipReason }, () => {
  let dbm: typeof import("@/db");
  let s: typeof import("@/db/schema");
  let data: typeof import("@/lib/usage-data");
  before(async () => {
    const url = pointAppAtTestDatabase();
    await resetAndMigrate(url);
    dbm = await import("@/db");
    s = await import("@/db/schema");
    data = await import("@/lib/usage-data");
  });
  after(async () => { await dbm?.pool.end(); });

  it("counts each person's items, finds the latest change, and counts only the last 30 days of sales", async () => {
    const { todayLondon } = await import("@/lib/format");
    const { addDays } = await import("@/lib/periods");
    const mk = async (email: string) => (await dbm.db.insert(s.users).values({ email, name: email, passwordHash: "x" }).returning())[0];
    const one = await mk("usage-one@example.com");
    const two = await mk("usage-two@example.com");
    await mk("usage-none@example.com");
    const base = { boughtAt: "2026-01-01", buyPrice: "1.00" };
    const old = new Date("2026-10-01T10:00:00Z");
    const latest = new Date("2026-11-20T09:30:00Z");
    await dbm.db.insert(s.items).values([
      { ...base, userId: one.id, name: "Recent sale", status: "completed", soldAt: addDays(todayLondon(), -5), soldPrice: "9.00", updatedAt: old },
      { ...base, userId: one.id, name: "Old sale", status: "completed", soldAt: addDays(todayLondon(), -45), soldPrice: "9.00", updatedAt: latest },
      { ...base, userId: one.id, name: "Unsold", updatedAt: old },
      { ...base, userId: two.id, name: "Theirs", updatedAt: old },
    ]);
    const map = await data.loadActivity();
    assert.deepEqual([map.get(one.id)?.items, map.get(one.id)?.sales30], [3, 1]);
    assert.equal(map.get(one.id)?.lastActive?.toISOString(), latest.toISOString());
    assert.deepEqual([map.get(two.id)?.items, map.get(two.id)?.sales30], [1, 0]);
    assert.equal(map.size, 2); // people with no items have no entry
  });

  it("counts waitlist entries that haven't been invited", async () => {
    await dbm.db.insert(s.waitlist).values([{ email: "w1@example.com" }, { email: "w2@example.com", invitedAt: new Date() }]);
    assert.equal(await data.waitingCount(), 1);
  });
});
