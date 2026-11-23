import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { jobRuns } from "@/db/schema";
import { scrub } from "@/lib/alert-rules";
import type { JobRunRow } from "@/lib/job-status";

export type JobOutcome = { ok: true; checked: number; sent: number; skipped: boolean } | { ok: false; error: unknown };

/** Notes that a scheduled job has just run. Never throws: keeping this note must never stop the job itself. */
export async function recordJobRun(job: string, outcome: JobOutcome, now: Date = new Date()): Promise<void> {
  try {
    const v = outcome.ok
      ? { ok: true, checked: outcome.checked, sent: outcome.sent, skipped: outcome.skipped, error: null }
      : { ok: false, checked: 0, sent: 0, skipped: false, error: scrub(outcome.error instanceof Error ? `${outcome.error.name}: ${outcome.error.message}` : String(outcome.error)) };
    await db
      .insert(jobRuns)
      .values({ job, lastRunAt: now, ...v })
      .onConflictDoUpdate({ target: jobRuns.job, set: { lastRunAt: now, ...v, runCount: sql`${jobRuns.runCount} + 1` } });
  } catch (e) {
    console.error("Recording a job run failed", e);
  }
}

export async function lastJobRun(job: string): Promise<JobRunRow | null> {
  const [row] = await db.select().from(jobRuns).where(eq(jobRuns.job, job));
  return row ?? null;
}
