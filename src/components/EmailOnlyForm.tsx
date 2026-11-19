"use client";

import { useActionState } from "react";
import { SubmitButton } from "./SubmitButton";
import { Notice } from "./AuthShell";
import type { SimpleState } from "@/app/verify/actions";

export function EmailOnlyForm({
  action,
  button,
  pending,
  done,
}: {
  action: (prev: SimpleState, fd: FormData) => Promise<SimpleState>;
  button: string;
  pending: string;
  done: string;
}) {
  const [state, run] = useActionState<SimpleState, FormData>(action, {});
  if (state.ok) {
    return (
      <div className="card space-y-2 text-center">
        <p className="text-3xl" aria-hidden>📬</p>
        <p className="text-sm text-muted">{done}</p>
      </div>
    );
  }
  return (
    <form action={run} className="card space-y-4">
      <div>
        <label className="label" htmlFor="email">Email</label>
        <input id="email" name="email" type="email" inputMode="email" autoComplete="email" required maxLength={254} defaultValue={state.email} className="field" />
      </div>
      {state.error && <Notice tone="error">{state.error}</Notice>}
      <SubmitButton pendingText={pending}>{button}</SubmitButton>
    </form>
  );
}
