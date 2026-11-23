"use client";

import { useActionState } from "react";
import { sendTestAlertAction, type TestAlertState } from "@/app/(app)/admin/alert-actions";
import { SubmitButton } from "./SubmitButton";

export function TestAlertForm() {
  const [state, action] = useActionState<TestAlertState, FormData>(() => sendTestAlertAction(), {});
  return (
    <form action={action} className="space-y-2" data-test-alert>
      {state.error && <p role="alert" className="rounded-xl bg-danger/10 px-3 py-2 text-sm font-semibold text-danger">{state.error}</p>}
      {state.ok && <p role="status" className="rounded-xl bg-success/10 px-3 py-2 text-sm font-semibold text-success">{state.ok}</p>}
      <SubmitButton className="btn-soft w-full" pendingText="Sending…">Send a test alert</SubmitButton>
    </form>
  );
}
