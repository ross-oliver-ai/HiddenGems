"use server";

import { revalidatePath } from "next/cache";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { categories, postalServices, shops, users } from "@/db/schema";
import { requireWritableUser } from "@/lib/auth";

export type ListState = { error?: string };

const TABLES = { shops, categories, postal: postalServices } as const;
type Kind = keyof typeof TABLES;

function kindOf(v: FormDataEntryValue | null): Kind | null {
  return v === "shops" || v === "categories" || v === "postal" ? v : null;
}

export async function addEntryAction(_prev: ListState, formData: FormData): Promise<ListState> {
  const user = await requireWritableUser();
  const kind = kindOf(formData.get("kind"));
  const name = String(formData.get("name") ?? "").trim();
  if (!kind) return { error: "Unknown list." };
  if (!name) return { error: "Enter a name." };
  if (name.length > 60) return { error: "That name is too long." };

  const t = TABLES[kind];
  const [dupe] = await db
    .select({ id: t.id })
    .from(t)
    .where(and(eq(t.userId, user.id), sql`lower(${t.name}) = lower(${name})`))
    .limit(1);
  if (dupe) return { error: "You already have one with that name." };

  await db.insert(t).values({ userId: user.id, name });
  revalidatePath("/settings/lists");
  return {};
}

export async function renameEntryAction(formData: FormData) {
  const user = await requireWritableUser();
  const kind = kindOf(formData.get("kind"));
  const id = Number(formData.get("id"));
  const name = String(formData.get("name") ?? "").trim().slice(0, 60);
  if (!kind || !Number.isInteger(id) || !name) return;
  const t = TABLES[kind];
  await db.update(t).set({ name }).where(and(eq(t.id, id), eq(t.userId, user.id)));
  revalidatePath("/settings/lists");
}

export async function toggleArchiveAction(formData: FormData) {
  const user = await requireWritableUser();
  const kind = kindOf(formData.get("kind"));
  const id = Number(formData.get("id"));
  if (!kind || !Number.isInteger(id)) return;
  const t = TABLES[kind];
  const [row] = await db.select().from(t).where(and(eq(t.id, id), eq(t.userId, user.id))).limit(1);
  if (!row) return;
  await db.update(t).set({ archived: !row.archived }).where(eq(t.id, id));
  revalidatePath("/settings/lists");
}

export async function updateTargetsAction(_prev: ListState & { ok?: boolean }, formData: FormData) {
  const user = await requireWritableUser();
  const goalRaw = String(formData.get("goal") ?? "").replace(/[£\s,]/g, "");
  const stale = Number(formData.get("stale"));
  let goal: string | null = null;
  if (goalRaw) {
    const n = Number(goalRaw);
    if (!Number.isFinite(n) || n < 0 || n > 1_000_000) return { error: "Enter a valid monthly goal." };
    goal = n.toFixed(2);
  }
  if (!Number.isInteger(stale) || stale < 1 || stale > 365) return { error: "Stale days must be between 1 and 365." };
  await db.update(users).set({ monthlyProfitGoal: goal, staleAfterDays: stale }).where(eq(users.id, user.id));
  revalidatePath("/", "layout");
  return { ok: true };
}
