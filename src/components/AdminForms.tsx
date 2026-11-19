"use client";

import { useActionState } from "react";
import { createUserAction, resetPasswordAction, type AdminState } from "@/app/(app)/admin/users/actions";
import { SubmitButton } from "./SubmitButton";
import { PasswordInput } from "./PasswordGenerator";

function Message({ state }: { state: AdminState }) {
  if (state.error) return <p role="alert" className="rounded-xl bg-danger/10 px-3 py-2 text-sm font-semibold text-danger">{state.error}</p>;
  if (state.ok) return <p role="status" className="rounded-xl bg-success/10 px-3 py-2 text-sm font-semibold text-success">{state.ok}</p>;
  return null;
}

export function CreateUserForm() {
  const [state, action] = useActionState<AdminState, FormData>(createUserAction, {});
  return (
    <form action={action} key={state.ok ?? "form"} className="space-y-3">
      <div>
        <label className="label" htmlFor="name">Name</label>
        <input id="name" name="name" required className="field" autoComplete="off" defaultValue={state.values?.name} />
      </div>
      <div>
        <label className="label" htmlFor="email">Email (their login)</label>
        <input id="email" name="email" type="email" inputMode="email" required className="field" autoComplete="off" defaultValue={state.values?.email} />
      </div>
      <div>
        <label className="label" htmlFor="password">Temporary password</label>
        <PasswordInput />
        <p className="mt-1.5 text-xs text-muted">They&apos;ll be asked to choose their own at first sign-in.</p>
      </div>
      <Message state={state} />
      <SubmitButton pendingText="Creating…">Create account</SubmitButton>
    </form>
  );
}

export function ResetPasswordForm({ userId }: { userId: number }) {
  const [state, action] = useActionState<AdminState, FormData>(resetPasswordAction, {});
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="userId" value={userId} />
      <PasswordInput id={`pw-${userId}`} />
      <Message state={state} />
      <SubmitButton className="btn-soft w-full" pendingText="Resetting…">Reset password</SubmitButton>
    </form>
  );
}
