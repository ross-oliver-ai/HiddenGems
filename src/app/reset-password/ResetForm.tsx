"use client";

import { useActionState } from "react";
import { resetPasswordAction, type ResetState } from "./actions";
import { SubmitButton } from "@/components/SubmitButton";
import { Notice } from "@/components/AuthShell";

export function ResetForm({ token }: { token: string }) {
  const [state, action] = useActionState<ResetState, FormData>(resetPasswordAction, {});
  return (
    <form action={action} className="card space-y-4">
      <input type="hidden" name="token" value={token} />
      <div>
        <label className="label" htmlFor="password">New password</label>
        <input id="password" name="password" type="password" autoComplete="new-password" required minLength={10} maxLength={72} className="field" />
        <p className="mt-1 text-xs text-muted">At least 10 characters.</p>
      </div>
      <div>
        <label className="label" htmlFor="confirm">Type it again</label>
        <input id="confirm" name="confirm" type="password" autoComplete="new-password" required minLength={10} maxLength={72} className="field" />
      </div>
      {state.error && <Notice tone="error">{state.error}</Notice>}
      <SubmitButton pendingText="Saving…">Save new password</SubmitButton>
    </form>
  );
}
