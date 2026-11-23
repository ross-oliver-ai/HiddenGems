import { NextResponse } from "next/server";
import { purgeOldAlerts } from "@/lib/alerts";
import { billingEnforced } from "@/lib/billing";
import { recordJobRun } from "@/lib/job-runs";
import { DAILY_JOB } from "@/lib/job-status";
import { sendTrialReminders } from "@/lib/trialEmails";

// Vercel's scheduler (see vercel.json) calls this once a day, sending CRON_SECRET as a bearer token.
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }
  let result;
  try {
    result = await sendTrialReminders();
  } catch (e) {
    await recordJobRun(DAILY_JOB, { ok: false, error: e }); // so the admin Overview shows the failure...
    throw e; // ...and the error hook (src/instrumentation.ts) still emails the alert
  }
  await purgeOldAlerts().catch(() => {}); // housekeeping: forget problems that stopped recurring
  await recordJobRun(DAILY_JOB, { ok: true, ...result, skipped: !billingEnforced() });
  return NextResponse.json(result);
}
