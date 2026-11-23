// Sign-in rate limiting: how many wrong passwords are allowed, how long the wait is, what resets it, and that one person's
// failures never affect someone else.
import { describe, it, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { dbSkipReason, pointAppAtTestDatabase, resetAndMigrate } from "./helpers/testdb";

type Lib = typeof import("@/lib/sign-in-limit");
type Dbm = typeof import("@/db");

describe("visitorIp() and messages", () => {
  it("reads the first address in x-forwarded-for, then x-real-ip, else null", async () => {
    const { visitorIp } = await import("@/lib/sign-in-rules");
    const h = (o: Record<string, string>) => ({ get: (n: string) => o[n] ?? null });
    assert.equal(visitorIp(h({ "x-forwarded-for": "203.0.113.5, 10.0.0.1" })), "203.0.113.5");
    assert.equal(visitorIp(h({ "x-real-ip": "198.51.100.7" })), "198.51.100.7");
    assert.equal(visitorIp(h({})), null);
  });
  it("says how long to wait, in plain words", async () => {
    const { blockedMessage } = await import("@/lib/sign-in-rules");
    assert.match(blockedMessage(1), /wait 1 minute and/);
    assert.match(blockedMessage(7), /wait 7 minutes and/);
    assert.match(blockedMessage(7), /Forgot your password/);
  });
});

describe("sign-in limit (database)", { skip: dbSkipReason }, () => {
  let lib: Lib;
  let dbm: Dbm;
  const t0 = new Date("2026-11-23T10:00:00Z");
  const at = (mins: number) => new Date(t0.getTime() + mins * 60_000);

  before(async () => {
    const url = pointAppAtTestDatabase();
    await resetAndMigrate(url);
    dbm = await import("@/db");
    lib = await import("@/lib/sign-in-limit");
  });
  after(async () => { await dbm?.pool.end(); });
  beforeEach(async () => { await dbm.pool.query("delete from login_attempts"); delete process.env.SIGN_IN_LIMIT; });

  /** One wrong password. Returns the attempt result. */
  const wrong = (email: string, ip: string | null, now: Date) => lib.beginSignIn(email, ip, now);

  it("allows 8 wrong passwords for one email, then makes the 9th wait", async () => {
    for (let i = 0; i < lib.SIGN_IN_LIMITS.perEmail; i++) assert.equal((await wrong("a@example.com", null, at(i * 0.1))).allowed, true, `attempt ${i + 1}`);
    const ninth = await wrong("a@example.com", null, at(1));
    assert.equal(ninth.allowed, false);
  });

  it("the wait runs out: the first attempt expires after 15 minutes, so one more try is allowed", async () => {
    for (let i = 0; i < 8; i++) await wrong("a@example.com", null, at(i));
    const blocked = await wrong("a@example.com", null, at(8));
    assert.equal(blocked.allowed, false);
    // Attempt 1 was at minute 0, so it stops counting at minute 15.
    assert.equal(blocked.allowed === false && blocked.retryAfterMinutes, 7);
    assert.equal((await wrong("a@example.com", null, at(14.9))).allowed, false);
    assert.equal((await wrong("a@example.com", null, at(15.1))).allowed, true);
  });

  it("blocked attempts are not recorded, so hammering the form can't extend the wait", async () => {
    for (let i = 0; i < 8; i++) await wrong("a@example.com", null, at(0));
    for (let i = 0; i < 20; i++) assert.equal((await wrong("a@example.com", null, at(5))).allowed, false);
    const { rows } = await dbm.pool.query("select count(*)::int n from login_attempts where email='a@example.com'");
    assert.equal(rows[0].n, 8);
    assert.equal((await wrong("a@example.com", null, at(15.1))).allowed, true);
  });

  it("someone else's email isn't affected", async () => {
    for (let i = 0; i < 9; i++) await wrong("a@example.com", null, at(0));
    assert.equal((await wrong("b@example.com", null, at(0))).allowed, true);
  });

  it("email addresses match however they're typed", async () => {
    for (let i = 0; i < 8; i++) await wrong("  A@Example.com ", null, at(0));
    assert.equal((await wrong("a@example.com", null, at(0))).allowed, false);
  });

  it("a correct password clears that email's failures, and only that email's", async () => {
    for (let i = 0; i < 5; i++) await wrong("a@example.com", null, at(0));
    for (let i = 0; i < 3; i++) await wrong("b@example.com", null, at(0));
    const ok = await wrong("a@example.com", null, at(1));
    assert.equal(ok.allowed, true);
    await lib.finishSignIn("a@example.com", ok.allowed ? ok.attemptId : null, true);
    assert.equal(await lib.recentAttempts("a@example.com", at(1)), 0);
    assert.equal(await lib.recentAttempts("b@example.com", at(1)), 3);
  });

  it("a wrong password leaves its attempt on record", async () => {
    const a = await wrong("a@example.com", null, at(0));
    await lib.finishSignIn("a@example.com", a.allowed ? a.attemptId : null, false);
    assert.equal(await lib.recentAttempts("a@example.com", at(0)), 1);
  });

  it("clearFailedSignIns() (used after a password reset) lets a locked-out person back in", async () => {
    for (let i = 0; i < 9; i++) await wrong("a@example.com", null, at(0));
    assert.equal((await wrong("a@example.com", null, at(1))).allowed, false);
    await lib.clearFailedSignIns("A@example.com");
    assert.equal((await wrong("a@example.com", null, at(1))).allowed, true);
  });

  it("one network address is limited at 30 wrong passwords across different emails, but a different address is fine", async () => {
    for (let i = 0; i < lib.SIGN_IN_LIMITS.perIp; i++) assert.equal((await wrong(`u${i}@example.com`, "203.0.113.9", at(0))).allowed, true, `attempt ${i + 1}`);
    assert.equal((await wrong("x@example.com", "203.0.113.9", at(1))).allowed, false);
    assert.equal((await wrong("x@example.com", "198.51.100.1", at(1))).allowed, true);
  });

  it("with no readable address, only the per-email limit applies", async () => {
    for (let i = 0; i < 30; i++) assert.equal((await wrong(`u${i}@example.com`, null, at(0))).allowed, true);
  });

  it("a burst of simultaneous guesses can't all slip through", async () => {
    const results = await Promise.all(Array.from({ length: 30 }, () => wrong("a@example.com", null, at(0))));
    assert.ok(results.filter((r) => r.allowed).length <= lib.SIGN_IN_LIMITS.perEmail);
  });

  it("old attempts (over a day) are tidied away", async () => {
    await dbm.pool.query("insert into login_attempts (email, created_at) values ('old@example.com', $1)", [new Date(t0.getTime() - 25 * 3600_000)]);
    await wrong("a@example.com", null, t0);
    const { rows } = await dbm.pool.query("select count(*)::int n from login_attempts where email='old@example.com'");
    assert.equal(rows[0].n, 0);
  });

  it("SIGN_IN_LIMIT=off turns the limit off and records nothing", async () => {
    process.env.SIGN_IN_LIMIT = "off";
    for (let i = 0; i < 20; i++) assert.equal((await wrong("a@example.com", null, at(0))).allowed, true);
    const { rows } = await dbm.pool.query("select count(*)::int n from login_attempts");
    assert.equal(rows[0].n, 0);
  });
});
