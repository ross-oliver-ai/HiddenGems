"use client";

import { useActionState } from "react";
import Link from "next/link";
import { signupAction, type SignupState } from "./actions";
import { SubmitButton } from "@/components/SubmitButton";
import { Notice } from "@/components/AuthShell";

export function SignupForm() {
  const [state, action] = useActionState<SignupState, FormData>(signupAction, {});
  if (state.ok) {
    return (
      <div className="card space-y-2 text-center">
        <p className="text-3xl" aria-hidden>📬</p>
        <p className="text-lg font-extrabold">Check your email</p>
        <p className="text-sm text-muted">
          If {state.email} can be used for an account, we&apos;ve sent a link to it. Tap the link to finish signing up. It can take a minute, and it&apos;s worth looking in your spam folder.
        </p>
      </div>
    );
  }
  return (
    <form action={action} className="card space-y-4">
      <div className="absolute -left-[9999px] h-0 w-0 overflow-hidden" aria-hidden="true">
        <label htmlFor="website">Leave this empty</label>
        <input id="website" name="website" tabIndex={-1} autoComplete="off" />
      </div>
      <div>
        <label className="label" htmlFor="name">Your name</label>
        <input id="name" name="name" autoComplete="name" required maxLength={80} defaultValue={state.name} className="field" />
      </div>
      <div>
        <label className="label" htmlFor="email">Email</label>
        <input id="email" name="email" type="email" inputMode="email" autoComplete="email" required maxLength={254} defaultValue={state.email} className="field" />
      </div>
      <div>
        <label className="label" htmlFor="password">Choose a password</label>
        <input id="password" name="password" type="password" autoComplete="new-password" required minLength={10} maxLength={72} className="field" />
        <p className="mt-1 text-xs text-muted">At least 10 characters.</p>
      </div>
      <label className="flex items-start gap-3 text-sm">
        <input type="checkbox" name="terms" required defaultChecked={state.terms} className="mt-0.5 h-5 w-5 shrink-0 accent-[var(--primary)]" />
        <span>
          I agree to the <Link href="/terms" className="font-bold underline">terms</Link> and have read the <Link href="/privacy" className="font-bold underline">privacy notice</Link>.
        </span>
      </label>
      {state.error && <Notice tone="error">{state.error}</Notice>}
      <SubmitButton pendingText="Creating your account…">Create my account</SubmitButton>
    </form>
  );
}
