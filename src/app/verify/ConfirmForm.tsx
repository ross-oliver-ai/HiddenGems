"use client";

import { useActionState } from "react";
import Link from "next/link";
import { confirmEmailAction, type SimpleState } from "./actions";
import { SubmitButton } from "@/components/SubmitButton";
import { Notice } from "@/components/AuthShell";

export function ConfirmForm({ token }: { token: string }) {
  const [state, action] = useActionState<SimpleState, FormData>(confirmEmailAction, {});
  return (
    <form action={action} className="card space-y-4 text-center">
      <input type="hidden" name="token" value={token} />
      <p className="text-muted">One last tap to confirm it&apos;s really you.</p>
      {state.error && (
        <>
          <Notice tone="error">{state.error}</Notice>
          <Link href="/resend-verification" className="block text-sm font-bold text-primary">Send me a new link</Link>
        </>
      )}
      <SubmitButton pendingText="Confirming…">Confirm my email</SubmitButton>
    </form>
  );
}
