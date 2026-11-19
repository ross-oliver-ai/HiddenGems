"use client";

import { useActionState } from "react";
import Link from "next/link";
import { joinWaitlistAction, type WaitlistState } from "./actions";
import { SubmitButton } from "@/components/SubmitButton";

export function WaitlistForm({ id = "join" }: { id?: string }) {
  const [state, action] = useActionState<WaitlistState, FormData>(joinWaitlistAction, {});

  if (state.ok) {
    return (
      <div role="status" className="rounded-3xl bg-primary-soft p-5 text-center">
        <p className="text-2xl" aria-hidden>🎉</p>
        <p className="mt-1 text-lg font-extrabold">You&apos;re on the list!</p>
        <p className="mt-1 text-sm text-muted">We&apos;ll email you when your invite is ready.</p>
      </div>
    );
  }

  return (
    <form action={action} className="space-y-3" id={id}>
      <div className="absolute -left-[9999px] h-0 w-0 overflow-hidden" aria-hidden="true">
        <label htmlFor={`${id}-website`}>Leave this empty</label>
        <input id={`${id}-website`} name="website" tabIndex={-1} autoComplete="off" />
      </div>
      <div>
        <label className="label" htmlFor={`${id}-email`}>Your email</label>
        <input
          id={`${id}-email`}
          name="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          required
          maxLength={254}
          defaultValue={state.email}
          placeholder="you@example.com"
          className="field"
        />
      </div>
      {state.error && <p role="alert" className="rounded-xl bg-danger/10 px-3 py-2 text-sm font-semibold text-danger">{state.error}</p>}
      <SubmitButton pendingText="Adding you…">Join the free beta</SubmitButton>
      <p className="text-center text-xs text-muted">
        We&apos;ll only email you about getting access. See our <Link href="/privacy" className="font-bold underline">privacy notice</Link>.
      </p>
    </form>
  );
}
