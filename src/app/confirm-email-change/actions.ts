"use server";

import { consumeTokenFull } from "@/lib/tokens";
import { applyEmailChange } from "@/lib/emailChange";

export type ConfirmChangeState = { ok?: boolean; error?: string; email?: string };

export async function confirmEmailChangeAction(_prev: ConfirmChangeState, formData: FormData): Promise<ConfirmChangeState> {
  const used = await consumeTokenFull(String(formData.get("token") ?? ""), "change_email");
  if (!used?.payload) return { error: "That link has expired or was already used. Please ask for a new one from Settings." };
  const result = await applyEmailChange(used.userId, used.payload);
  if (!result.ok) {
    return { error: result.reason === "taken" ? "Sorry, that email address is now being used by another account." : "We couldn't find that account." };
  }
  return { ok: true, email: used.payload };
}
