"use client";

import { useActionState } from "react";
import Link from "next/link";
import { confirmEmailChangeAction, type ConfirmChangeState } from "./actions";
import { SubmitButton } from "@/components/SubmitButton";
import { Notice } from "@/components/AuthShell";

export function ConfirmChangeForm({ token, email }: { token: string; email: string }) {
  const [state, action] = useActionState<ConfirmChangeState, FormData>(confirmEmailChangeAction, {});
  if (state.ok) {
    return (
      <div className="card space-y-4 text-center">
        <Notice>All done! You&apos;ll sign in with {state.email} from now on.</Notice>
        <Link href="/" className="btn">Continue</Link>
      </div>
    );
  }
  return (
    <form action={action} className="card space-y-4 text-center">
      <input type="hidden" name="token" value={token} />
      <p className="text-muted">Use <span className="font-bold text-foreground">{email}</span> to sign in to Hidden Gems from now on?</p>
      {state.error && <Notice tone="error">{state.error}</Notice>}
      <SubmitButton pendingText="Saving…">Yes, use this email</SubmitButton>
    </form>
  );
}
