"use client";

import { useEffect, useRef, useState } from "react";
import { Confetti } from "@/components/Confetti";

// Fixed positions so the picture looks the same every time (and on the server)
const BITS: { x: number; y: number; r: number; c: string; round?: boolean; s: number }[] = [
  { x: 6, y: 10, r: 25, c: "var(--primary)", s: 12 },
  { x: 18, y: 4, r: -40, c: "#f7c948", s: 10 },
  { x: 30, y: 14, r: 70, c: "var(--accent)", s: 12 },
  { x: 44, y: 2, r: 15, c: "#52c58d", s: 10, round: true },
  { x: 58, y: 12, r: -20, c: "var(--primary)", s: 11, round: true },
  { x: 71, y: 5, r: 55, c: "#8a6fe0", s: 12 },
  { x: 84, y: 13, r: -60, c: "#f7c948", s: 10 },
  { x: 94, y: 3, r: 35, c: "var(--accent)", s: 12 },
  { x: 3, y: 62, r: 50, c: "#52c58d", s: 11 },
  { x: 11, y: 85, r: -30, c: "var(--primary)", s: 10, round: true },
  { x: 95, y: 58, r: 20, c: "#8a6fe0", s: 11 },
  { x: 90, y: 86, r: -50, c: "var(--accent)", s: 12 },
  { x: 24, y: 94, r: 65, c: "#f7c948", s: 10 },
  { x: 76, y: 95, r: -15, c: "#52c58d", s: 11 },
];

/** A picture of the goal card with the confetti frozen in place. A real burst plays once when you scroll to it. */
export function GoalShowcase() {
  const ref = useRef<HTMLDivElement>(null);
  const [burst, setBurst] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setBurst(true);
          io.disconnect();
        }
      },
      { threshold: 0.7 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div ref={ref} className="relative mx-auto w-full max-w-sm px-3 py-8" aria-label="Example: monthly goal reached">
      <div className="pointer-events-none absolute inset-0" aria-hidden>
        {BITS.map((b, i) => (
          <span
            key={i}
            className="absolute block"
            style={{
              left: `${b.x}%`,
              top: `${b.y}%`,
              width: b.s,
              height: b.round ? b.s : b.s / 2,
              borderRadius: b.round ? 999 : 2,
              background: b.c,
              transform: `rotate(${b.r}deg)`,
            }}
          />
        ))}
      </div>
      <div className="card relative space-y-2 shadow-[0_20px_50px_-20px_color-mix(in_srgb,var(--primary)_45%,transparent)]">
        <div className="flex items-baseline justify-between">
          <p className="font-extrabold">This month&apos;s goal</p>
          <p className="text-sm font-bold">£312.40 of £300.00</p>
        </div>
        <div className="h-3 overflow-hidden rounded-full bg-primary-soft">
          <div className="h-full w-full rounded-full bg-primary" />
        </div>
        <p className="text-sm font-bold text-primary">🎉 Goal smashed!</p>
      </div>
      {burst && <Confetti />}
    </div>
  );
}
