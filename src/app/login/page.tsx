"use client";

import { useActionState } from "react";
import { loginAction, type LoginState } from "./actions";
import { SubmitButton } from "@/components/SubmitButton";
import { Logo } from "@/components/Logo";

export default function LoginPage() {
  const [state, action] = useActionState<LoginState, FormData>(loginAction, {});
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center px-6 py-10">
      <div className="mb-8 flex flex-col items-center text-center">
        <Logo size={64} />
        <h1 className="mt-4 text-3xl font-extrabold tracking-tight">Hidden Gems</h1>
        <p className="mt-1 text-muted">Sign in to see your finds</p>
      </div>
      <form action={action} className="card space-y-4">
        <div>
          <label className="label" htmlFor="email">Email</label>
          <input id="email" name="email" type="email" autoComplete="username" inputMode="email" defaultValue={state.email} required className="field" />
        </div>
        <div>
          <label className="label" htmlFor="password">Password</label>
          <input id="password" name="password" type="password" autoComplete="current-password" required className="field" />
        </div>
        {state.error && <p role="alert" className="rounded-xl bg-danger/10 px-3 py-2 text-sm font-semibold text-danger">{state.error}</p>}
        <SubmitButton pendingText="Signing in…">Sign in</SubmitButton>
      </form>
      <p className="mt-6 text-center text-sm text-muted">No account? Ask the admin to set one up for you.</p>
    </main>
  );
}
