import { put } from "@vercel/blob";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";

const MAX_BYTES = 4 * 1024 * 1024; // Vercel functions accept ~4.5MB request bodies; the browser resizes first

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  // Vercel Blob stores authenticate either with BLOB_READ_WRITE_TOKEN (older stores) or with BLOB_STORE_ID + OIDC (newer ones)
  if (!process.env.BLOB_READ_WRITE_TOKEN && !process.env.BLOB_STORE_ID) {
    return NextResponse.json({ error: "Photo storage isn't set up yet. Connect a Blob store to the Vercel project." }, { status: 501 });
  }

  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "No photo received." }, { status: 400 });
  if (!file.type.startsWith("image/")) return NextResponse.json({ error: "That isn't an image." }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "Photo is too large." }, { status: 413 });

  const blob = await put(`items/${user.id}/photo.jpg`, file, {
    access: "public",
    addRandomSuffix: true,
    contentType: file.type,
  });
  return NextResponse.json({ url: blob.url });
}
