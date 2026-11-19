"use client";

import { useActionState } from "react";
import { addEntryAction, renameEntryAction, toggleArchiveAction, type ListState } from "@/app/(app)/settings/lists/actions";
import { SubmitButton } from "./SubmitButton";

type Entry = { id: number; name: string; archived: boolean };

export function ListManager({
  kind,
  title,
  hint,
  entries,
}: {
  kind: "shops" | "categories" | "postal";
  title: string;
  hint: string;
  entries: Entry[];
}) {
  const [state, action] = useActionState<ListState, FormData>(addEntryAction, {});
  return (
    <section className="card space-y-3">
      <div>
        <h2 className="font-extrabold">{title}</h2>
        <p className="text-sm text-muted">{hint}</p>
      </div>
      <form action={action} key={entries.length} className="flex gap-2">
        <input type="hidden" name="kind" value={kind} />
        <input name="name" placeholder="Add new…" maxLength={60} required className="field" autoComplete="off" />
        <SubmitButton className="btn-soft shrink-0" pendingText="…">Add</SubmitButton>
      </form>
      {state.error && <p role="alert" className="text-sm font-semibold text-danger">{state.error}</p>}
      <ul className="divide-y divide-border">
        {entries.length === 0 && <li className="py-2 text-sm text-muted">Nothing here yet.</li>}
        {entries.map((e) => (
          <li key={e.id} className="flex items-center gap-2 py-2">
            <form action={renameEntryAction} className="flex min-w-0 flex-1 items-center gap-2">
              <input type="hidden" name="kind" value={kind} />
              <input type="hidden" name="id" value={e.id} />
              <input
                name="name"
                defaultValue={e.name}
                maxLength={60}
                aria-label={`Rename ${e.name}`}
                className={`min-w-0 flex-1 rounded-xl bg-transparent px-2 py-2 font-semibold outline-none focus:bg-surface-2 ${e.archived ? "text-muted line-through" : ""}`}
              />
              <button type="submit" className="text-sm font-bold text-primary">Save</button>
            </form>
            <form action={toggleArchiveAction}>
              <input type="hidden" name="kind" value={kind} />
              <input type="hidden" name="id" value={e.id} />
              <button type="submit" className="rounded-xl px-2 py-2 text-sm font-bold text-muted">
                {e.archived ? "Restore" : "Hide"}
              </button>
            </form>
          </li>
        ))}
      </ul>
    </section>
  );
}
