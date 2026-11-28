"use client";

import { useRef, useState } from "react";
import { shrinkPhoto } from "@/lib/shrink-photo";
import type { Suggestion } from "@/lib/ai-rules";

/**
 * "Suggest details from photo": sits under the photo on the Add item screen (only when the admin has switched it on).
 * Sends the item photo, and an optional photo of the tag, to the server, then asks the form to fill in the empty fields.
 * It only suggests: nothing is saved until the person taps Save.
 */
export function AiSuggest({ photo, onApply }: { photo: Blob | null; onApply: (s: Suggestion) => string[] }) {
  const [tag, setTag] = useState<Blob | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const input = useRef<HTMLInputElement>(null);

  async function onTag(file: File | undefined) {
    if (!file) return;
    try {
      setTag(await shrinkPhoto(file, 1024));
      setNote(null);
    } catch {
      setNote({ ok: false, text: "Couldn't read that photo. Try a different one." });
    }
    if (input.current) input.current.value = "";
  }

  async function suggest() {
    if (!photo) return;
    setBusy(true);
    setNote(null);
    try {
      const body = new FormData();
      body.append("photo", new File([photo], "photo.jpg", { type: "image/jpeg" }));
      if (tag) body.append("tag", new File([tag], "tag.jpg", { type: "image/jpeg" }));
      const res = await fetch("/api/ai/suggest", { method: "POST", body });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.suggestion) {
        setNote({ ok: false, text: json.error ?? "Couldn't read that photo just now. You can fill the details in yourself." });
        return;
      }
      const filled = onApply(json.suggestion as Suggestion);
      setNote({
        ok: true,
        text: filled.length
          ? `Filled in the ${filled.join(", ")}. Please check ${filled.length === 1 ? "it" : "them"} before saving.`
          : "Nothing new to fill in. The boxes already have something in them, or the photo didn't show enough.",
      });
    } catch {
      setNote({ ok: false, text: "Couldn't reach the server. You can fill the details in yourself." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2 rounded-2xl border border-border bg-surface-2 p-3" data-ai-suggest>
      <input ref={input} type="file" accept="image/*" className="hidden" onChange={(e) => onTag(e.target.files?.[0])} />
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={suggest} disabled={!photo || busy} className="btn-soft">
          {busy ? "Looking at the photo…" : "✨ Suggest details from photo"}
        </button>
        {photo && (
          tag ? (
            <button type="button" onClick={() => setTag(null)} className="text-sm font-bold text-danger">Remove tag photo</button>
          ) : (
            <button type="button" onClick={() => input.current?.click()} className="text-sm font-bold text-primary">+ Tag photo (helps with brand and size)</button>
          )
        )}
      </div>
      {tag && <p className="text-xs font-bold text-muted">Tag photo ready. It is only used for the suggestion and isn&rsquo;t saved.</p>}
      {!photo && <p className="text-xs text-muted">Add a photo of the item first.</p>}
      {note && <p role={note.ok ? "status" : "alert"} className={`text-sm font-semibold ${note.ok ? "text-success" : "text-danger"}`}>{note.text}</p>}
    </div>
  );
}
