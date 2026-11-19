"use client";

import { useActionState } from "react";
import { lifecycleAction, type LifecycleState } from "@/app/(app)/items/lifecycle";
import { SubmitButton } from "./SubmitButton";

/** A small form that runs one lifecycle step. Inputs are passed in as children. */
export function StepForm({
  itemId,
  intent,
  label,
  tone = "primary",
  children,
}: {
  itemId: number;
  intent: string;
  label: string;
  tone?: "primary" | "soft" | "danger";
  children?: React.ReactNode;
}) {
  const [state, action] = useActionState<LifecycleState, FormData>(lifecycleAction, {});
  const cls = tone === "primary" ? "btn w-full" : tone === "soft" ? "btn-soft w-full" : "btn-danger w-full";
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="id" value={itemId} />
      <input type="hidden" name="intent" value={intent} />
      {children}
      {state.error && <p role="alert" className="rounded-xl bg-danger/10 px-3 py-2 text-sm font-semibold text-danger">{state.error}</p>}
      <SubmitButton className={cls} pendingText="Saving…">{label}</SubmitButton>
    </form>
  );
}
