import { timings } from "@/lib/timing";

/** A small "how long did each step take" note at the bottom of a page. Only rendered for admins who add ?timing=1. */
export function TimingReadout() {
  const rows = timings();
  return (
    <div className="rounded-2xl bg-surface-2 p-3 text-xs text-muted" aria-label="Timing readout">
      <p className="font-extrabold">Timing (ms)</p>
      <ul>
        {rows.map((r, i) => (
          <li key={i} className="flex justify-between"><span>{r.label}</span><span className="font-bold">{r.ms}</span></li>
        ))}
      </ul>
    </div>
  );
}
