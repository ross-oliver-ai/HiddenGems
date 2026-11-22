"use client";

import { useActionState } from "react";
import { updateFeesAction } from "@/app/(app)/settings/lists/actions";
import { SubmitButton } from "./SubmitButton";

type P = { id: number; name: string; feePercent: string; archived: boolean };

/** Optional selling fee for each platform, as a % of the sold price. It only pre-fills the fee when you mark an item sold. */
export function PlatformFeesForm({ platforms }: { platforms: P[] }) {
  const [state, action] = useActionState(updateFeesAction, {} as { error?: string; ok?: boolean });
  const shown = platforms.filter((p) => !p.archived);
  return (
    <section className="card space-y-3">
      <div>
        <h2 className="font-extrabold">Selling fees</h2>
        <p className="text-sm text-muted">
          Optional. If a platform charges you a percentage, enter it and the fee is filled in for you when you mark an item sold (you can still change it each time). Leave at 0 if there are none.
        </p>
      </div>
      <form action={action} className="space-y-3">
        {shown.map((p) => (
          <div key={p.id} className="flex items-center justify-between gap-3">
            <label className="font-semibold" htmlFor={`fee_${p.id}`}>{p.name}</label>
            <div className="flex w-32 items-center gap-2">
              <input id={`fee_${p.id}`} name={`fee_${p.id}`} inputMode="decimal" defaultValue={Number(p.feePercent) > 0 ? p.feePercent : ""} placeholder="0" className="field" />
              <span aria-hidden className="font-bold text-muted">%</span>
            </div>
          </div>
        ))}
        {state.error && <p role="alert" className="text-sm font-semibold text-danger">{state.error}</p>}
        {state.ok && <p role="status" className="text-sm font-semibold text-success">Saved.</p>}
        <SubmitButton className="btn-soft w-full" pendingText="Saving…">Save fees</SubmitButton>
      </form>
    </section>
  );
}
