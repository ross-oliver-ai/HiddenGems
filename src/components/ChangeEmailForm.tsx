"use client";

import { useActionState } from "react";
import { requestEmailChangeAction, type ChangeEmailState } from "@/app/change-email/actions";
import { SubmitButton } from "./SubmitButton";

export function ChangeEmailForm({ currentEmail }: { currentEmail: string }) {
  const [state, action] = useActionState<ChangeEmailState, FormData>(requestEmailChangeAction, {});
  return (
    <form action={action} key={state.sentTo ?? "form"} className="space-y-4">
      <p className="text-sm text-muted">You sign in with <span className="font-bold text-foreground">{currentEmail}</span>.</p>
      <div>
        <label className="label" htmlFor="new-email">New email address</label>
        <input id="new-email" name="email" type="email" inputMode="email" autoComplete="email" required className="field" />
      </div>
      <div>
        <label className="label" htmlFor="email-password">Current password</label>
        <input id="email-password" name="password" type="password" autoComplete="current-password" required className="field" />
      </div>
      {state.error && <p role="alert" className="rounded-xl bg-danger/10 px-3 py-2 text-sm font-semibold text-danger">{state.error}</p>}
      {state.sentTo && (
        <p role="status" className="rounded-xl bg-success/10 px-3 py-2 text-sm font-semibold text-success">
          If {state.sentTo} can be used, we&apos;ve sent a link to it. Tap the link to finish the change. Until then you keep signing in with your current email.
        </p>
      )}
      <SubmitButton pendingText="Sending…">Send confirmation link</SubmitButton>
    </form>
  );
}
