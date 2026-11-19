"use client";

import { useActionState } from "react";
import Link from "next/link";
import { loginAction, type LoginState } from "./actions";
import { SubmitButton } from "@/components/SubmitButton";

export function LoginForm({ canReset }: { canReset: boolean }) {
  const [state, action] = useActionState<LoginState, FormData>(loginAction, {});
  return (
    <form action={action} className="card space-y-4">
      <div>
        <label className="label" htmlFor="email">Email</label>
        <input id="email" name="email" type="email" autoComplete="username" inputMode="email" defaultValue={state.email} required className="field" />
      </div>
      <div>
        <label className="label" htmlFor="password">Password</label>
        <input id="password" name="password" type="password" autoComplete="current-password" required className="field" />
      </div>
      {state.error && (
        <p role="alert" className="rounded-xl bg-danger/10 px-3 py-2 text-sm font-semibold text-danger">
          {state.error}
          {state.unverified && (
            <>
              {" "}
              <Link href="/resend-verification" className="underline">Send me a new link</Link>
            </>
          )}
        </p>
      )}
      <SubmitButton pendingText="Signing in…">Sign in</SubmitButton>
      {canReset && (
        <p className="text-center text-sm">
          <Link href="/forgot-password" className="font-bold text-primary">Forgot your password?</Link>
        </p>
      )}
    </form>
  );
}
