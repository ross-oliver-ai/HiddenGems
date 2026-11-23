import Link from "next/link";
import { hideChecklistAction } from "@/app/(app)/checklist-actions";
import { nextStep, type ChecklistStep } from "@/lib/checklist-steps";

/** The first-run checklist on Home. Steps tick themselves from the person's own data. */
export function Checklist({ steps }: { steps: ChecklistStep[] }) {
  const doneCount = steps.filter((s) => s.done).length;
  const next = nextStep(steps);
  return (
    <section className="card space-y-3" data-checklist>
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="font-extrabold">Getting started</h2>
        <span className="text-sm font-bold text-muted">{doneCount} of {steps.length} done</span>
      </div>
      <ol className="space-y-2">
        {steps.map((s) => {
          const body = (
            <>
              <span
                aria-hidden
                className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-extrabold ${s.done ? "bg-success text-white" : "bg-primary-soft text-primary"}`}
              >
                {s.done ? "✓" : steps.indexOf(s) + 1}
              </span>
              <span className="min-w-0">
                <span className={`block font-bold ${s.done ? "text-muted line-through" : ""}`}>{s.title}</span>
                {!s.done && <span className="block text-sm text-muted">{s.href ? s.hint : s.blockedHint}</span>}
              </span>
            </>
          );
          return (
            <li key={s.id} data-checklist-step={s.id} data-done={s.done}>
              {!s.done && s.href ? (
                <Link href={s.href} className="flex items-start gap-3 rounded-2xl p-1 active:bg-primary-soft">{body}</Link>
              ) : (
                <div className="flex items-start gap-3 p-1">{body}</div>
              )}
            </li>
          );
        })}
      </ol>
      {next && <Link href={next.href!} className="btn w-full">{next.title}</Link>}
      <form action={hideChecklistAction}>
        <button type="submit" className="w-full py-1 text-sm font-bold text-muted underline">Hide this</button>
      </form>
    </section>
  );
}
