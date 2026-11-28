import { and, asc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { categories } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { entitlement } from "@/lib/billing";
import { suggestDetails } from "@/lib/ai-service";
import type { AiImage } from "@/lib/ai-claude";

const MAX_BYTES = 1_500_000; // the browser shrinks photos to about 300 KB first; this only stops abuse
const TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

async function readImage(file: FormDataEntryValue | null): Promise<AiImage | "bad" | null> {
  if (file === null || file === "") return null;
  if (!(file instanceof File) || file.size === 0) return null;
  const type = TYPES.find((t) => t === file.type);
  if (!type || file.size > MAX_BYTES) return "bad";
  return { mediaType: type, base64: Buffer.from(await file.arrayBuffer()).toString("base64") };
}

/** "Suggest details from photo": takes the item photo (and optionally its tag), asks the AI, returns suggested form values.
 *  Nothing is saved except a usage count; neither photo is stored by this route. */
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  if (!entitlement(user).canWrite) return NextResponse.json({ error: "Your trial has ended, so your account is read-only." }, { status: 402 });

  const form = await request.formData().catch(() => null);
  const photo = await readImage(form?.get("photo") ?? null);
  const tag = await readImage(form?.get("tag") ?? null);
  if (!photo || photo === "bad" || tag === "bad") return NextResponse.json({ error: "That photo couldn't be used. Try a different one." }, { status: 400 });

  const cats = await db
    .select({ id: categories.id, name: categories.name })
    .from(categories)
    .where(and(eq(categories.userId, user.id), eq(categories.archived, false)))
    .orderBy(asc(categories.name));

  const result = await suggestDetails({ userId: user.id, images: tag ? [photo, tag] : [photo], categories: cats });
  if (!result.ok) return NextResponse.json({ error: result.message }, { status: result.status });
  return NextResponse.json({ suggestion: result.suggestion });
}
