"use client";

import { useActionState } from "react";
import { updateTargetsAction } from "@/app/(app)/settings/lists/actions";
import { SubmitButton } from "./SubmitButton";

export function TargetsForm({ goal, stale }: { goal: string | null; stale: number }) {
  const [state, action] = useActionState(updateTargetsAction, {} as { error?: string; ok?: boolean });
  return (
    <form action={action} className="space-y-3">
      <div>
        <label className="label" htmlFor="goal">Monthly profit goal (£)</label>
        <input id="goal" name="goal" inputMode="decimal" defaultValue={goal ?? ""} placeholder="e.g. 200" className="field" />
      </div>
      <div>
        <label className="label" htmlFor="stale">Flag listings as stale after (days)</label>
        <input id="stale" name="stale" type="number" inputMode="numeric" min={1} max={365} defaultValue={stale} className="field" />
      </div>
      {state.error && <p role="alert" className="text-sm font-semibold text-danger">{state.error}</p>}
      {state.ok && <p role="status" className="text-sm font-semibold text-success">Saved.</p>}
      <SubmitButton className="btn-soft w-full" pendingText="Saving…">Save targets</SubmitButton>
    </form>
  );
}
