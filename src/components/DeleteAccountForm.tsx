"use client";

import { useActionState } from "react";
import { deleteAccountAction, type DeleteState } from "@/app/(app)/settings/account/delete/actions";
import { SubmitButton } from "./SubmitButton";

export function DeleteAccountForm({ email }: { email: string }) {
  const [state, action] = useActionState<DeleteState, FormData>(deleteAccountAction, {});
  return (
    <form action={action} className="space-y-4" data-delete-form>
      <div>
        <label className="label" htmlFor="delete-email">Type your email address ({email})</label>
        <input id="delete-email" name="email" type="email" autoComplete="off" autoCapitalize="none" required className="field" />
      </div>
      <div>
        <label className="label" htmlFor="delete-password">Your password</label>
        <input id="delete-password" name="password" type="password" autoComplete="current-password" required className="field" />
      </div>
      {state.error && <p role="alert" className="rounded-xl bg-danger/10 px-3 py-2 text-sm font-semibold text-danger">{state.error}</p>}
      <SubmitButton pendingText="Deleting…" className="btn-danger w-full">Permanently delete my account</SubmitButton>
    </form>
  );
}
