"use client";

import Link from "next/link";
import { useActionState } from "react";
import { setupAction, type SetupState } from "./actions";
import { SubmitButton } from "@/components/SubmitButton";

export function SetupForm() {
  const [state, action] = useActionState<SetupState, FormData>(setupAction, {});
  if (state.ok) {
    return (
      <div className="card space-y-3 text-center">
        <p className="text-lg font-extrabold">All set ✨</p>
        <p className="text-sm text-muted">Tables created and admin account made for {state.email}.</p>
        <Link href="/login" className="btn w-full">Go to sign in</Link>
        <p className="text-xs text-muted">You can now delete SETUP_TOKEN from Vercel.</p>
      </div>
    );
  }
  return (
    <form action={action} className="card space-y-4">
      <div>
        <label className="label" htmlFor="token">Setup code (SETUP_TOKEN from Vercel)</label>
        <input id="token" name="token" type="password" autoComplete="off" required className="field" />
      </div>
      <div>
        <label className="label" htmlFor="email">Your admin email</label>
        <input id="email" name="email" type="email" inputMode="email" defaultValue={state.email} autoComplete="username" required className="field" />
      </div>
      <div>
        <label className="label" htmlFor="password">Admin password (10+ characters)</label>
        <input id="password" name="password" type="password" autoComplete="new-password" minLength={10} required className="field" />
      </div>
      {state.error && <p role="alert" className="rounded-xl bg-danger/10 px-3 py-2 text-sm font-semibold text-danger">{state.error}</p>}
      <SubmitButton pendingText="Setting up…">Create tables and admin</SubmitButton>
    </form>
  );
}
