import { NextResponse } from "next/server";
import { sendTrialReminders } from "@/lib/trialEmails";

// Vercel's scheduler (see vercel.json) calls this once a day, sending CRON_SECRET as a bearer token.
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }
  return NextResponse.json(await sendTrialReminders());
}
