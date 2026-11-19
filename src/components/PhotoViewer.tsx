"use client";

import { useEffect, useState } from "react";

/** Shows the whole photo (uncropped). Tap it to open full screen; tap the photo again to zoom, or pinch. */
export function PhotoViewer({ src, alt }: { src: string; alt: string }) {
  const [open, setOpen] = useState(false);
  const [zoomed, setZoomed] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function close() {
    setOpen(false);
    setZoomed(false);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="relative block w-full overflow-hidden rounded-2xl bg-surface-2"
        aria-label="View photo full screen"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt={alt} className="mx-auto max-h-96 w-full object-contain" />
        <span className="absolute bottom-2 right-2 rounded-full bg-black/55 px-3 py-1 text-xs font-bold text-white">Tap to enlarge</span>
      </button>

      {open && (
        <div role="dialog" aria-modal="true" aria-label="Photo" className="fixed inset-0 z-50 bg-black/95">
          <button
            type="button"
            onClick={close}
            aria-label="Close photo"
            className="absolute right-3 z-10 flex h-11 w-11 items-center justify-center rounded-full bg-white/20 text-2xl font-bold text-white"
            style={{ top: "calc(env(safe-area-inset-top) + 0.75rem)" }}
          >
            ×
          </button>
          <div
            className="h-full w-full overflow-auto"
            style={{ touchAction: "pan-x pan-y pinch-zoom", WebkitOverflowScrolling: "touch" }}
          >
            <div className={zoomed ? "flex min-h-full min-w-full items-center justify-center" : "flex h-full w-full items-center justify-center"}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={src}
                alt={alt}
                onClick={() => setZoomed((z) => !z)}
                className={zoomed ? "max-w-none shrink-0 cursor-zoom-out" : "max-h-full max-w-full cursor-zoom-in object-contain"}
                style={zoomed ? { width: "250%" } : undefined}
                draggable={false}
              />
            </div>
          </div>
          <p className="pointer-events-none absolute inset-x-0 bottom-4 text-center text-xs font-semibold text-white/70" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
            Tap the photo to zoom, pinch to adjust
          </p>
        </div>
      )}
    </>
  );
}
