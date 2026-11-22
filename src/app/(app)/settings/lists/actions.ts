"use server";

import { revalidatePath } from "next/cache";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { categories, platforms, postalServices, shops, users } from "@/db/schema";
import { requireWritableUser } from "@/lib/auth";

export type ListState = { error?: string };

function revalidateSettingsLists() {
  revalidatePath("/settings/lists");
  revalidatePath("/settings/platforms");
  revalidatePath("/settings/targets");
}

const TABLES = { shops, categories, postal: postalServices, platforms } as const;
type Kind = keyof typeof TABLES;

function kindOf(v: FormDataEntryValue | null): Kind | null {
  return v === "shops" || v === "categories" || v === "postal" || v === "platforms" ? v : null;
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
  revalidateSettingsLists();
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
  revalidateSettingsLists();
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
  revalidateSettingsLists();
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

export async function updateFeesAction(_prev: ListState & { ok?: boolean }, formData: FormData): Promise<ListState & { ok?: boolean }> {
  const user = await requireWritableUser();
  const mine = await db.select({ id: platforms.id }).from(platforms).where(eq(platforms.userId, user.id));
  const updates: { id: number; fee: string }[] = [];
  for (const { id } of mine) {
    const raw = String(formData.get(`fee_${id}`) ?? "").replace(/[%\s]/g, "").replace(",", ".");
    if (raw === "") { updates.push({ id, fee: "0.00" }); continue; }
    const n = Number(raw);
    if (!/^\d+(\.\d{1,2})?$/.test(raw) || !Number.isFinite(n) || n > 100) return { error: "Fees must be a percentage between 0 and 100." };
    updates.push({ id, fee: n.toFixed(2) });
  }
  await db.transaction(async (tx) => {
    for (const u of updates) await tx.update(platforms).set({ feePercent: u.fee }).where(and(eq(platforms.id, u.id), eq(platforms.userId, user.id)));
  });
  revalidateSettingsLists();
  return { ok: true };
}
