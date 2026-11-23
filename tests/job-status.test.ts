// The daily job's "last ran" record and what the admin Overview says about it.
import { describe, it, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { dbSkipReason, pointAppAtTestDatabase, resetAndMigrate } from "./helpers/testdb";
import { JOB_OVERDUE_MS, jobStatus, whenLabel, type JobRunRow } from "@/lib/job-status";

const NOW = new Date("2026-11-23T21:00:00Z");
const ago = (ms: number) => new Date(NOW.getTime() - ms);
const H = 3600_000;
const ok = (over: Partial<JobRunRow> = {}): JobRunRow => ({ lastRunAt: ago(13 * H), ok: true, checked: 0, sent: 0, skipped: false, error: null, ...over });

describe("whenLabel()", () => {
  it("says today, yesterday, or how many days ago, with the UTC time", () => {
    assert.equal(whenLabel(new Date("2026-11-23T08:03:00Z"), NOW), "today at 08:03 UTC");
    assert.equal(whenLabel(new Date("2026-11-22T08:00:00Z"), NOW), "yesterday at 08:00 UTC");
    assert.equal(whenLabel(new Date("2026-11-20T08:30:00Z"), NOW), "3 days ago (20 Nov, 08:30 UTC)");
  });
  it("counts calendar days, not 24-hour blocks", () => {
    assert.equal(whenLabel(new Date("2026-11-22T23:59:00Z"), new Date("2026-11-23T00:01:00Z")), "yesterday at 23:59 UTC");
  });
});

describe("jobStatus()", () => {
  it("before its first run it is calm, not alarming", () => {
    const s = jobStatus(null, NOW);
    assert.equal(s.state, "never");
    assert.match(s.headline, /Hasn't run yet/);
  });
  it("a recent good run says when and what it did", () => {
    const s = jobStatus(ok({ checked: 3, sent: 1 }), NOW);
    assert.equal(s.state, "ok");
    assert.equal(s.headline, "Ran today at 08:00 UTC");
    assert.equal(s.detail, "Looked at 3 accounts and sent 1 reminder email.");
  });
  it("says so plainly when nobody needed a reminder, and when billing is off", () => {
    assert.equal(jobStatus(ok(), NOW).detail, "No one needed a trial reminder.");
    assert.equal(jobStatus(ok({ skipped: true }), NOW).detail, "Billing is off, so no trial reminders were due.");
    assert.equal(jobStatus(ok({ checked: 1, sent: 2 }), NOW).detail, "Looked at 1 account and sent 2 reminder emails.");
  });
  it("a failed run is reported as failed, with the reason, even if it was recent", () => {
    const s = jobStatus(ok({ ok: false, error: "Error: db down" }), NOW);
    assert.equal(s.state, "failed");
    assert.match(s.headline, /failed today/);
    assert.match(s.detail ?? "", /db down/);
  });
  it("a run more than 26 hours ago is flagged as overdue, and exactly at the limit still counts as fine", () => {
    assert.equal(jobStatus(ok({ lastRunAt: ago(JOB_OVERDUE_MS) }), NOW).state, "ok");
    const late = jobStatus(ok({ lastRunAt: ago(JOB_OVERDUE_MS + 60_000) }), NOW);
    assert.equal(late.state, "overdue");
    assert.match(late.detail ?? "", /Schedules/);
  });
  it("a failure that is also old is still a failure", () => {
    assert.equal(jobStatus(ok({ ok: false, error: "x", lastRunAt: ago(5 * 24 * H) }), NOW).state, "failed");
  });
});

describe("recording the daily job (database)", { skip: dbSkipReason }, () => {
  let dbm: typeof import("@/db");
  let jr: typeof import("@/lib/job-runs");
  let route: typeof import("@/app/api/cron/trial-reminders/route");
  before(async () => {
    const url = pointAppAtTestDatabase();
    await resetAndMigrate(url);
    dbm = await import("@/db");
    jr = await import("@/lib/job-runs");
    route = await import("@/app/api/cron/trial-reminders/route");
  });
  after(async () => { await dbm?.pool.end(); });
  beforeEach(async () => {
    await dbm.pool.query("delete from job_runs");
    delete process.env.BILLING_ENABLED;
    process.env.CRON_SECRET = "test-secret";
  });

  it("starts empty, then keeps one row that is updated on every run", async () => {
    assert.equal(await jr.lastJobRun("daily"), null);
    await jr.recordJobRun("daily", { ok: true, checked: 4, sent: 2, skipped: false }, new Date("2026-11-22T08:00:00Z"));
    await jr.recordJobRun("daily", { ok: true, checked: 5, sent: 0, skipped: false }, new Date("2026-11-23T08:00:00Z"));
    const rows = (await dbm.pool.query("select * from job_runs")).rows;
    assert.equal(rows.length, 1);
    assert.equal(rows[0].run_count, 2);
    const last = await jr.lastJobRun("daily");
    assert.equal(last?.checked, 5);
    assert.equal(last?.lastRunAt.toISOString(), "2026-11-23T08:00:00.000Z");
  });

  it("a failure is recorded with a scrubbed message, and the next good run clears it", async () => {
    await jr.recordJobRun("daily", { ok: false, error: new Error("fail for jane@example.com token abcdefghijklmnopqrstuvwxyz0123456789") });
    const bad = await jr.lastJobRun("daily");
    assert.equal(bad?.ok, false);
    assert.ok(!bad?.error?.includes("jane@example.com") && !bad?.error?.includes("abcdefghijklmnopqrstuvwxyz"), bad?.error ?? "");
    await jr.recordJobRun("daily", { ok: true, checked: 0, sent: 0, skipped: false });
    const good = await jr.lastJobRun("daily");
    assert.equal(good?.ok, true);
    assert.equal(good?.error, null);
  });

  it("recording never throws", async () => {
    await assert.doesNotReject(jr.recordJobRun(null as unknown as string, { ok: true, checked: 0, sent: 0, skipped: false })); // the database refuses this row
  });

  it("the cron route records a run when called with the right secret", async () => {
    const res = await route.GET(new Request("http://x/api/cron/trial-reminders", { headers: { authorization: "Bearer test-secret" } }));
    assert.equal(res.status, 200);
    const last = await jr.lastJobRun("daily");
    assert.equal(last?.ok, true);
    assert.equal(last?.skipped, true, "billing is off in this test, so reminders are skipped");
  });

  it("if the job itself crashes, the failure is recorded and the crash still reaches the error hook", async () => {
    process.env.BILLING_ENABLED = "true"; process.env.STRIPE_SECRET_KEY = "sk_test_x"; process.env.STRIPE_WEBHOOK_SECRET = "whsec_x";
    await dbm.pool.query("alter table users rename to users_away");
    try {
      await assert.rejects(route.GET(new Request("http://x/api/cron/trial-reminders", { headers: { authorization: "Bearer test-secret" } })));
    } finally {
      await dbm.pool.query("alter table users_away rename to users");
    }
    const last = await jr.lastJobRun("daily");
    assert.equal(last?.ok, false);
    assert.ok(last?.error && last.error.length > 0);
  });

  it("the cron route records nothing, and says no, without the right secret", async () => {
    const res = await route.GET(new Request("http://x/api/cron/trial-reminders", { headers: { authorization: "Bearer wrong" } }));
    assert.equal(res.status, 401);
    assert.equal(await jr.lastJobRun("daily"), null);
  });
});
