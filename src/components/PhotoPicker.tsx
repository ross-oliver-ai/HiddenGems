"use client";

import { useRef, useState } from "react";

const MAX_SIDE = 1280;

async function shrink(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("resize failed"))), "image/jpeg", 0.82),
  );
}

export function PhotoPicker({ initialUrl }: { initialUrl?: string | null }) {
  const [url, setUrl] = useState(initialUrl ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const input = useRef<HTMLInputElement>(null);

  async function onFile(file: File | undefined) {
    if (!file) return;
    setError("");
    setBusy(true);
    try {
      const small = await shrink(file).catch(() => {
        throw new Error("Couldn't read that photo. Try a different one (JPEG or PNG).");
      });
      const body = new FormData();
      body.append("file", new File([small], "photo.jpg", { type: "image/jpeg" }));
      const res = await fetch("/api/upload", { method: "POST", body });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "Upload failed.");
      setUrl(json.url);
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : "Couldn't add that photo.");
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
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
            <button type="button" onClick={() => setUrl("")} className="font-bold text-danger">Remove</button>
          )}
          {error && <p role="alert" className="mt-1 font-semibold text-danger">{error}</p>}
        </div>
      </div>
    </div>
  );
}
