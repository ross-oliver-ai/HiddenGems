"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { shrinkPhoto } from "@/lib/shrink-photo";

/**
 * The "Tag (optional)" tile next to the item photo on Add item. The tag photo is only for the AI to read the brand and size:
 * it is kept in memory, never uploaded or saved.
 */
export function TagPhotoPicker({ tag, onTag }: { tag: Blob | null; onTag: (tag: Blob | null) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState("");
  const preview = useMemo(() => (tag ? URL.createObjectURL(tag) : ""), [tag]);
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  async function onFile(file: File | undefined) {
    if (!file) return;
    setError("");
    try {
      onTag(await shrinkPhoto(file, 1280));
    } catch {
      setError("Couldn't read that photo. Try a different one.");
    }
    if (input.current) input.current.value = "";
  }

  return (
    <div>
      <input ref={input} type="file" accept="image/*" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
      <button
        type="button"
        onClick={() => input.current?.click()}
        className="relative flex aspect-square w-full items-center justify-center overflow-hidden rounded-2xl border-2 border-dashed border-border bg-surface-2 text-muted"
        aria-label={tag ? "Change tag photo" : "Add tag photo"}
        data-tag-tile
      >
        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={preview} alt="Tag" className="h-full w-full object-cover" />
        ) : (
          <span className="flex flex-col items-center gap-1 px-2 text-center"><span className="text-4xl" aria-hidden>🏷️</span><span className="text-sm font-extrabold">Tag photo</span></span>
        )}
      </button>
      <p className="mt-1 flex min-h-5 items-center justify-between text-sm">
        <span className="font-bold">{tag ? "Tag (not saved)" : "Tag (optional)"}</span>
        {tag && <button type="button" onClick={() => onTag(null)} className="font-bold text-danger">Remove</button>}
      </p>
      {error && <p role="alert" className="mt-1 text-sm font-semibold text-danger">{error}</p>}
    </div>
  );
}
