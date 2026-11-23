"use server";

import { requireAdmin } from "@/lib/auth";
import { sendTestAlert } from "@/lib/alerts";
import { emailConfigured } from "@/lib/email";

export type TestAlertState = { ok?: string; error?: string };

/** The "Send a test alert" button on the admin Overview: sends one real alert email through the real route. */
export async function sendTestAlertAction(): Promise<TestAlertState> {
  await requireAdmin();
  if (!emailConfigured()) return { error: "Email isn't set up on this site (RESEND_API_KEY and EMAIL_FROM), so no alert could be sent." };
  const { emailed, to } = await sendTestAlert();
  return emailed
    ? { ok: `Sent to ${to}. It should arrive within a minute: check your inbox, and your spam folder the first time.` }
    : { error: `The email to ${to} couldn't be sent. Check the Resend dashboard.` };
}
