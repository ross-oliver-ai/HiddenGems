import { and, asc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { categories } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { entitlement } from "@/lib/billing";
import { suggestDetails } from "@/lib/ai-service";
import { readImageFile } from "@/lib/ai-image";

/** "Suggest details from photo": takes the item photo (and optionally its tag), asks the AI, returns suggested form values.
 *  Nothing is saved except a usage count; neither photo is stored by this route. */
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  if (!entitlement(user).canWrite) return NextResponse.json({ error: "Your trial has ended, so your account is read-only." }, { status: 402 });

  const form = await request.formData().catch(() => null);
  const photo = await readImageFile(form?.get("photo") ?? null);
  const tag = await readImageFile(form?.get("tag") ?? null);
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
