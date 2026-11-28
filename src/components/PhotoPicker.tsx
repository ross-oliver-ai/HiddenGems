"use client";

import { useRef, useState } from "react";
import { shrinkPhoto } from "@/lib/shrink-photo";

export function PhotoPicker({
  initialUrl,
  onPhoto,
  tile = false,
}: {
  initialUrl?: string | null;
  /** Called with the shrunk photo as soon as it is ready (while it uploads), and with null when it is removed or the upload fails (used by the AI). */
  onPhoto?: (photo: Blob | null) => void;
  /** A big square "Item" tile with its caption underneath (the Add item screen when the AI is on), instead of the small tile beside its caption. */
  tile?: boolean;
}) {
  const [url, setUrl] = useState(initialUrl ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const input = useRef<HTMLInputElement>(null);

  async function onFile(file: File | undefined) {
    if (!file) return;
    setError("");
    setBusy(true);
    try {
      const small = await shrinkPhoto(file).catch(() => {
        throw new Error("Couldn't read that photo. Try a different one (JPEG or PNG).");
      });
      onPhoto?.(small); // the AI can start reading it while it uploads
      const body = new FormData();
      body.append("file", new File([small], "photo.jpg", { type: "image/jpeg" }));
      const res = await fetch("/api/upload", { method: "POST", body });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "Upload failed.");
      setUrl(json.url);
    } catch (e) {
      onPhoto?.(null);
      setError(e instanceof Error && e.message ? e.message : "Couldn't add that photo.");
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  if (tile) {
    return (
      <div>
        <input type="hidden" name="photoUrl" value={url} />
        <input ref={input} type="file" accept="image/*" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
        <button
          type="button"
          onClick={() => input.current?.click()}
          disabled={busy}
          className="relative flex aspect-square w-full items-center justify-center overflow-hidden rounded-2xl border-2 border-dashed border-border bg-surface-2 text-muted"
          aria-label={url ? "Change item photo" : "Add item photo"}
        >
          {url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={url} alt="Item" className="h-full w-full object-cover" />
          ) : (
            <span className="flex flex-col items-center gap-1"><span className="text-4xl" aria-hidden>📷</span><span className="text-sm font-extrabold">Item photo</span></span>
          )}
          {busy && <span className="absolute inset-0 flex items-center justify-center bg-background/70 text-xs font-bold">Uploading…</span>}
        </button>
        <p className="mt-1 flex min-h-5 items-center justify-between text-sm">
          <span className="font-bold">{url ? "Item" : "Take this first"}</span>
          {url && <button type="button" onClick={() => { setUrl(""); onPhoto?.(null); }} className="font-bold text-danger">Remove</button>}
        </p>
        {error && <p role="alert" className="mt-1 text-sm font-semibold text-danger">{error}</p>}
      </div>
    );
  }

  return (
    <div>
      <input type="hidden" name="photoUrl" value={url} />
      <input ref={input} type="file" accept="image/*" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => input.current?.click()}
          disabled={busy}
          className="relative flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-2xl border-2 border-dashed border-border bg-surface-2 text-muted"
          aria-label={url ? "Change photo" : "Add photo"}
        >
          {url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={url} alt="Item" className="h-full w-full object-cover" />
          ) : (
            <span className="text-3xl" aria-hidden>📷</span>
          )}
          {busy && <span className="absolute inset-0 flex items-center justify-center bg-background/70 text-xs font-bold">Uploading…</span>}
        </button>
        <div className="text-sm">
          <p className="font-bold">{url ? "Photo added" : "Photo (optional)"}</p>
          {url && (
            <button type="button" onClick={() => { setUrl(""); onPhoto?.(null); }} className="font-bold text-danger">Remove</button>
          )}
          {error && <p role="alert" className="mt-1 font-semibold text-danger">{error}</p>}
        </div>
      </div>
    </div>
  );
}
