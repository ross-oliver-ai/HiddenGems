"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { TOURS, isTourName, type TourName } from "@/lib/checklist-steps";

type Box = { top: number; left: number; width: number; height: number };
const PAD = 6;

/**
 * Points at one thing on the page, once, when you arrive from a checklist step (the link carries ?tour=<name>).
 * The target is whatever carries data-tour="<name>". The rest of the screen is dimmed a little and the target is ringed, but nothing is
 * blocked: tapping or typing anywhere fades it. If the target isn't found (a screen changed) it quietly does nothing.
 * The "?tour=" part is removed from the address straight away, so refreshing or sharing the page doesn't bring it back.
 */
export function Spotlight() {
  const params = useSearchParams();
  const pathname = usePathname();
  const wanted = params.get("tour");
  const [active, setActive] = useState<TourName | null>(isTourName(wanted) ? wanted : null);
  const [box, setBox] = useState<Box | null>(null);
  const [seen, setSeen] = useState({ pathname, wanted });

  // Start when you arrive from a checklist step; clear when you move to another page. (Our own removal of "?tour=" below
  // changes `wanted` to null on the same page, which must not clear it.)
  if (seen.pathname !== pathname || seen.wanted !== wanted) {
    setSeen({ pathname, wanted });
    if (isTourName(wanted)) setActive(wanted);
    else if (seen.pathname !== pathname) { setActive(null); setBox(null); }
  }

  // Take "?tour=" out of the address so a refresh or a shared link doesn't bring it back
  useEffect(() => {
    if (!isTourName(wanted)) return;
    const url = new URL(window.location.href);
    url.searchParams.delete("tour");
    window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash);
  }, [wanted]);

  const dismiss = useCallback(() => { setActive(null); setBox(null); }, []);

  // Find the target (the page may still be streaming in), bring it into view and keep the ring on it
  useEffect(() => {
    if (!active) return;
    let stopped = false;
    let el: Element | null = null;
    const measure = () => {
      if (!el || stopped) return;
      const r = el.getBoundingClientRect();
      setBox({ top: r.top - PAD, left: r.left - PAD, width: r.width + PAD * 2, height: r.height + PAD * 2 });
    };
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let tries = 0;
    const find = window.setInterval(() => {
      el = document.querySelector(`[data-tour="${active}"]`);
      if (el) {
        window.clearInterval(find);
        el.scrollIntoView({ block: "center", behavior: reduce ? "auto" : "smooth" });
        measure();
        window.setTimeout(measure, 450); // after the scroll settles
      } else if (++tries > 30) {
        window.clearInterval(find); // not on this screen (it changed): do nothing
        if (!stopped) dismiss();
      }
    }, 100);
    const remeasure = () => window.requestAnimationFrame(measure);
    window.addEventListener("scroll", remeasure, { passive: true });
    window.addEventListener("resize", remeasure);
    // Any tap or key press fades it, but we wait a moment so the tap that brought you here doesn't count
    const armed = window.setTimeout(() => {
      document.addEventListener("pointerdown", dismiss, { capture: true, once: true });
      document.addEventListener("keydown", dismiss, { capture: true, once: true });
    }, 600);
    return () => {
      stopped = true;
      window.clearInterval(find);
      window.clearTimeout(armed);
      window.removeEventListener("scroll", remeasure);
      window.removeEventListener("resize", remeasure);
      document.removeEventListener("pointerdown", dismiss, { capture: true });
      document.removeEventListener("keydown", dismiss, { capture: true });
    };
  }, [active, dismiss]);

  if (!active || !box) return null;
  const below = box.top + box.height + 150 < window.innerHeight;
  const width = Math.min(320, window.innerWidth - 24);
  const left = Math.max(12, Math.min(box.left, window.innerWidth - width - 12));
  return (
    <>
      <div
        aria-hidden
        data-spotlight-ring
        className="spotlight-ring pointer-events-none fixed z-40 rounded-3xl"
        style={{ top: box.top, left: box.left, width: box.width, height: box.height, boxShadow: "0 0 0 9999px rgb(0 0 0 / 0.45)" }}
      />
      <div
        role="status"
        data-spotlight-caption
        className="card fixed z-50 space-y-2 shadow-lg"
        style={{ left, width, ...(below ? { top: box.top + box.height + 14 } : { bottom: window.innerHeight - box.top + 14 }) }}
      >
        <p className="text-sm font-semibold">{TOURS[active]}</p>
        <button type="button" onClick={dismiss} className="btn-soft w-full">Got it</button>
      </div>
    </>
  );
}
