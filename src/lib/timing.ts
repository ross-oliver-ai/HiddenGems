import { cache } from "react";

/** One list of timings per page request (React's cache is per request on the server) */
const store = cache(() => ({ entries: [] as { label: string; ms: number }[] }));

/** Runs `fn`, noting how long it took. Costs nothing unless the readout is shown. */
export async function timed<T>(label: string, fn: () => Promise<T>): Promise<T> {
  const start = performance.now();
  try {
    return await fn();
  } finally {
    store().entries.push({ label, ms: Math.round(performance.now() - start) });
  }
}

export function timings() {
  return store().entries;
}
