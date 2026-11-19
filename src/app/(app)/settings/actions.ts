"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { destroySession } from "@/lib/session";
import { COLOR_MODES, THEME_IDS } from "@/lib/themes";

export async function updateAppearanceAction(formData: FormData) {
  const user = await requireUser();
  const theme = String(formData.get("theme") ?? "");
  const mode = String(formData.get("mode") ?? "");
  const patch: { theme?: string; colorMode?: string } = {};
  if (theme && THEME_IDS.includes(theme)) patch.theme = theme;
  if (mode && (COLOR_MODES as readonly string[]).includes(mode)) patch.colorMode = mode;
  if (Object.keys(patch).length) {
    await db.update(users).set(patch).where(eq(users.id, user.id));
    revalidatePath("/", "layout");
  }
}

export async function logoutAction() {
  await destroySession();
  redirect("/login");
}
