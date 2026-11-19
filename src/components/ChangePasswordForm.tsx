"use client";

import { useActionState } from "react";
import { changePasswordAction, type PasswordState } from "@/app/change-password/actions";
import { SubmitButton } from "./SubmitButton";

export function ChangePasswordForm() {
  const [state, action] = useActionState<PasswordState, FormData>(changePasswordAction, {});
  return (
    <form action={action} className="space-y-4">
      <div>
        <label className="label" htmlFor="current">Current password</label>
        <input id="current" name="current" type="password" autoComplete="current-password" required className="field" />
      </div>
      <div>
        <label className="label" htmlFor="next">New password (10+ characters)</label>
        <input id="next" name="next" type="password" autoComplete="new-password" minLength={10} required className="field" />
      </div>
      <div>
        <label className="label" htmlFor="confirm">Confirm new password</label>
        <input id="confirm" name="confirm" type="password" autoComplete="new-password" minLength={10} required className="field" />
      </div>
      {state.error && <p role="alert" className="rounded-xl bg-danger/10 px-3 py-2 text-sm font-semibold text-danger">{state.error}</p>}
      {state.ok && <p role="status" className="rounded-xl bg-success/10 px-3 py-2 text-sm font-semibold text-success">Password updated.</p>}
      <SubmitButton pendingText="Saving…">Update password</SubmitButton>
    </form>
  );
}
