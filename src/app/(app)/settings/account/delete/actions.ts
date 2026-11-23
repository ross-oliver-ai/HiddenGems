"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { sendAccountDeletedEmail } from "@/lib/authEmails";
import { deleteAccount } from "@/lib/delete-account";
import { verifyPassword } from "@/lib/password";
import { destroySession } from "@/lib/session";
import { beginSignIn, blockedMessage, finishSignIn, visitorIp } from "@/lib/sign-in-limit";

export type DeleteState = { error?: string };

/** The second of two deliberate steps: they have to type their email address and password. */
export async function deleteAccountAction(_prev: DeleteState, formData: FormData): Promise<DeleteState> {
  const user = await requireUser(); // works on an ended trial too: leaving must always be possible
  if (user.role === "admin") return { error: "Admin accounts can't be deleted here." };

  const typed = String(formData.get("email") ?? "").trim().toLowerCase();
  if (typed !== user.email.toLowerCase()) return { error: "That isn't the email address on this account." };

  // Same guess limit as signing in, so this form can't be used to try passwords
  const attempt = await beginSignIn(user.email, visitorIp(await headers()));
  if (!attempt.allowed) return { error: blockedMessage(attempt.retryAfterMinutes) };
  const passwordOk = await verifyPassword(String(formData.get("password") ?? ""), user.passwordHash);
  await finishSignIn(user.email, attempt.attemptId, passwordOk);
  if (!passwordOk) return { error: "That password isn't right." };

  const result = await deleteAccount(user);
  if (!result.ok) return { error: result.error };

  await destroySession();
  await sendAccountDeletedEmail(user.email, user.name); // a record for them; failing to send changes nothing
  redirect("/login?deleted=1");
}
