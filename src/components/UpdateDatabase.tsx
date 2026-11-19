"use client";

import { useState, useTransition } from "react";
import { updateDatabaseAction, type DbUpdateState } from "@/app/(app)/admin/actions";

export function UpdateDatabase({ pending }: { pending: number | null }) {
  const [state, setState] = useState<DbUpdateState>({});
  const [busy, start] = useTransition();
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted">
        {pending === null
          ? "Couldn't check the database right now."
          : pending === 0
            ? "Your database is up to date."
            : `${pending} database update${pending === 1 ? " is" : "s are"} waiting.`}
      </p>
      <button
        type="button"
        disabled={busy}
        onClick={() => start(async () => setState(await updateDatabaseAction()))}
        className={pending ? "btn w-full" : "btn-soft w-full"}
      >
        {busy ? "Updating…" : "Update database"}
      </button>
      {state.message && (
        <p role="status" className={`rounded-xl px-3 py-2 text-sm font-semibold ${state.ok ? "bg-success/10 text-success" : "bg-danger/10 text-danger"}`}>
          {state.message}
        </p>
      )}
    </div>
  );
}
