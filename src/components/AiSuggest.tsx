"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Suggestion } from "@/lib/ai-rules";

export type AiNote = { ok: boolean; text: string } | null;

/**
 * Reads the item photo (and the tag photo, once there is one) by itself as soon as it is added: no button.
 * Adding the tag photo runs it again, so brand and size can be filled in. `onApply` puts the answer in the form and returns
 * the names of the boxes it filled. Nothing is saved until the person taps Save.
 */
export function useAiSuggest({
  enabled,
  photo,
  tag,
  onApply,
}: {
  enabled: boolean;
  photo: Blob | null;
  tag: Blob | null;
  onApply: (s: Suggestion) => string[];
}) {
  const [working, setWorking] = useState(false);
  const [note, setNote] = useState<AiNote>(null);
  const run = useRef(0);
  const apply = useRef(onApply);
  useEffect(() => {
    apply.current = onApply;
  });

  const start = useCallback(async () => {
    const mine = ++run.current;
    if (!enabled || !photo) {
      setWorking(false);
      setNote(null);
      return;
    }
    setWorking(true);
    setNote(null);
    try {
      const body = new FormData();
      body.append("photo", new File([photo], "photo.jpg", { type: "image/jpeg" }));
      if (tag) body.append("tag", new File([tag], "tag.jpg", { type: "image/jpeg" }));
      const res = await fetch("/api/ai/suggest", { method: "POST", body });
      const json = await res.json().catch(() => ({}));
      if (mine !== run.current) return; // a newer photo has taken over
      if (!res.ok || !json.suggestion) {
        setNote({ ok: false, text: json.error ?? "Couldn't read that photo just now. You can fill the details in yourself." });
        return;
      }
      const filled = apply.current(json.suggestion as Suggestion);
      setNote({
        ok: true,
        text: filled.length
          ? `Filled in the ${filled.join(", ")}. Please check ${filled.length === 1 ? "it" : "them"} before saving.`
          : "Nothing new to fill in. The photo didn't show enough, or the boxes already have something in them.",
      });
    } catch {
      if (mine === run.current) setNote({ ok: false, text: "Couldn't reach the server. You can fill the details in yourself." });
    } finally {
      if (mine === run.current) setWorking(false);
    }
  }, [enabled, photo, tag]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- starts the request when a photo is added or changed
    void start();
  }, [start]);

  return { working, note, retry: start };
}

/** The one line under the photos that says what the AI is doing. */
export function AiSuggestStatus({ working, note, hasPhoto, retry }: { working: boolean; note: AiNote; hasPhoto: boolean; retry: () => void }) {
  return (
    <div className="min-h-5 text-sm" data-ai-suggest data-ai-working={working ? "1" : "0"}>
      {working && <p role="status" className="font-bold text-primary">✨ Reading the photo… you can carry on and save.</p>}
      {!working && note && (
        <p role={note.ok ? "status" : "alert"} className={`font-semibold ${note.ok ? "text-success" : "text-danger"}`}>
          {note.text}{" "}
          {!note.ok && hasPhoto && <button type="button" onClick={retry} className="font-bold text-primary underline">Try again</button>}
        </p>
      )}
      {!working && !note && !hasPhoto && <p className="text-muted">✨ Add the item photo and the details fill themselves in. A tag photo helps with brand and size.</p>}
    </div>
  );
}
