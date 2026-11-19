"use client";

import { useEffect, useRef } from "react";

/** A short burst of confetti over the whole screen. Does nothing if the phone asks for reduced motion. */
export function Confetti() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      canvas?.remove();
      return;
    }
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = window.innerWidth;
    const h = window.innerHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.scale(dpr, dpr);

    const css = getComputedStyle(document.documentElement);
    const colours = [
      css.getPropertyValue("--primary").trim() || "#d9638b",
      css.getPropertyValue("--accent").trim() || "#f6a5c0",
      "#f7c948",
      "#52c58d",
      "#8a6fe0",
    ];

    type P = { x: number; y: number; vx: number; vy: number; s: number; r: number; vr: number; c: string; round: boolean };
    const parts: P[] = Array.from({ length: 110 }, (_, i) => {
      const fromLeft = i % 2 === 0;
      const angle = (fromLeft ? -60 : -120) * (Math.PI / 180) + (Math.random() - 0.5) * 0.9;
      const speed = 9 + Math.random() * 9;
      return {
        x: fromLeft ? w * 0.1 : w * 0.9,
        y: h * 0.62,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        s: 6 + Math.random() * 6,
        r: Math.random() * Math.PI * 2,
        vr: (Math.random() - 0.5) * 0.4,
        c: colours[Math.floor(Math.random() * colours.length)],
        round: Math.random() < 0.3,
      };
    });

    let raf = 0;
    const start = performance.now();
    const frame = (now: number) => {
      const t = now - start;
      ctx.clearRect(0, 0, w, h);
      const fade = t > 2200 ? Math.max(0, 1 - (t - 2200) / 600) : 1;
      for (const p of parts) {
        p.vy += 0.32;
        p.vx *= 0.99;
        p.x += p.vx;
        p.y += p.vy;
        p.r += p.vr;
        ctx.save();
        ctx.globalAlpha = fade;
        ctx.translate(p.x, p.y);
        ctx.rotate(p.r);
        ctx.fillStyle = p.c;
        if (p.round) {
          ctx.beginPath();
          ctx.arc(0, 0, p.s / 2, 0, Math.PI * 2);
          ctx.fill();
        } else {
          ctx.fillRect(-p.s / 2, -p.s / 4, p.s, p.s / 2);
        }
        ctx.restore();
      }
      if (t < 2800) raf = requestAnimationFrame(frame);
      else canvas.remove();
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, []);

  return <canvas ref={ref} aria-hidden="true" className="pointer-events-none fixed inset-0 z-50 h-full w-full" />;
}
