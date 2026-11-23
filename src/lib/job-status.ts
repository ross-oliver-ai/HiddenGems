// What the admin Overview says about the daily job. Pure: no database, so the unit tests can cover every case.

export const DAILY_JOB = "daily";
/** The job runs once a day, and on the free plan Vercel may start it anywhere in the 08:00 hour, so allow a day plus a margin. */
export const JOB_OVERDUE_MS = 26 * 3600_000;

export type JobRunRow = { lastRunAt: Date; ok: boolean; checked: number; sent: number; skipped: boolean; error: string | null };

export type JobStatus = {
  state: "never" | "ok" | "failed" | "overdue";
  headline: string;
  detail: string | null;
};

/** "today at 08:03 UTC", "yesterday at 08:00 UTC", "3 days ago (20 Nov, 08:00 UTC)" */
export function whenLabel(d: Date, now: Date): string {
  const hhmm = `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")} UTC`;
  const dayOf = (x: Date) => Math.floor(x.getTime() / 86_400_000);
  const days = dayOf(now) - dayOf(d);
  if (days <= 0) return `today at ${hhmm}`;
  if (days === 1) return `yesterday at ${hhmm}`;
  const date = d.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
  return `${days} days ago (${date}, ${hhmm})`;
}

function outcome(r: JobRunRow): string {
  if (r.skipped) return "Billing is off, so no trial reminders were due.";
  if (r.checked === 0) return "No one needed a trial reminder.";
  return `Looked at ${r.checked} account${r.checked === 1 ? "" : "s"} and sent ${r.sent} reminder email${r.sent === 1 ? "" : "s"}.`;
}

export function jobStatus(row: JobRunRow | null | undefined, now: Date): JobStatus {
  if (!row) {
    return { state: "never", headline: "Hasn't run yet", detail: "It runs every day around 08:00 UTC. This line fills in after its next run." };
  }
  const when = whenLabel(row.lastRunAt, now);
  if (!row.ok) {
    return { state: "failed", headline: `Last run failed ${when}`, detail: row.error ? `${row.error} (an alert email was also sent)` : "An alert email was also sent." };
  }
  if (now.getTime() - row.lastRunAt.getTime() > JOB_OVERDUE_MS) {
    return { state: "overdue", headline: `Last ran ${when}: that's longer ago than it should be`, detail: "In Vercel, open the project's Schedules, then Cron Jobs, and check it is still Active. Tap Run there to run it now." };
  }
  return { state: "ok", headline: `Ran ${when}`, detail: outcome(row) };
}
