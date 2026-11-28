import type { AiImage } from "@/lib/ai-claude";
import { blobPhotoUrl } from "@/lib/photo-url";

/** The browser shrinks photos to about 300 KB first; this only stops abuse. */
export const AI_MAX_IMAGE_BYTES = 1_500_000;
const TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

export function aiMediaType(type: string): AiImage["mediaType"] | null {
  return TYPES.find((t) => t === type) ?? null;
}

/** An uploaded file as an AI image: null when nothing was sent, "bad" when it can't be used (wrong type or too big). */
export async function readImageFile(file: FormDataEntryValue | null): Promise<AiImage | "bad" | null> {
  if (file === null || file === "") return null;
  if (!(file instanceof File) || file.size === 0) return null;
  const type = aiMediaType(file.type);
  if (!type || file.size > AI_MAX_IMAGE_BYTES) return "bad";
  return { mediaType: type, base64: Buffer.from(await file.arrayBuffer()).toString("base64") };
}

/** Downloads a saved item photo so the AI can read it. Returns null for anything that isn't one of our own photos or can't be read. */
export async function fetchItemPhoto(url: string, fetchImpl: typeof fetch = fetch): Promise<AiImage | null> {
  const safe = blobPhotoUrl(url);
  if (!safe) return null;
  try {
    const res = await fetchImpl(safe, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) return null;
    const mediaType = aiMediaType((res.headers.get("content-type") ?? "").split(";")[0].trim());
    const bytes = Buffer.from(await res.arrayBuffer());
    if (!mediaType || bytes.length === 0 || bytes.length > AI_MAX_IMAGE_BYTES) return null;
    return { mediaType, base64: bytes.toString("base64") };
  } catch {
    return null;
  }
}

