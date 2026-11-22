"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { lifecycleAction } from "@/app/(app)/items/lifecycle";
import type { SendGroup, SendRow } from "@/lib/send-groups";

const when = (n: number) => (n === 0 ? "sold today" : n === 1 ? "sold yesterday" : `sold ${n} days ago`);

/**
 * Parcels waiting to go, grouped by how they're sent, each with a one-tap "Mark as posted" / "Mark as handed over".
 * A tick moves the item on and shows an Undo that stays on screen after the row has gone.
 */
export function SendList({ groups }: { groups: SendGroup[] }) {
  const [pending, start] = useTransition();
  const [undo, setUndo] = useState<{ id: number; text: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  function run(id: number, intent: "post" | "handover" | "undosend", then: () => void) {
    const fd = new FormData();
    fd.set("id", String(id));
    fd.set("intent", intent);
    setError(null);
    start(async () => {
      const r = await lifecycleAction({}, fd);
      if (r.error) setError(r.error);
      else then();
    });
  }

  function tick(row: SendRow) {
    const posted = row.handover === "collected" || row.handover === "delivered" ? false : true;
    run(row.id, posted ? "post" : "handover", () => {
      setUndo({ id: row.id, text: `${row.name}: marked as ${posted ? "posted" : "handed over"}` });
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setUndo(null), 10_000);
    });
  }

  return (
    <div className="space-y-5">
      {groups.length === 0 && (
        <div className="card space-y-1 text-center">
          <p className="font-bold">Nothing waiting to be sent 🎉</p>
          <p className="text-sm text-muted">Sold items show up here until you mark them as posted or handed over.</p>
        </div>
      )}

      {error && <p role="alert" className="rounded-xl bg-danger/10 px-3 py-2 text-sm font-semibold text-danger">{error}</p>}

      {groups.map((g) => (
        <section key={g.key} aria-label={g.title} className="space-y-2">
          <h2 className="flex items-baseline justify-between px-1">
            <span className="text-lg font-extrabold">{g.title}</span>
            <span className="text-sm font-bold text-muted">{g.rows.length} {g.unit}{g.rows.length === 1 ? "" : "s"}</span>
          </h2>
          <ul className="space-y-3">
            {g.rows.map((row) => {
              const inPerson = row.handover === "collected" || row.handover === "delivered";
              return (
                <li key={row.id} className="card space-y-3">
                  <Link href={`/items/${row.id}`} className="flex gap-3 active:opacity-80">
                    <div className="h-14 w-14 shrink-0 overflow-hidden rounded-xl bg-surface-2">
                      {row.photoUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={row.photoUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
                      ) : (
                        <div className="flex h-full items-center justify-center text-xl text-muted" aria-hidden>🛍️</div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-extrabold">{row.name}</p>
                      <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm text-muted">
                        {row.soldOn && <span className="rounded-full bg-surface-2 px-2 py-0.5 text-xs font-bold">{row.soldOn}</span>}
                        <span>{when(row.daysAgo)}</span>
                      </p>
                    </div>
                  </Link>
                  <button type="button" disabled={pending} onClick={() => tick(row)} className="btn-soft w-full">
                    {pending ? "Saving…" : inPerson ? "Mark as handed over" : "Mark as posted"}
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ))}

      {undo && (
        <div role="status" className="fixed inset-x-4 bottom-28 z-30 mx-auto flex max-w-md items-center justify-between gap-3 rounded-2xl bg-foreground px-4 py-3 text-sm font-bold text-background shadow-lg">
          <span className="min-w-0 truncate">{undo.text}</span>
          <button
            type="button"
            disabled={pending}
            onClick={() => run(undo.id, "undosend", () => setUndo(null))}
            className="shrink-0 rounded-full bg-background/20 px-3 py-1 font-extrabold"
          >
            Undo
          </button>
        </div>
      )}
    </div>
  );
}
