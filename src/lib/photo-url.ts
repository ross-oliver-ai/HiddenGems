/** Only photos that were uploaded to this app's Vercel Blob store are ever stored on an item or fetched by the server. */
export function blobPhotoUrl(v: unknown): string | null {
  const s = String(v ?? "").trim();
  return /^https:\/\/[a-z0-9.-]+\.public\.blob\.vercel-storage\.com\//i.test(s) ? s : null;
}
