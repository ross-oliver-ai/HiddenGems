"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { isAiModel } from "@/lib/ai-pricing";
import { saveAiSettings } from "@/lib/ai-service";

export type AiSettingsState = { ok?: string; error?: string };

const schema = z.object({
  model: z.string().refine(isAiModel, "Pick one of the models in the list."),
  limit: z.number().int("The limit must be a whole number.").min(1, "The limit must be at least 1.").max(10000, "The limit can't be more than 10,000."),
  budget: z.number().int("The spend ceiling must be a whole number of pounds.").min(1, "The spend ceiling must be at least £1.").max(1000, "The spend ceiling can't be more than £1,000."),
});

/** Saves the admin's "Suggest details from photo" switches. Admin only; the settings apply to everyone straight away. */
export async function saveAiSettingsAction(_prev: AiSettingsState, form: FormData): Promise<AiSettingsState> {
  await requireAdmin();
  const parsed = schema.safeParse({
    model: String(form.get("model") ?? ""),
    limit: Number(form.get("limit")),
    budget: Number(form.get("budget")),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Those settings aren't valid." };
  const { model, limit, budget } = parsed.data;
  if (!isAiModel(model)) return { error: "Pick one of the models in the list." };
  await saveAiSettings({ enabled: form.get("enabled") === "on", model, monthlyLimitPerUser: limit, monthlyBudgetPounds: budget });
  revalidatePath("/admin/ai");
  revalidatePath("/admin");
  revalidatePath("/items/new");
  return { ok: "Saved. The new settings apply straight away." };
}
