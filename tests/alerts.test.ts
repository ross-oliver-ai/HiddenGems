// Error alerts: what is scrubbed, when an email is (and isn't) sent, and that reporting can never make things worse.
import { describe, it, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { dbSkipReason, pointAppAtTestDatabase, resetAndMigrate } from "./helpers/testdb";
import { ALERT_COOLDOWN_MS, DAILY_ALERT_CAP, isNormalControlFlow, scrub, scrubRoute, signatureFor } from "@/lib/alert-rules";

describe("scrub()", () => {
  it("replaces email addresses", () => assert.equal(scrub("duplicate key for jane.doe+x@example.co.uk"), "duplicate key for [email]"));
  it("keeps a link's path but drops its query string and anything after #", () => {
    assert.equal(scrub("fetch failed https://api.example.com/v1/things?token=abc123&email=a@b.com#frag"), "fetch failed https://api.example.com/v1/things");
  });
  it("drops everything after 'params:', where the ORM prints the query's values", () => {
    const m = 'Failed query: insert into "users" ("email", "password_hash") values ($1, $2)\nparams: jane@example.com,$2b$10$abcdefghijklmnopqrstuv';
    const out = scrub(m);
    assert.ok(!out.includes("jane") && !out.includes("$2b") && !out.includes("params"), out);
    assert.match(out, /Failed query: insert into/);
  });
  it("hides long tokens, Stripe ids and long numbers", () => {
    assert.equal(scrub("bad token abcdefghijklmnopqrstuvwxyz0123456789"), "bad token [token]");
    assert.equal(scrub("no such customer cus_Qabc123XYZ789"), "no such customer [stripe-id]");
    assert.equal(scrub("card 4242424242424242"), "card [number]");
  });
  it("collapses whitespace and shortens to 300 characters", () => {
    assert.equal(scrub("a \n\n  b"), "a b");
    const long = scrub("word ".repeat(200));
    assert.equal(long.length, 300);
    assert.ok(long.endsWith("…"));
  });
  it("copes with odd input", () => {
    assert.equal(scrub(undefined as unknown as string), "");
    assert.equal(scrub(""), "");
  });
});

describe("scrubRoute() and signatureFor()", () => {
  it("drops query strings and flattens ids, so one page is one place", () => {
    assert.equal(scrubRoute("/items/12?email=a@b.com"), "/items/#");
    assert.equal(scrubRoute("/items/57/edit"), "/items/#/edit");
    assert.equal(scrubRoute(undefined), null);
  });
  it("gives the same signature to the same problem with different numbers, and different ones to different problems", () => {
    const a = signatureFor("render", "/items/1", new Error("Item 12 not found"));
    assert.equal(a, signatureFor("render", "/items/99", new Error("Item 4071 not found")));
    assert.notEqual(a, signatureFor("action", "/items/1", new Error("Item 12 not found")));
    assert.notEqual(a, signatureFor("render", "/reports", new Error("Item 12 not found")));
    assert.notEqual(a, signatureFor("render", "/items/1", new TypeError("Item 12 not found")));
    assert.notEqual(a, signatureFor("render", "/items/1", new Error("Something else")));
  });
  it("never puts an email address in a signature", () => assert.ok(!signatureFor("route", null, new Error("x for a@b.com")).includes("a@b.com")));
});

describe("isNormalControlFlow()", () => {
  it("treats redirects and not-found as normal, and real errors as not", () => {
    assert.equal(isNormalControlFlow(Object.assign(new Error("NEXT_REDIRECT"), { digest: "NEXT_REDIRECT;replace;/login;307;" })), true);
    assert.equal(isNormalControlFlow(Object.assign(new Error("x"), { digest: "NEXT_NOT_FOUND" })), true);
    assert.equal(isNormalControlFlow(Object.assign(new Error("x"), { digest: "3489201" })), false);
    assert.equal(isNormalControlFlow(new Error("x")), false);
  });
});

describe("recording and emailing alerts (database)", { skip: dbSkipReason }, () => {
  let dbm: typeof import("@/db");
  let s: typeof import("@/db/schema");
  let al: typeof import("@/lib/alerts");

  before(async () => {
    const url = pointAppAtTestDatabase();
    await resetAndMigrate(url);
    dbm = await import("@/db");
    s = await import("@/db/schema");
    al = await import("@/lib/alerts");
  });
  beforeEach(async () => {
    await dbm.pool.query("delete from error_alerts");
    delete process.env.ALERTS;
    delete process.env.ALERT_EMAIL;
  });

  const T0 = new Date("2026-11-23T12:00:00Z");
  const minutes = (m: number) => new Date(T0.getTime() + m * 60_000);
  function fake(now: Date, opts: { fail?: boolean; throws?: boolean } = {}) {
    const sent: { to: string; subject: string; html: string; text: string }[] = [];
    return {
      sent,
      deps: {
        now: () => now,
        send: async (to: string, subject: string, c: { html: string; text: string }) => {
          if (opts.throws) throw new Error("resend down");
          sent.push({ to, subject, ...c });
          return !opts.fail;
        },
      },
    };
  }
  const rows = async () => (await dbm.pool.query("select * from error_alerts order by signature")).rows;

  it("emails the first time, once, to the support mailbox by default", async () => {
    const f = fake(T0);
    await al.recordError({ source: "route", error: new Error("boom"), route: "/api/x" }, f.deps);
    assert.equal(f.sent.length, 1);
    assert.equal(f.sent[0].to, "hello@hiddengemsapp.co.uk");
    assert.match(f.sent[0].subject, /Problem: route/);
    assert.equal((await rows()).length, 1);
  });

  it("sends to ALERT_EMAIL when it is set", async () => {
    process.env.ALERT_EMAIL = "owner@example.com";
    const f = fake(T0);
    await al.recordError({ source: "route", error: new Error("boom") }, f.deps);
    assert.equal(f.sent[0].to, "owner@example.com");
  });

  it("the same problem again within the hour is counted but not emailed", async () => {
    const f = fake(T0);
    await al.recordError({ source: "route", error: new Error("boom 1") }, f.deps);
    await al.recordError({ source: "route", error: new Error("boom 2") }, fake(minutes(30)).deps);
    await al.recordError({ source: "route", error: new Error("boom 3") }, fake(minutes(59)).deps);
    const all = await rows();
    assert.equal(all.length, 1);
    assert.equal(all[0].count, 3);
    assert.equal(f.sent.length, 1);
  });

  it("and is emailed again once the hour is up, but not a minute before", async () => {
    await al.recordError({ source: "route", error: new Error("boom") }, fake(T0).deps);
    const justBefore = fake(new Date(T0.getTime() + ALERT_COOLDOWN_MS - 1));
    await al.recordError({ source: "route", error: new Error("boom") }, justBefore.deps);
    assert.equal(justBefore.sent.length, 0);
    const after = fake(new Date(T0.getTime() + ALERT_COOLDOWN_MS + 1));
    await al.recordError({ source: "route", error: new Error("boom") }, after.deps);
    assert.equal(after.sent.length, 1);
  });

  it("a different problem gets its own email straight away", async () => {
    const f = fake(T0);
    await al.recordError({ source: "route", error: new Error("first") }, f.deps);
    await al.recordError({ source: "render", error: new Error("second"), route: "/items" }, f.deps);
    assert.equal(f.sent.length, 2);
  });

  it("a burst of identical errors at once sends one email", async () => {
    const f = fake(T0);
    await Promise.all(Array.from({ length: 12 }, () => al.recordError({ source: "route", error: new Error("burst") }, f.deps)));
    assert.equal(f.sent.length, 1);
    assert.equal((await rows())[0].count, 12);
  });

  it("stops emailing after the daily cap of different problems, but still records them", async () => {
    const f = fake(T0);
    for (let i = 0; i < DAILY_ALERT_CAP + 3; i++) await al.recordError({ source: `src${i}`, error: new Error("x") }, f.deps);
    assert.equal(f.sent.length, DAILY_ALERT_CAP);
    assert.equal((await rows()).length, DAILY_ALERT_CAP + 3);
    // a day later the cap has reset
    const next = fake(minutes(24 * 60 + 5));
    await al.recordError({ source: "fresh", error: new Error("x") }, next.deps);
    assert.equal(next.sent.length, 1);
  });

  it("nothing about a customer reaches the email or the database", async () => {
    const f = fake(T0);
    const err = new Error('Failed query: update "users" set "email" = $1\nparams: jane@example.com,secrethashvalue1234567890abcdef');
    await al.recordError({ source: "action", error: err, route: "/settings/account?email=jane@example.com" }, f.deps);
    const everything = JSON.stringify(f.sent) + JSON.stringify(await rows());
    for (const bad of ["jane@example.com", "secrethashvalue", "params"]) assert.ok(!everything.includes(bad), bad);
  });

  it("keeps the Next.js log id so the full log line can be found", async () => {
    const f = fake(T0);
    await al.recordError({ source: "render", error: Object.assign(new Error("x"), { digest: "98765" }) }, f.deps);
    assert.equal((await rows())[0].digest, "98765");
    assert.match(f.sent[0].text, /98765/);
  });

  it("never throws, even if sending the email blows up, and the problem is still recorded", async () => {
    await assert.doesNotReject(al.recordError({ source: "route", error: new Error("boom") }, fake(T0, { throws: true }).deps));
    assert.equal((await rows()).length, 1);
    await assert.doesNotReject(al.recordError({ source: "route", error: new Error("boom2") }, fake(T0, { fail: true }).deps));
  });

  it("ignores redirects and not-found, which are normal", async () => {
    const f = fake(T0);
    await al.recordError({ source: "action", error: Object.assign(new Error("NEXT_REDIRECT"), { digest: "NEXT_REDIRECT;push;/;307;" }) }, f.deps);
    assert.equal((await rows()).length, 0);
    assert.equal(f.sent.length, 0);
  });

  it("ALERTS=off records and sends nothing", async () => {
    process.env.ALERTS = "off";
    const f = fake(T0);
    await al.recordError({ source: "route", error: new Error("boom") }, f.deps);
    assert.equal((await rows()).length, 0);
    assert.equal(f.sent.length, 0);
  });

  it("the test alert always emails, even inside the hour and over the daily cap, and is marked as a test", async () => {
    const f = fake(T0);
    for (let i = 0; i < DAILY_ALERT_CAP; i++) await al.recordError({ source: `src${i}`, error: new Error("x") }, f.deps);
    f.sent.length = 0;
    const r1 = await al.sendTestAlert(f.deps);
    const r2 = await al.sendTestAlert(fake(minutes(1)).deps);
    assert.equal(r1.emailed, true);
    assert.equal(r2.emailed, true);
    assert.equal(f.sent.length, 1);
    assert.match(f.sent[0].subject, /TEST/);
    const test = (await rows()).find((r) => r.is_test);
    assert.ok(test);
    assert.equal(test.count, 2);
  });

  it("the test alert reports honestly when the email didn't go", async () => {
    const r = await al.sendTestAlert(fake(T0, { fail: true }).deps);
    assert.equal(r.emailed, false);
  });

  it("problems that haven't recurred for 30 days are forgotten; newer ones stay", async () => {
    await dbm.db.insert(s.errorAlerts).values([
      { signature: "old", source: "route", message: "old", lastSeenAt: new Date(T0.getTime() - 31 * 86_400_000), firstSeenAt: new Date(T0.getTime() - 40 * 86_400_000) },
      { signature: "recent", source: "route", message: "recent", lastSeenAt: new Date(T0.getTime() - 29 * 86_400_000), firstSeenAt: new Date(T0.getTime() - 40 * 86_400_000) },
    ]);
    await al.purgeOldAlerts(T0);
    assert.deepEqual((await rows()).map((r) => r.signature), ["recent"]);
  });

  it("lists the newest problems first", async () => {
    await al.recordError({ source: "a", error: new Error("one") }, fake(T0).deps);
    await al.recordError({ source: "b", error: new Error("two") }, fake(minutes(5)).deps);
    assert.deepEqual((await al.recentAlerts()).map((r) => r.source), ["b", "a"]);
  });
});

describe("the Next.js error hook (database)", { skip: dbSkipReason }, () => {
  let dbm: typeof import("@/db");
  before(async () => {
    const url = pointAppAtTestDatabase();
    await resetAndMigrate(url);
    dbm = await import("@/db");
  });
  after(async () => { await dbm?.pool.end(); }); // the last database block in this file closes the shared pool
  beforeEach(async () => { await dbm.pool.query("delete from error_alerts"); });

  const req = { path: "/items/12?x=1", method: "GET", headers: {} };
  const ctx = { routerKind: "App Router", routePath: "/(app)/items/[id]", routeType: "render", renderSource: "react-server-components", revalidateReason: undefined, renderType: "dynamic" } as const;

  it("records a server crash with where it happened", async () => {
    process.env.NEXT_RUNTIME = "nodejs";
    const { onRequestError } = await import("@/instrumentation");
    await onRequestError(new Error("kaboom"), req, ctx);
    const r = (await dbm.pool.query("select * from error_alerts")).rows;
    assert.equal(r.length, 1);
    assert.equal(r[0].source, "render");
    assert.equal(r[0].route, "/(app)/items/[id]");
    assert.equal(r[0].message, "kaboom");
  });

  it("does nothing outside the Node runtime", async () => {
    process.env.NEXT_RUNTIME = "edge";
    const { onRequestError } = await import("@/instrumentation");
    await onRequestError(new Error("kaboom"), req, ctx);
    process.env.NEXT_RUNTIME = "nodejs";
    assert.equal((await dbm.pool.query("select count(*) n from error_alerts")).rows[0].n, "0");
  });
});
